#!/usr/bin/env node
'use strict';

try {
  require('../src/core-identity').verifyManagedCore();
  require('../src/cli.js');
} catch (error) {
  console.error(`AgentHub core refused: ${error.message}`);
  process.exitCode = 1;
}
