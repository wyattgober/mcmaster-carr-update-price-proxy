/**
 * Require x-api-key header to match PROXY_API_KEY. Returns 401 JSON if missing or invalid.
 * Used for all protected vendor routes (e.g. /api/mcmaster/*, /api/mouser/*).
 */

const { getConfig } = require('../config');
const { errorResponse } = require('../lib/response');

function requireApiKey(req, res, next) {
  const key = req.headers['x-api-key'] || req.headers['X-Api-Key'];
  const config = getConfig();
  const expected = config.proxyApiKey;

  if (!expected || typeof expected !== 'string') {
    errorResponse(res, 500, 'Proxy API key not configured');
    return;
  }

  if (!key || key !== expected) {
    errorResponse(res, 401, 'Invalid or missing API key');
    return;
  }

  if (typeof next === 'function') {
    next();
  }
}

module.exports = { requireApiKey };
