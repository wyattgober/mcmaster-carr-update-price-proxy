/**
 * Mouser API v2: search by part number + manufacturer name, download product image bytes.
 */

const { URLSearchParams } = require('url');
const { getConfig } = require('../config');
const { requestJson, getBinary } = require('../lib/httpsSimple');

const SEARCH_PATH = '/api/v2/search/partnumberandmanufacturer';

function buildSearchUrl(apiKey) {
  const config = getConfig();
  const host = config.mouserApiHost || 'api.mouser.com';
  const params = new URLSearchParams({ apiKey });
  return `https://${host}${SEARCH_PATH}?${params.toString()}`;
}

/**
 * @param {string} partNumber
 * @param {string} manufacturerName
 * @returns {Promise<object>} Parsed SearchResponseRoot JSON
 */
async function searchByPartAndManufacturer(partNumber, manufacturerName) {
  const config = getConfig();
  const apiKey = config.mouserApiKey;
  if (!apiKey || typeof apiKey !== 'string') {
    throw new Error('MOUSER_API_KEY required');
  }

  const url = buildSearchUrl(apiKey.trim());
  const body = {
    SearchByPartMfrNameRequest: {
      mouserPartNumber: partNumber.trim(),
      manufacturerName: manufacturerName.trim(),
    },
  };

  const { statusCode, body: parsed } = await requestJson({
    url,
    body,
    timeoutMs: config.mouserRequestTimeoutMs,
  });

  if (statusCode !== 200) {
    const detail = parsed && typeof parsed === 'object' ? JSON.stringify(parsed) : String(parsed);
    throw new Error(`Mouser search failed (${statusCode}): ${detail}`);
  }

  return parsed;
}

function getErrorsFromRoot(root) {
  if (!root || typeof root !== 'object') {
    return [];
  }
  const errs = root.Errors || root.errors;
  return Array.isArray(errs) ? errs : [];
}

function getPartsFromRoot(root) {
  if (!root || typeof root !== 'object') {
    return [];
  }
  const sr = root.SearchResults || root.searchResults;
  if (!sr || typeof sr !== 'object') {
    return [];
  }
  const parts = sr.Parts || sr.parts;
  return Array.isArray(parts) ? parts : [];
}

/**
 * First part that has a non-empty ImagePath.
 * @param {object[]} parts
 */
function firstPartWithImage(parts) {
  for (let i = 0; i < parts.length; i++) {
    const p = parts[i];
    if (!p || typeof p !== 'object') {
      continue;
    }
    const path = p.ImagePath || p.imagePath;
    if (path && typeof path === 'string' && path.trim()) {
      return p;
    }
  }
  return null;
}

/**
 * Resolve ImagePath to an absolute URL for GET.
 * @param {string} imagePath
 */
function resolveImageUrl(imagePath) {
  const trimmed = imagePath.trim();
  if (/^https?:\/\//i.test(trimmed)) {
    return trimmed;
  }
  if (trimmed.startsWith('//')) {
    return `https:${trimmed}`;
  }
  if (trimmed.startsWith('/')) {
    return `https://www.mouser.com${trimmed}`;
  }
  return `https://${trimmed.replace(/^\/+/, '')}`;
}

/**
 * @param {string} imagePath Mouser ImagePath field (URL or site-relative path)
 * @returns {Promise<{ buffer: Buffer, contentType: string }>}
 */
async function downloadImageFromPath(imagePath) {
  const config = getConfig();
  const url = resolveImageUrl(imagePath);
  const { statusCode, headers, body } = await getBinary(url, {
    timeoutMs: config.mouserRequestTimeoutMs,
  });

  if (statusCode !== 200 || !body || body.length === 0) {
    throw new Error(`Image download failed (${statusCode})`);
  }

  const rawType = headers['content-type'] || headers['Content-Type'];
  const contentType =
    typeof rawType === 'string' ? rawType.split(';')[0].trim() : 'image/jpeg';

  return { buffer: body, contentType };
}

module.exports = {
  searchByPartAndManufacturer,
  getErrorsFromRoot,
  getPartsFromRoot,
  firstPartWithImage,
  resolveImageUrl,
  downloadImageFromPath,
};
