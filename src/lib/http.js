/**
 * Reusable HTTPS request with client certificate and timeout. Used for all McMaster API calls.
 */

const https = require('https');
const { getConfig } = require('../config');
const { getCertificate } = require('./cert');
const logger = require('./logger');

function request(options) {
  const {
    host,
    path,
    method = 'GET',
    body = null,
    headers = {},
    timeoutMs,
  } = options;

  const config = getConfig();
  const timeout = timeoutMs != null ? timeoutMs : config.mcmasterRequestTimeoutMs;
  const cert = getCertificate();

  const requestOptions = {
    host,
    path,
    method,
    headers: {
      'Content-Type': 'application/json',
      ...headers,
    },
    pfx: cert.pfx,
    passphrase: cert.passphrase,
    rejectUnauthorized: config.mcmasterRejectUnauthorized,
  };

  if (body != null && (method === 'POST' || method === 'PUT' || method === 'PATCH')) {
    requestOptions.headers['Content-Length'] = Buffer.byteLength(body, 'utf8');
  }

  return new Promise((resolve, reject) => {
    const req = https.request(requestOptions, (res) => {
      const chunks = [];
      res.on('data', (chunk) => chunks.push(chunk));
      res.on('end', () => {
        const raw = Buffer.concat(chunks).toString('utf8');
        let parsed = null;
        if (raw && raw.trim()) {
          try {
            parsed = JSON.parse(raw);
          } catch (_) {
            // leave parsed null for non-JSON
          }
        }
        resolve({
          statusCode: res.statusCode,
          body: parsed,
          raw,
        });
      });
    });

    req.on('error', (err) => {
      logger.warn('HTTPS request error', err.message);
      reject(err);
    });

    req.setTimeout(timeout, () => {
      req.destroy();
      reject(new Error('Request timeout'));
    });

    if (body != null && (method === 'POST' || method === 'PUT' || method === 'PATCH')) {
      req.write(body, 'utf8');
    }
    req.end();
  });
}

module.exports = { request };
