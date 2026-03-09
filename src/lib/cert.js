/**
 * Load McMaster client certificate: prefer MCMASTER_CERT_BASE64, else MCMASTER_CERT_PATH.
 * Fails fast with a clear error if no certificate source is available.
 */

const fs = require('fs');
const path = require('path');
const { getConfig } = require('../config');

let cached = null;

function getCertificate() {
  if (cached) return cached;

  const config = getConfig();
  const { mcmasterCertPassword, mcmasterCertBase64, mcmasterCertPath } = config;

  if (!mcmasterCertPassword || typeof mcmasterCertPassword !== 'string') {
    throw new Error('MCMASTER_CERT_PASSWORD is required');
  }

  const hasBase64 =
    mcmasterCertBase64 && typeof mcmasterCertBase64 === 'string' && mcmasterCertBase64.length > 0;
  const hasPath =
    mcmasterCertPath && typeof mcmasterCertPath === 'string' && mcmasterCertPath.length > 0;

  if (!hasBase64 && !hasPath) {
    throw new Error(
      'McMaster client certificate required: set either MCMASTER_CERT_BASE64 (base64 .pfx) or MCMASTER_CERT_PATH (file path)'
    );
  }

  let pfx;
  if (hasBase64) {
    try {
      pfx = Buffer.from(mcmasterCertBase64, 'base64');
    } catch (e) {
      throw new Error('MCMASTER_CERT_BASE64 is not valid base64');
    }
    if (pfx.length === 0) {
      throw new Error('MCMASTER_CERT_BASE64 decoded to empty buffer');
    }
  } else {
    const resolved = path.resolve(mcmasterCertPath);
    if (!fs.existsSync(resolved)) {
      throw new Error('MCMASTER_CERT_PATH file not found: ' + resolved);
    }
    pfx = fs.readFileSync(resolved);
  }

  cached = { pfx, passphrase: mcmasterCertPassword };
  return cached;
}

module.exports = { getCertificate };
