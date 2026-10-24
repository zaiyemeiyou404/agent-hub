'use strict';
// AgentHub core upgrades travel with a reviewed repository build. There is no
// registry lookup, npm mutation or legacy opt-in override in the runtime.
function currentVersion() { return require('../package.json').version; }
async function checkForUpdate() { return null; }
async function notifyAndMaybeUpdate() {}
function runUpdate() {
  process.stderr.write('Core updates require a reviewed AgentHub build; in-place registry updates are disabled.\n');
  return false;
}
module.exports = { currentVersion, checkForUpdate, notifyAndMaybeUpdate, runUpdate };
