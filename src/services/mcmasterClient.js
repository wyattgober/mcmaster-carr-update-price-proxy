/**
 * McMaster API client: login, getPrice, addProduct. All requests use client cert via shared HTTPS helper.
 */

const { getConfig } = require('../config');
const { request } = require('../lib/http');
const logger = require('../lib/logger');

function NotSubscribedError(message, statusCode, details) {
  const err = new Error(message);
  err.name = 'NotSubscribedError';
  err.statusCode = statusCode;
  err.details = details;
  err.isNotSubscribed = true;
  return err;
}

async function login() {
  const config = getConfig();
  const path = config.mcmasterApiBasePath + '/login';
  const body = JSON.stringify({
    UserName: config.mcmasterUsername,
    Password: config.mcmasterPassword,
  });

  logger.info('McMaster login attempted');

  const res = await request({
    host: config.mcmasterApiHost,
    path,
    method: 'POST',
    body,
  });

  if (res.statusCode !== 200) {
    logger.warn('McMaster login failed', 'status', res.statusCode);
    const details = res.body && (res.body.message || res.body.error || res.raw);
    throw new Error(details ? `Login failed: ${details}` : `Login failed with status ${res.statusCode}`);
  }

  const data = res.body;
  if (!data || typeof data !== 'object') {
    throw new Error('Invalid login response: not an object');
  }

  const authToken =
    data.AuthToken ?? data.authToken ?? data.Token ?? data.token;
  if (!authToken || typeof authToken !== 'string') {
    throw new Error('Login response missing auth token');
  }

  const tokenExpiresAt =
    data.ExpirationTS ?? data.expirationTS ?? data.ExpiresAt ?? data.expiresAt ?? data.expires ?? null;

  logger.info('McMaster login succeeded', logger.maskToken(authToken));

  return {
    authToken,
    tokenExpiresAt: tokenExpiresAt != null ? String(tokenExpiresAt) : null,
  };
}

async function getPrice(partNumber, authToken) {
  const config = getConfig();
  const path = config.mcmasterApiBasePath + '/products/' + encodeURIComponent(partNumber) + '/price';

  const res = await request({
    host: config.mcmasterApiHost,
    path,
    method: 'GET',
    headers: {
      Authorization: 'Bearer ' + authToken,
    },
  });

  if (res.statusCode === 403 || res.statusCode === 404) {
    const msg = (res.body && (res.body.message || res.body.error)) || res.raw || '';
    const lower = String(msg).toLowerCase();
    if (
      lower.includes('subscrib') ||
      lower.includes('not found') ||
      lower.includes('not available') ||
      res.statusCode === 404
    ) {
      throw NotSubscribedError(
        'Product may require subscription',
        res.statusCode,
        res.body || res.raw
      );
    }
  }

  if (res.statusCode !== 200) {
    const details = res.body && (res.body.message || res.body.error) || res.raw;
    throw new Error(details ? `Price lookup failed: ${details}` : `Price lookup failed with status ${res.statusCode}`);
  }

  if (!Array.isArray(res.body)) {
    throw new Error('Price response is not an array');
  }

  return res.body;
}

async function addProduct(partNumber) {
  const config = getConfig();
  const path = '/' + String(partNumber).trim();

  logger.info('McMaster Add Product', partNumber);

  const res = await request({
    host: config.mcmasterWebHost,
    path,
    method: 'GET',
    headers: {},
  });

  if (res.statusCode >= 400) {
    logger.warn('McMaster Add Product returned', res.statusCode);
  }

  return { statusCode: res.statusCode, body: res.body };
}

module.exports = { login, getPrice, addProduct, NotSubscribedError };
