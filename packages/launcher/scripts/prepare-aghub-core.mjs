import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { execFileSync } from 'node:child_process';
import integrity from '../../agent-connector/src/core-integrity.js';

const launcherRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const repoRoot = path.resolve(launcherRoot, '../..');

export async function prepareCore({ connectorRoot, outputRoot, sourceSha }) {
  if (!/^[a-f0-9]{40}$/.test(sourceSha || '')) throw new Error('A verified source SHA is required');
  // Refuse broad/overlapping destinations before replacing previous staging.
  const dest = path.resolve(outputRoot);
  const source = fs.realpathSync(connectorRoot);
  if (dest === path.parse(dest).root || dest === source || source.startsWith(dest + path.sep) || dest.startsWith(source + path.sep)) throw new Error('Unsafe core staging destination');
  const scratch = dest + '.preparing';
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.rmSync(scratch, { recursive: true, force: true });
  const core = path.join(scratch, 'core');
  fs.mkdirSync(core, { recursive: true });
  const pkg = JSON.parse(fs.readFileSync(path.join(source, 'package.json'), 'utf8'));
  const copy = (from, to) => {
    const stat = fs.lstatSync(from);
    if (stat.isSymbolicLink()) throw new Error(`Source symlink rejected: ${from}`);
    if (stat.isDirectory()) {
      fs.mkdirSync(to, { recursive: true });
      for (const name of fs.readdirSync(from).sort()) copy(path.join(from, name), path.join(to, name));
    } else if (stat.isFile()) {
      fs.mkdirSync(path.dirname(to), { recursive: true });
      fs.copyFileSync(from, to);
      fs.chmodSync(to, stat.mode);
    } else throw new Error(`Unsupported source file: ${from}`);
  };
  for (const name of ['package.json', ...(pkg.files || [])]) {
    const rel = name.replace(/\/$/, '');
    if (!rel || rel.startsWith('/') || rel.includes('..') || rel.includes('\\') || rel.includes(':')) throw new Error(`Invalid package file: ${name}`);
    if (fs.existsSync(path.join(source, rel))) copy(path.join(source, rel), path.join(core, rel));
  }
  // Resolve from the installed, locked source tree, never npm or a global cache.
  const installed = new Map();
  const addDependencies = (packageRoot, packageJson) => {
    const req = createRequire(path.join(packageRoot, 'package.json'));
    for (const name of Object.keys(packageJson.dependencies || {}).sort()) {
      const depJson = req.resolve(name + '/package.json');
      const depRoot = path.dirname(depJson);
      const dep = JSON.parse(fs.readFileSync(depJson, 'utf8'));
      if (installed.has(name)) {
        if (installed.get(name) !== dep.version) throw new Error(`Conflicting core dependency: ${name}`);
        continue;
      }
      installed.set(name, dep.version);
      copy(depRoot, path.join(core, 'node_modules', name));
      addDependencies(depRoot, dep);
    }
  };
  addDependencies(source, pkg);
  for (const name of ['LICENSE', 'NOTICE']) {
    const from = path.join(repoRoot, name);
    if (fs.existsSync(from)) copy(from, path.join(core, 'upstream-notices', name));
  }
  const hashes = Object.fromEntries(integrity.listControlledFiles(core).map(name => [name, integrity.sha256(fs.readFileSync(path.join(core, name)))]));
  const manifest = { schemaVersion: 1, connectorVersion: pkg.version, sourceSha,
    entrypoints: { main: 'src/index.js', cli: 'bin/agent-connector.js' }, hashes };
  integrity.resolveVerifiedCore(manifest, core);
  fs.writeFileSync(path.join(scratch, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
  fs.rmSync(dest, { recursive: true, force: true });
  fs.renameSync(scratch, dest);
  return manifest;
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  let sourceSha = process.env.AGHUB_SOURCE_SHA;
  if (!sourceSha) {
    sourceSha = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: repoRoot, encoding: 'utf8', windowsHide: true }).trim();
    const dirty = execFileSync('git', ['status', '--porcelain', '--', 'packages/agent-connector'], { cwd: repoRoot, encoding: 'utf8', windowsHide: true }).trim();
    if (dirty) throw new Error('Commit Connector changes before preparing a release core');
  }
  const manifest = await prepareCore({ connectorRoot: path.join(repoRoot, 'packages/agent-connector'), outputRoot: path.join(launcherRoot, '.aghub-core'), sourceSha });
  console.log(`AgentHub core ${manifest.connectorVersion} source=${manifest.sourceSha} files=${Object.keys(manifest.hashes).length}`);
}
