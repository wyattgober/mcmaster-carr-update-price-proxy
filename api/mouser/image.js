/**
 * POST /api/mouser/image – requires x-api-key, body: { partNumber, manufacturerName }. Returns image as base64 + metadata.
 */

const { requireApiKey } = require('../../src/middleware/requireApiKey');
const { success, errorResponse } = require('../../src/lib/response');
const mouserImage = require('../../src/services/mouserImage');
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

    const partNumber = body.partNumber;
    const manufacturerName = body.manufacturerName;

    if (!partNumber || typeof partNumber !== 'string') {
      errorResponse(res, 400, 'Missing partNumber');
      return;
    }
    if (!manufacturerName || typeof manufacturerName !== 'string') {
      errorResponse(res, 400, 'Missing manufacturerName');
      return;
    }

    (async () => {
      try {
        const result = await mouserImage.getImageForPart(partNumber.trim(), manufacturerName.trim());
        success(res, 200, result);
      } catch (err) {
        if (err.isNoParts || err.message === 'No parts for search') {
          errorResponse(res, 404, 'No parts for search', partNumber);
          return;
        }
        if (err.isNoImage || err.message === 'No image for part') {
          errorResponse(res, 404, 'No image for part', partNumber);
          return;
        }
        if (/^MOUSER_API_KEY required$/i.test(String(err.message || ''))) {
          errorResponse(res, 500, 'Mouser API key not configured');
          return;
        }
        if (err.isMouserApiError) {
          errorResponse(res, 502, 'Mouser search failed', err.message);
          return;
        }
        logger.error('Mouser image lookup failed', err.message);
        const isConfig = /MOUSER_API_KEY|PROXY_API_KEY|required/i.test(err.message);
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
