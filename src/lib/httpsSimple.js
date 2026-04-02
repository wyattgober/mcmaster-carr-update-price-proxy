/**
 * Plain HTTPS/HTTP requests without client certificates (e.g. Mouser API and image CDN).
 */

const https = require('https');
const http = require('http');
const { URL } = require('url');
const logger = require('./logger');

const DEFAULT_TIMEOUT_MS = 15000;
const MAX_REDIRECTS = 5;

/**
 * POST JSON and parse JSON response (no PFX).
 * @param {{ url: string, body?: object, headers?: Record<string, string>, timeoutMs?: number }} options
 */
function requestJson(options) {
  const { url, body, headers = {}, timeoutMs = DEFAULT_TIMEOUT_MS } = options;
  const parsed = new URL(url);
  const isHttps = parsed.protocol === 'https:';
  const payload =
    body != null && typeof body === 'object' ? JSON.stringify(body) : body != null ? String(body) : null;
  const method = payload != null ? 'POST' : 'GET';

  const reqHeaders = {
    Accept: 'application/json',
    'Content-Type': 'application/json',
    ...headers,
  };
  if (payload != null) {
    reqHeaders['Content-Length'] = Buffer.byteLength(payload, 'utf8');
  }

  const lib = isHttps ? https : http;
  const requestOptions = {
    hostname: parsed.hostname,
    port: parsed.port || (isHttps ? 443 : 80),
    path: `${parsed.pathname}${parsed.search}`,
    method,
    headers: reqHeaders,
  };

  return new Promise((resolve, reject) => {
    const req = lib.request(requestOptions, (res) => {
      const chunks = [];
      res.on('data', (chunk) => chunks.push(chunk));
      res.on('end', () => {
        const raw = Buffer.concat(chunks).toString('utf8');
        let parsedBody = null;
        if (raw && raw.trim()) {
          try {
            parsedBody = JSON.parse(raw);
          } catch (_) {
            parsedBody = null;
          }
        }
        resolve({
          statusCode: res.statusCode,
          headers: res.headers,
          body: parsedBody,
          raw,
        });
      });
    });

    req.on('error', (err) => {
      logger.warn('HTTP(S) request error', err.message);
      reject(err);
    });

    req.setTimeout(timeoutMs, () => {
      req.destroy();
      reject(new Error('Request timeout'));
    });

    if (payload != null) {
      req.write(payload, 'utf8');
    }
    req.end();
  });
}

/**
 * GET binary response; follows redirects (3xx) up to MAX_REDIRECTS.
 * @param {string} urlString
 * @param {{ timeoutMs?: number }} [opts]
 */
function getBinary(urlString, opts = {}) {
  const timeoutMs = opts.timeoutMs != null ? opts.timeoutMs : DEFAULT_TIMEOUT_MS;
  return getBinaryInner(urlString, timeoutMs, 0);
}

function getBinaryInner(urlString, timeoutMs, redirectCount) {
  if (redirectCount > MAX_REDIRECTS) {
    return Promise.reject(new Error('Too many redirects'));
  }

  const parsed = new URL(urlString);
  const isHttps = parsed.protocol === 'https:';
  const lib = isHttps ? https : http;

  const requestOptions = {
    hostname: parsed.hostname,
    port: parsed.port || (isHttps ? 443 : 80),
    path: `${parsed.pathname}${parsed.search}`,
    method: 'GET',
    headers: {
      Accept: '*/*',
      'User-Agent': 'McMaster-Carr-Proxy/1.0',
    },
  };

  return new Promise((resolve, reject) => {
    const req = lib.request(requestOptions, (res) => {
      const code = res.statusCode || 0;
      if (code >= 300 && code < 400 && res.headers.location) {
        const nextUrl = new URL(res.headers.location, urlString).href;
        res.resume();
        getBinaryInner(nextUrl, timeoutMs, redirectCount + 1).then(resolve).catch(reject);
        return;
      }

      const chunks = [];
      res.on('data', (chunk) => chunks.push(chunk));
      res.on('end', () => {
        const buffer = Buffer.concat(chunks);
        resolve({
          statusCode: code,
          headers: res.headers,
          body: buffer,
        });
      });
    });

    req.on('error', (err) => {
      logger.warn('HTTP(S) binary request error', err.message);
      reject(err);
    });

    req.setTimeout(timeoutMs, () => {
      req.destroy();
      reject(new Error('Request timeout'));
    });

    req.end();
  });
}

module.exports = { requestJson, getBinary, DEFAULT_TIMEOUT_MS };
