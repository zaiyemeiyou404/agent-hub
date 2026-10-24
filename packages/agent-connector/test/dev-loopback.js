'use strict';

const fs = require('fs');
const path = require('path');

const LOCK = process.env.AGHUB_DEV_LOOPBACK_LOCK || 'G:\\CodexData\\aghub-dev-loopback.lock';
const DEV_API = 'http://127.0.0.1:18000';

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function acquireLock() {
  fs.mkdirSync(path.dirname(LOCK), { recursive: true });
  for (let attempt = 0; attempt < 400; attempt += 1) {
    try {
      const fd = fs.openSync(LOCK, 'wx');
      fs.writeFileSync(fd, String(process.pid));
      return fd;
    } catch (err) {
      if (err.code !== 'EEXIST') throw err;
      try {
        const stat = fs.statSync(LOCK);
        if (Date.now() - stat.mtimeMs > 5 * 60 * 1000) fs.unlinkSync(LOCK);
      } catch { /* another process removed it */ }
      await sleep(50);
    }
  }
  throw new Error('dev loopback lock timeout');
}

function releaseLock(fd) {
  try { fs.closeSync(fd); } catch { /* already closed */ }
  try { fs.unlinkSync(LOCK); } catch { /* already released */ }
}

async function listenDevApi(server) {
  process.env.AGHUB_DEV_LOOPBACK = '1';
  const fd = await acquireLock();
  try {
    await new Promise((resolve, reject) => {
      const onError = (err) => reject(err);
      server.once('error', onError);
      server.listen(18000, '127.0.0.1', () => {
        server.removeListener('error', onError);
        resolve();
      });
    });
  } catch (err) {
    releaseLock(fd);
    throw err;
  }
  return () => new Promise((resolve) => {
    server.closeAllConnections();
    server.close(() => {
      setTimeout(() => {
        releaseLock(fd);
        resolve();
      }, 50);
    });
  });
}

module.exports = { listenDevApi, DEV_API };
