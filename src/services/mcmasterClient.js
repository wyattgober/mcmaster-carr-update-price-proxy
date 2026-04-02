/**
 * McMaster API client: login, getPrice, getProduct, getProductWithSubscribe, getImage, addProduct. All requests use client cert via shared HTTPS helper.
 */

const { getConfig } = require('../config');
const { request, requestBinary } = require('../lib/http');
const logger = require('../lib/logger');

function NotSubscribedError(message, statusCode, details) {
  const err = new Error(message);
  err.name = 'NotSubscribedError';
  err.statusCode = statusCode;
  err.details = details;
  err.isNotSubscribed = true;
  return err;
}

/** Shared with getPrice / getProduct for 403/404 subscription detection (keep in sync). */
function maybeNotSubscribedError(statusCode, body, raw) {
  if (statusCode !== 403 && statusCode !== 404) return null;
  if (body && body.ErrorMessage === 'EXPIRED_AUTHORIZATION_TOKEN') return null;
  const desc = (body && (body.ErrorDescription || body.ErrorMessage || body.message || body.error)) || raw || '';
  const lower = String(desc).toLowerCase();
  const isNotSubscribed = body && body.ErrorMessage === 'NOT_SUBSCRIBED_TO_PRODUCT';
  if (
    isNotSubscribed ||
    lower.includes('subscrib') ||
    lower.includes('not found') ||
    lower.includes('not available') ||
    statusCode === 404
  ) {
    return NotSubscribedError('Product may require subscription', statusCode, body || raw);
  }
  return null;
}

function parseJsonBuffer(buffer) {
  if (!buffer || buffer.length === 0) return null;
  try {
    return JSON.parse(buffer.toString('utf8'));
  } catch (_) {
    return null;
  }
}

async function login() {
  const config = getConfig();
  const username = config.mcmasterUsername != null ? String(config.mcmasterUsername).trim() : '';
  const password = config.mcmasterPassword != null ? String(config.mcmasterPassword).trim() : '';
  const path = config.mcmasterApiBasePath + '/login';
  const body = JSON.stringify({
    UserName: username,
    Password: password,
  });

  logger.info('McMaster login attempted', 'username length', username.length, 'password length', password.length);

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

  const subErr = maybeNotSubscribedError(res.statusCode, res.body, res.raw);
  if (subErr) throw subErr;

  if (res.statusCode !== 200) {
    const details = res.body && (res.body.message || res.body.error) || res.raw;
    throw new Error(details ? `Price lookup failed: ${details}` : `Price lookup failed with status ${res.statusCode}`);
  }

  if (!Array.isArray(res.body)) {
    throw new Error('Price response is not an array');
  }

  return res.body;
}

async function getProduct(partNumber, authToken) {
  const config = getConfig();
  const path = config.mcmasterApiBasePath + '/products/' + encodeURIComponent(partNumber);

  const res = await request({
    host: config.mcmasterApiHost,
    path,
    method: 'GET',
    headers: {
      Authorization: 'Bearer ' + authToken,
    },
  });

  const subErr = maybeNotSubscribedError(res.statusCode, res.body, res.raw);
  if (subErr) throw subErr;

  if (res.statusCode !== 200) {
    const details = res.body && (res.body.message || res.body.error) || res.raw;
    throw new Error(details ? `Product lookup failed: ${details}` : `Product lookup failed with status ${res.statusCode}`);
  }

  if (!res.body || typeof res.body !== 'object') {
    throw new Error('Product response is not an object');
  }

  return res.body;
}

/**
 * Image link Value from product Links, e.g. /v1/images/contents/gfx/...
 */
function extractImagePathFromProduct(product) {
  if (!product || typeof product !== 'object') {
    throw new Error('No image link for product');
  }
  const links = product.Links ?? product.links;
  if (!Array.isArray(links)) {
    throw new Error('No image link for product');
  }
  const entry = links.find(function (l) {
    if (!l || typeof l !== 'object') return false;
    const key = l.Key ?? l.key;
    return key === 'Image' || (typeof key === 'string' && key.toLowerCase() === 'image');
  });
  const value = entry && (entry.Value ?? entry.value);
  if (!value || typeof value !== 'string' || !value.trim()) {
    throw new Error('No image link for product');
  }
  return value.trim();
}

