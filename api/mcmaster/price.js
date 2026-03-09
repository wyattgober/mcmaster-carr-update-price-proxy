/**
 * POST /api/mcmaster/price – requires x-api-key, body: { authToken, partNumber }. Returns normalized price.
 */

const { requireApiKey } = require('../../src/middleware/requireApiKey');
const { success, errorResponse } = require('../../src/lib/response');
const mcmasterPrice = require('../../src/services/mcmasterPrice');
const logger = require('../../src/lib/logger');

function parseBody(req) {
  const raw = req.body;
  if (typeof raw === 'object' && raw !== null) {
    return raw;
  }
  if (typeof raw === 'string' && raw.trim()) {
    try {
      return JSON.parse(raw);
    } catch (_) {
      return null;
    }
  }
  return null;
}

module.exports = function handler(req, res) {
  if (req.method !== 'POST') {
    errorResponse(res, 405, 'Method not allowed');
    return;
  }

  requireApiKey(req, res, function onAuthorized() {
    const body = parseBody(req);
    if (!body || typeof body !== 'object') {
      errorResponse(res, 400, 'Invalid or missing JSON body');
      return;
    }

    const authToken = body.authToken;
    const partNumber = body.partNumber;

    if (!authToken || typeof authToken !== 'string') {
      errorResponse(res, 400, 'Missing authToken');
      return;
    }
    if (!partNumber || typeof partNumber !== 'string') {
      errorResponse(res, 400, 'Missing partNumber');
      return;
    }

    (async () => {
      try {
        const result = await mcmasterPrice.getPriceForPart(partNumber.trim(), authToken.trim());
        success(res, 200, result);
      } catch (err) {
        if (err.message === 'Empty price array') {
          errorResponse(res, 404, 'No price data for part', partNumber);
          return;
        }
        logger.error('Price lookup failed', err.message);
        const isConfig = /MCMASTER_CERT|certificate|PROXY_API_KEY|required/i.test(err.message);
        const isTimeout = /timeout/i.test(err.message);
        if (isConfig) {
          errorResponse(res, 500, 'Service configuration error');
        } else if (isTimeout) {
          errorResponse(res, 504, 'Upstream timeout');
        } else {
          errorResponse(res, 502, 'Price lookup failed', err.message);
        }
      }
    })();
  });
};
