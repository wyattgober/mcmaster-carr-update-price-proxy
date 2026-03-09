/**
 * GET /api/health – no API key. Returns { ok: true }.
 */

const { success, errorResponse } = require('../src/lib/response');

module.exports = function handler(req, res) {
  if (req.method !== 'GET') {
    errorResponse(res, 405, 'Method not allowed');
    return;
  }
  success(res, 200, { ok: true });
};
