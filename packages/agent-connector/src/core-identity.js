'use strict';
const fs = require('fs');
const path = require('path');
const { resolveVerifiedCore, sha256 } = require('./core-integrity');
let identity;

function verifyManagedCore() {
  // Avoid unhashed ws native addons from NODE_PATH or ancestor node_modules.
  process.env.WS_NO_BUFFER_UTIL = '1';
  process.env.WS_NO_UTF_8_VALIDATE = '1';
  if (identity) return identity;
  const directory = fs.realpathSync(path.resolve(__dirname, '..'));
  const candidates = ['aghub-core-manifest.json', 'manifest.json'].map(name => path.join(directory, '..', name));
  const manifestPath = candidates.find(file => fs.existsSync(file));
  const expected = process.env.AGHUB_CORE_MANIFEST_SHA256;
  if (!manifestPath) {
    if (expected || require('../package.json').aghubManagedCore === true) throw new Error('Managed core manifest missing');
    // Explicit source installation, not a verified binary release.
    identity = { directory, version: require('../package.json').version, sourceSha:null, managed:false };
    return identity;
  }
  const bytes = fs.readFileSync(manifestPath);
  if (expected && sha256(bytes) !== expected) throw new Error('Managed core manifest differs from Launcher');
  const verified = resolveVerifiedCore(JSON.parse(bytes.toString('utf8')), directory);
  identity = { directory:verified.directory, version:verified.version, sourceSha:verified.sourceSha, managed:true };
  return identity;
}
function assertCompatibleDaemon(configDir, expected = verifyManagedCore(), { ignoreSelf = false } = {}) {
  const pidFile = path.join(configDir, 'daemon.pid');
  const statusFile = path.join(configDir, 'daemon.status.json');
  let status = null, statusAge = Infinity, filePid = null;
  try { filePid = Number(fs.readFileSync(pidFile, 'utf8').trim()); } catch {}
  try { status = JSON.parse(fs.readFileSync(statusFile, 'utf8')); statusAge = Date.now() - fs.statSync(statusFile).mtimeMs; } catch {}
  const pids = [...new Set([filePid, status?.pid])].filter(pid => Number.isInteger(pid) && pid > 0 && !(ignoreSelf && pid === process.pid));
  const alive = pids.filter(pid => {
    try { process.kill(pid, 0); return true; } catch (error) { return error.code === 'EPERM'; }
  });
  for (const pid of alive) {
    const core = status?.core;
    if (status?.pid !== pid || !core || core.sourceSha !== expected.sourceSha ||
        core.version !== expected.version || typeof core.directory !== 'string' || path.resolve(core.directory) !== path.resolve(expected.directory)) {
      throw new Error('Incompatible daemon identity/PID. Stop the old daemon deliberately using its original application; no command or signal was sent.');
    }
    if (statusAge > 20000) throw new Error('Uncertain live daemon: status is stale; no command or signal was sent.');
  }
  return alive[0] || null;
}
module.exports = { verifyManagedCore, assertCompatibleDaemon };