async function getImage(imageRequestPath, authToken) {
  const config = getConfig();
  const path = imageRequestPath.startsWith('/') ? imageRequestPath : '/' + imageRequestPath;

  const res = await requestBinary({
    host: config.mcmasterApiHost,
    path,
    method: 'GET',
    headers: {
      Authorization: 'Bearer ' + authToken,
    },
  });

  if (res.statusCode !== 200) {
    const parsed = parseJsonBuffer(res.body);
    const rawStr = res.body && res.body.length ? res.body.toString('utf8') : '';
    const subErr = maybeNotSubscribedError(res.statusCode, parsed, rawStr);
    if (subErr) throw subErr;
    const details =
      (parsed && (parsed.ErrorDescription || parsed.ErrorMessage)) ||
      rawStr.slice(0, 500);
    throw new Error(details ? `Image fetch failed: ${details}` : `Image fetch failed with status ${res.statusCode}`);
  }

  const contentType = res.headers['content-type'] || res.headers['Content-Type'] || 'application/octet-stream';
  return { buffer: res.body, contentType };
}

async function addProduct(partNumber, authToken, catalogBaseUrl) {
  const config = getConfig();
  const apiPath = config.mcmasterApiBasePath + '/products';
  const base = catalogBaseUrl != null ? catalogBaseUrl : 'https://mcmaster.com/';
  const normalizedBase = base.endsWith('/') ? base : base + '/';
  const body = JSON.stringify({
    URL: normalizedBase + String(partNumber).trim(),
  });

  logger.info('McMaster Add Product', partNumber, normalizedBase);

  const res = await request({
    host: config.mcmasterApiHost,
    path: apiPath,
    method: 'PUT',
    body,
    headers: {
      Authorization: 'Bearer ' + authToken,
    },
  });

  if (res.statusCode >= 400) {
    logger.warn('McMaster Add Product returned', res.statusCode);
  }

  return { statusCode: res.statusCode, body: res.body };
}

/**
 * PUT add product; on 400 BAD_REQUEST retry once with https://www.mcmaster.com/ (catalog URL variant).
 */
async function addProductWithUrlFallback(partNumber, authToken) {
  let res = await addProduct(partNumber, authToken, 'https://mcmaster.com/');
  if (res.statusCode === 400) {
    const msg = res.body && res.body.ErrorMessage;
    logger.warn('McMaster Add Product retry with www', partNumber, msg || '');
    res = await addProduct(partNumber, authToken, 'https://www.mcmaster.com/');
  }
  return res;
}

function hasProductPayload(body) {
  return body && typeof body === 'object' && Array.isArray(body.Links) && body.Links.length > 0;
}

function makeAddProductFailedError(detail) {
  const detailStr = detail == null ? '' : String(detail);
  const err = new Error(`Add product failed: ${detailStr}`);
  if (/Daily product subscription limit|subscription limit reached/i.test(detailStr)) {
    err.isSubscriptionLimit = true;
  }
  return err;
}

/**
 * GET product; on not-subscribed, PUT add product then use response body if it includes Links (McMaster returns
 * full product JSON on success), otherwise GET product again.
 */
async function getProductWithSubscribe(partNumber, authToken) {
  try {
    return await getProduct(partNumber, authToken);
  } catch (err) {
    if (!err.isNotSubscribed) throw err;
    const addRes = await addProductWithUrlFallback(partNumber, authToken);
    const b = addRes.body;
    if (hasProductPayload(b)) {
      logger.info('McMaster getProduct: using Links from add product response', partNumber);
      return b;
    }
    if (addRes.statusCode !== 200 && addRes.statusCode !== 201) {
      const detail =
        b && typeof b === 'object' ? b.ErrorDescription || b.ErrorMessage || JSON.stringify(b) : addRes.statusCode;
      throw makeAddProductFailedError(detail);
    }
    return await getProduct(partNumber, authToken);
  }
}

/**
 * Run fn(). On NotSubscribedError, addProduct once and retry fn() once (same pattern as price/image orchestration).
 */
async function withSubscribeRetry(partNumber, authToken, fn) {
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      return await fn();
    } catch (err) {
      if (!err.isNotSubscribed || attempt === 1) throw err;
      const addRes = await addProductWithUrlFallback(partNumber, authToken);
      if (addRes.statusCode !== 200 && addRes.statusCode !== 201) {
        const b = addRes.body;
        const detail =
          b && typeof b === 'object' ? b.ErrorDescription || b.ErrorMessage || JSON.stringify(b) : addRes.statusCode;
        throw makeAddProductFailedError(detail);
      }
    }
  }
}

module.exports = {
  login,
  getPrice,
  getProduct,
  getProductWithSubscribe,
  getImage,
  extractImagePathFromProduct,
  addProduct,
  addProductWithUrlFallback,
  withSubscribeRetry,
  NotSubscribedError,
};
