// Candidate source only: no owned installer release is available yet.
export const SOURCE_REPOSITORY = 'https://github.com/zaiyemeiyou404/agent-hub';
export const BUILD_GUIDE = `${SOURCE_REPOSITORY}/blob/codex/zai-16-independent-endpoints/docs/aghub/install-candidate.md`;
export const SOURCE_INSTALL_COMMAND = [
  `git clone --branch codex/zai-16-independent-endpoints --single-branch ${SOURCE_REPOSITORY}.git aghub`,
  'cd aghub',
  'npm --prefix packages/agent-connector ci',
  // Select the package via cwd: --prefix on link also changes its global destination.
  'cd packages/agent-connector',
  'npm link',
  'cd ../..',
  'agn --help',
].join('\n');
