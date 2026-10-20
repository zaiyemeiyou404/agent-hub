'use strict';

const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');

const MAX_FILE_SIZE = 50 * 1024 * 1024;
const DEFAULT_SNAPSHOT_DIR = path.join(os.homedir(), '.openagents', 'local-file-snapshots');
const DEFAULT_ROOTS_FILE = path.join(os.homedir(), '.openagents', 'local-file-roots.json');
const TEXT_EXTENSIONS = new Set([
  '.txt', '.md', '.markdown', '.json', '.jsonl', '.csv', '.tsv', '.yaml', '.yml',
  '.toml', '.ini', '.cfg', '.conf', '.log', '.xml', '.html', '.css', '.js', '.jsx',
  '.ts', '.tsx', '.py', '.rb', '.go', '.rs', '.java', '.c', '.h', '.cpp', '.hpp',
  '.sh', '.bash', '.zsh', '.fish', '.ps1', '.sql', '.graphql', '.proto', '.properties',
]);
const ENCRYPTED_EXTENSIONS = new Set(['.gpg', '.pgp', '.age', '.p12', '.pfx', '.kdbx', '.enc']);
const SECRET_NAME_RE = /(^|[._-])(\.env|credentials?|secrets?|id_rsa|id_ed25519|private[_-]?key|keystore)([._-]|$)/i;
const SECRET_CONTENT_RES = [
  /-----BEGIN [A-Z ]*PRIVATE KEY-----/,
  /\b(?:api[_ -]?key|access[_ -]?token|refresh[_ -]?token|client[_ -]?secret|password|passwd|secret)\s*[:=]\s*[^\s"']{6,}/i,
  /\bAKIA[0-9A-Z]{16}\b/,
  /\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/,
];

function safeId(value, label) {
  const id = String(value || '');
  if (!/^[A-Za-z0-9._:-]{1,200}$/.test(id)) throw new Error(`Invalid ${label}`);
  return id;
}

function validateRelativePath(value) {
  const relative = String(value || '');
  if (!relative || relative.includes('\0') || path.isAbsolute(relative) || path.win32.isAbsolute(relative)) {
    throw new Error('File path must be relative to an authorized root');
  }
  const parts = relative.split(/[\\/]+/);
  if (parts.some((part) => !part || part === '.' || part === '..')) {
    throw new Error('File path contains an invalid path component');
  }
  return parts;
}

function loadAuthorizedRoots(file = process.env.OPENAGENTS_LOCAL_FILE_ROOTS_FILE || DEFAULT_ROOTS_FILE) {
  let parsed;
  try {
    parsed = JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (err) {
    if (err && err.code === 'ENOENT') return [];
    throw new Error('Authorized local-file roots configuration is unreadable');
  }
  if (!parsed || !Array.isArray(parsed.roots)) throw new Error('Authorized local-file roots configuration is invalid');
  return parsed.roots.map((root) => ({
    id: safeId(root && root.id, 'root id'),
    path: String(root && root.path || ''),
    agentIds: Array.isArray(root && root.agentIds) ? root.agentIds.map((id) => safeId(id, 'agent id')) : [],
  }));
}

function reason(code, description) {
  return { code, description };
}

function looksBinary(bytes) {
  const sample = bytes.subarray(0, Math.min(bytes.length, 8192));
  if (sample.includes(0)) return true;
  let controls = 0;
  for (const byte of sample) {
    if (byte < 9 || (byte > 13 && byte < 32)) controls += 1;
  }
  return sample.length > 0 && controls / sample.length > 0.05;
}

function classifySnapshot(bytes, filename) {
  const base = path.basename(String(filename || '')).toLowerCase();
  const extension = path.extname(base);
  if (ENCRYPTED_EXTENSIONS.has(extension)) {
    return { classification: 'uncertain', reasons: [reason('encrypted_file', 'Encrypted files require human approval')] };
  }
  const reasons = [];
  if (SECRET_NAME_RE.test(base)) {
    reasons.push(reason('sensitive_filename', 'The filename indicates credentials or secrets'));
  }
  if (looksBinary(bytes)) {
    reasons.push(reason('unsupported_binary', 'Binary content cannot be classified safely'));
    return { classification: reasons.some((item) => item.code === 'sensitive_filename') ? 'sensitive' : 'uncertain', reasons };
  }
  const text = bytes.toString('utf8');
  if (text.includes('\uFFFD')) {
    reasons.push(reason('invalid_text_encoding', 'Text decoding was not lossless'));
    return { classification: reasons.some((item) => item.code === 'sensitive_filename') ? 'sensitive' : 'uncertain', reasons };
  }
  if (SECRET_CONTENT_RES.some((pattern) => pattern.test(text))) {
    reasons.push(reason('credential_pattern', 'Credential-like content was detected'));
  }
  if (reasons.length) return { classification: 'sensitive', reasons };
  if (!TEXT_EXTENSIONS.has(extension)) {
    return { classification: 'uncertain', reasons: [reason('unsupported_type', 'This file type is not supported by the deterministic classifier')] };
  }
  return { classification: 'safe', reasons: [] };
}

function ensureNoSymlinkComponents(rootPath, parts) {
  let current = rootPath;
  for (const part of parts) {
    current = path.join(current, part);
    const stat = fs.lstatSync(current);
    if (stat.isSymbolicLink()) throw new Error('File path contains a symlink');
  }
  return current;
}

function withinRoot(rootReal, targetReal) {
  return targetReal === rootReal || targetReal.startsWith(`${rootReal}${path.sep}`);
}

function snapshotPaths(requestId, snapshotDir) {
  const id = safeId(requestId, 'request id');
  return {
    content: path.join(snapshotDir, `${id}.snapshot`),
    metadata: path.join(snapshotDir, `${id}.json`),
  };
}

function inspectAndSnapshot({
  requestId,
  recipientAgentId,
  rootId,
  relativePath,
  roots = loadAuthorizedRoots(),
  snapshotDir = DEFAULT_SNAPSHOT_DIR,
}) {
  safeId(recipientAgentId, 'recipient agent id');
  safeId(rootId, 'root id');
  const parts = validateRelativePath(relativePath);
  const root = roots.find((item) => item && item.id === rootId);
  if (!root || !root.path) throw new Error('Requested root is not authorized');
  if (!Array.isArray(root.agentIds) || !root.agentIds.includes(recipientAgentId)) {
    throw new Error('Recipient agent is not authorized for this root');
  }
  const rootReal = fs.realpathSync(root.path);
  const target = ensureNoSymlinkComponents(rootReal, parts);
  const targetReal = fs.realpathSync(target);
  if (!withinRoot(rootReal, targetReal)) throw new Error('File path escapes the authorized root');

  const noFollow = fs.constants.O_NOFOLLOW || 0;
  const fd = fs.openSync(targetReal, fs.constants.O_RDONLY | noFollow);
  let bytes;
  try {
    const before = fs.fstatSync(fd);
    if (!before.isFile()) throw new Error('Requested path is not a regular file');
    if (before.size > MAX_FILE_SIZE) throw new Error('File exceeds the 50 MB transfer limit');
    bytes = fs.readFileSync(fd);
    const after = fs.fstatSync(fd);
    if (before.dev !== after.dev || before.ino !== after.ino || before.size !== after.size || before.mtimeMs !== after.mtimeMs) {
      throw new Error('Source file changed while it was being snapshotted');
    }
  } finally {
    fs.closeSync(fd);
  }

  const digest = crypto.createHash('sha256').update(bytes).digest('hex');
  const classification = classifySnapshot(bytes, path.basename(targetReal));
  const paths = snapshotPaths(requestId, snapshotDir);
  fs.mkdirSync(snapshotDir, { recursive: true, mode: 0o700 });
  try { fs.chmodSync(snapshotDir, 0o700); } catch {}
  try {
    fs.writeFileSync(paths.content, bytes, { flag: 'wx', mode: 0o600 });
  } catch (err) {
    if (!err || err.code !== 'EEXIST') throw err;
    const existing = loadSnapshot(requestId, snapshotDir);
    if (existing.sha256 !== digest || existing.size !== bytes.length) throw new Error('Request id is already bound to different snapshot bytes');
    return existing;
  }
  const manifest = {
    protocolVersion: 1,
    requestId,
    recipientAgentId,
    rootId,
    relativePath: parts.join('/'),
    filename: path.basename(targetReal),
    contentType: 'application/octet-stream',
    size: bytes.length,
    sha256: digest,
    classification: classification.classification,
    sensitivityReasons: classification.reasons,
    createdAt: new Date().toISOString(),
  };
  const tmp = `${paths.metadata}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(manifest), { mode: 0o600 });
  fs.renameSync(tmp, paths.metadata);
  return { ...manifest, snapshotPath: paths.content };
}

function loadSnapshot(requestId, snapshotDir = DEFAULT_SNAPSHOT_DIR) {
  const paths = snapshotPaths(requestId, snapshotDir);
  let manifest;
  try {
    manifest = JSON.parse(fs.readFileSync(paths.metadata, 'utf8'));
  } catch {
    throw new Error('Immutable file snapshot is unavailable');
  }
  const bytes = fs.readFileSync(paths.content);
  const digest = crypto.createHash('sha256').update(bytes).digest('hex');
  if (digest !== manifest.sha256 || bytes.length !== manifest.size) {
    throw new Error('Immutable file snapshot failed integrity verification');
  }
  return { ...manifest, snapshotPath: paths.content };
}

function removeSnapshot(requestId, snapshotDir = DEFAULT_SNAPSHOT_DIR) {
  const paths = snapshotPaths(requestId, snapshotDir);
  for (const file of [paths.content, paths.metadata]) {
    try { fs.unlinkSync(file); } catch (err) { if (!err || err.code !== 'ENOENT') throw err; }
  }
}

module.exports = {
  MAX_FILE_SIZE,
  DEFAULT_SNAPSHOT_DIR,
  classifySnapshot,
  inspectAndSnapshot,
  loadAuthorizedRoots,
  loadSnapshot,
  removeSnapshot,
};
