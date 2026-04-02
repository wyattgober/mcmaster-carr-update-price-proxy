/**
 * Central config from env. Validates cert source and password; fails fast if missing.
 */

const MCMASTER_API_HOST = process.env.MCMASTER_API_HOST || 'api.mcmaster.com';
const MCMASTER_API_BASE_PATH = (process.env.MCMASTER_API_BASE_PATH || '/v1').replace(/\/$/, '');
const MCMASTER_REQUEST_TIMEOUT_MS = process.env.MCMASTER_REQUEST_TIMEOUT_MS
  ? parseInt(process.env.MCMASTER_REQUEST_TIMEOUT_MS, 10)
  : 15000;
const LOG_LEVEL = (process.env.LOG_LEVEL || 'info').toLowerCase();

const MOUSER_API_HOST = process.env.MOUSER_API_HOST || 'api.mouser.com';
const MOUSER_REQUEST_TIMEOUT_MS = process.env.MOUSER_REQUEST_TIMEOUT_MS
  ? parseInt(process.env.MOUSER_REQUEST_TIMEOUT_MS, 10)
  : MCMASTER_REQUEST_TIMEOUT_MS;

const certBase64 = process.env.MCMASTER_CERT_BASE64;
const certPath = process.env.MCMASTER_CERT_PATH;
const certPassword = process.env.MCMASTER_CERT_PASSWORD;
const tlsRejectUnauthorized = process.env.MCMASTER_TLS_REJECT_UNAUTHORIZED;
const rejectUnauthorized = tlsRejectUnauthorized !== 'false' && tlsRejectUnauthorized !== '0';

function getConfig() {
  return {
    proxyApiKey: process.env.PROXY_API_KEY,
    mcmasterUsername: process.env.MCMASTER_USERNAME,
    mcmasterPassword: process.env.MCMASTER_PASSWORD,
    mcmasterCertPassword: certPassword,
    mcmasterCertBase64: certBase64,
    mcmasterCertPath: certPath,
    mcmasterApiHost: MCMASTER_API_HOST,
    mcmasterApiBasePath: MCMASTER_API_BASE_PATH,
    mcmasterRequestTimeoutMs: MCMASTER_REQUEST_TIMEOUT_MS,
    mcmasterWebHost: 'www.mcmaster.com',
    mcmasterRejectUnauthorized: rejectUnauthorized,
    mouserApiKey: process.env.MOUSER_API_KEY,
    mouserApiHost: MOUSER_API_HOST,
    mouserRequestTimeoutMs: MOUSER_REQUEST_TIMEOUT_MS,
    logLevel: LOG_LEVEL,
  };
}

module.exports = { getConfig };
