/**
 * POST /api/mcmaster/login – requires x-api-key. Calls McMaster login, returns authToken and tokenExpiresAt.
 */

const { requireApiKey } = require('../../src/middleware/requireApiKey');
const { success, errorResponse } = require('../../src/lib/response');
const mcmasterClient = require('../../src/services/mcmasterClient');
const logger = require('../../src/lib/logger');

module.exports = function handler(req, res) {
  if (req.method !== 'POST') {
    errorResponse(res, 405, 'Method not allowed');
    return;
  }

  requireApiKey(req, res, function onAuthorized() {
    (async () => {
      try {
        const result = await mcmasterClient.login();
        success(res, 200, {
          authToken: result.authToken,
          tokenExpiresAt: result.tokenExpiresAt,
        });
      } catch (err) {
        logger.error('Login failed', err.message);
        const isConfig = /MCMASTER_CERT|certificate|PROXY_API_KEY|required/i.test(err.message);
        const isTimeout = /timeout/i.test(err.message);
        if (isConfig) {
          errorResponse(res, 500, 'Service configuration error');
        } else if (isTimeout) {
          errorResponse(res, 504, 'Upstream timeout');
        } else {
          errorResponse(res, 502, 'Login failed', err.message);
        }
      }
    })();
  });
};
