'use strict';
const fs = require('fs');
const path = require('path');
const { resolveVerifiedCore, sha256 } = require('./core-integrity');
let identity;

function verifyManagedCore() {
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
module.exports = { verifyManagedCore };
