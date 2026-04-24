// Wraps p-limit to enforce per-source API rate limits and prevent request flooding.

const pLimit = require('p-limit');

function createLimiter(requestsPerMinute) {
  const minIntervalMs = Math.ceil(60000 / requestsPerMinute);
  const limit = pLimit(1);
  let lastCallTime = 0;

  return function runLimited(fn) {
    return limit(async () => {
      const now = Date.now();
      const elapsed = now - lastCallTime;
      if (elapsed < minIntervalMs) {
        await new Promise(resolve => setTimeout(resolve, minIntervalMs - elapsed));
      }
      lastCallTime = Date.now();
      return fn();
    });
  };
}

module.exports = { createLimiter };
