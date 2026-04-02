/**
 * POST /api/mcmaster/image – requires x-api-key, body: { authToken, partNumber }. Returns image as base64 + content type.
 */

const { requireApiKey } = require('../../src/middleware/requireApiKey');
const { success, errorResponse } = require('../../src/lib/response');
const mcmasterImage = require('../../src/services/mcmasterImage');
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
        const result = await mcmasterImage.getImageForPart(partNumber.trim(), authToken.trim());
        success(res, 200, result);
      } catch (err) {
        if (err.message === 'No image link for product') {
          errorResponse(res, 404, 'No image for part', partNumber);
          return;
        }
        if (err.isNotSubscribed) {
          errorResponse(res, 502, 'Still not subscribed after add product; retry or check McMaster limits', err.message);
          return;
        }
        logger.error('Image lookup failed', err.message);
        const isConfig = /MCMASTER_CERT|certificate|PROXY_API_KEY|required/i.test(err.message);
        const isTimeout = /timeout/i.test(err.message);
        if (isConfig) {
          errorResponse(res, 500, 'Service configuration error');
        } else if (isTimeout) {
          errorResponse(res, 504, 'Upstream timeout');
        } else {
          errorResponse(res, 502, 'Image lookup failed', err.message);
        }
      }
    })();
  });
};
