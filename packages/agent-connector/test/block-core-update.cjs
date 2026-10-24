// Subprocess guard: legacy implementations must never modify a real npm prefix.
require('node:https').request = () => { throw new Error('TEST_BLOCKED_NETWORK'); };
require('node:child_process').spawnSync = () => { throw new Error('TEST_BLOCKED_PACKAGE_MUTATION'); };
