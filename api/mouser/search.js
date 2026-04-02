/**
 * POST /api/mouser/search – requires x-api-key, body: { partNumber, manufacturerName }. Returns Mouser search JSON (trimmed).
 */

const { requireApiKey } = require('../../src/middleware/requireApiKey');
const { success, errorResponse } = require('../../src/lib/response');
const mouserClient = require('../../src/services/mouserClient');
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
        const root = await mouserClient.searchByPartAndManufacturer(
          partNumber.trim(),
          manufacturerName.trim(),
        );
        const errors = mouserClient.getErrorsFromRoot(root);
        const parts = mouserClient.getPartsFromRoot(root);
        const sr = root && typeof root === 'object' ? root.SearchResults || root.searchResults : null;
        const numberOfResult =
          sr && typeof sr === 'object'
            ? sr.NumberOfResult != null
              ? sr.NumberOfResult
              : sr.numberOfResult
            : undefined;

        success(res, 200, {
          errors,
          numberOfResult,
          parts,
        });
      } catch (err) {
        if (/^MOUSER_API_KEY required$/i.test(String(err.message || ''))) {
          errorResponse(res, 500, 'Mouser API key not configured');
          return;
        }
        logger.error('Mouser search failed', err.message);
        const isConfig = /MOUSER_API_KEY|PROXY_API_KEY|required/i.test(err.message);
        const isTimeout = /timeout/i.test(err.message);
        if (isConfig) {
          errorResponse(res, 500, 'Service configuration error');
        } else if (isTimeout) {
          errorResponse(res, 504, 'Upstream timeout');
        } else {
          errorResponse(res, 502, 'Mouser search failed', err.message);
        }
      }
    })();
  });
};
