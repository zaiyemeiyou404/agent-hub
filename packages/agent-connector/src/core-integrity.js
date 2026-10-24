'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

function controlledPath(name) {
  if (typeof name !== 'string' || !name || name.includes('\\') || name.includes(':') ||
      name.startsWith('/') || name.split('/').some(p => !p || p === '.' || p === '..')) {
    throw new Error(`Invalid core path: ${name}`);
  }
  return name;
}

function listControlledFiles(root, prefix = '') {
  if (fs.lstatSync(root).isSymbolicLink()) throw new Error(`Core symlink rejected: ${root}`);
  const files = [];
  for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
    const name = prefix + entry.name;
    controlledPath(name);
    if (entry.isSymbolicLink()) throw new Error(`Core symlink rejected: ${name}`);
    if (entry.isDirectory()) files.push(...listControlledFiles(path.join(root, entry.name), name + '/'));
    else if (entry.isFile()) files.push(name);
    else throw new Error(`Unsupported core file: ${name}`);
  }
  return files.sort();
}

function sha256(bytes) { return crypto.createHash('sha256').update(bytes).digest('hex'); }

/** Manifest trust comes from the reviewed build; never discover one in a cache. */
function resolveVerifiedCore(manifest, packagedRoot) {
  if (!manifest || manifest.schemaVersion !== 1) throw new Error('Unsupported core manifest schema');
  if (!/^[a-f0-9]{40}$/.test(manifest.sourceSha || '')) throw new Error('Invalid core source commit');
  if (typeof manifest.connectorVersion !== 'string' || !manifest.connectorVersion) throw new Error('Invalid core version');
  if (!manifest.hashes || typeof manifest.hashes !== 'object' || Array.isArray(manifest.hashes)) throw new Error('Missing core file hashes');
  const expected = Object.keys(manifest.hashes).sort();
  for (const name of expected) {
    controlledPath(name);
    if (!/^[a-f0-9]{64}$/.test(manifest.hashes[name])) throw new Error(`Invalid core hash: ${name}`);
  }
  const entries = manifest.entrypoints;
  if (!entries || entries.main !== 'src/index.js' || entries.cli !== 'bin/agent-connector.js') throw new Error('Invalid core entrypoints');
  for (const name of ['package.json', entries.main, entries.cli]) {
    if (!Object.hasOwn(manifest.hashes, name)) throw new Error(`Core entry not listed: ${name}`);
  }
  // Inspect before realpath so junctions cannot turn a release into another tree.
  const actual = listControlledFiles(packagedRoot);
  const allowed = new Set(expected);
  for (const name of actual) if (!allowed.has(name)) throw new Error(`Unexpected core file: ${name}`);
  const present = new Set(actual);
  for (const name of expected) {
    if (!present.has(name)) throw new Error(`Missing core file: ${name}`);
    if (sha256(fs.readFileSync(path.join(packagedRoot, name))) !== manifest.hashes[name]) throw new Error(`Core hash mismatch: ${name}`);
  }
  const pkg = JSON.parse(fs.readFileSync(path.join(packagedRoot, 'package.json'), 'utf8'));
  if (pkg.version !== manifest.connectorVersion) throw new Error('Core package version mismatch');
  if (pkg.name !== '@zaiyemeiyou/aghub-connector' || pkg.main !== entries.main || pkg.bin?.agn !== entries.cli) throw new Error('Core package identity/entry mismatch');
  const directory = fs.realpathSync(packagedRoot);
  return { directory, version: manifest.connectorVersion, sourceSha: manifest.sourceSha,
    entrypoints: { main: path.join(directory, entries.main), cli: path.join(directory, entries.cli) } };
}

module.exports = { resolveVerifiedCore, listControlledFiles, sha256 };
