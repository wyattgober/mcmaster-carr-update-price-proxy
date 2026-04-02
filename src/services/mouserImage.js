/**
 * Mouser: search by MPN + manufacturer, download product image, return normalized payload for Airtable.
 */

const mouserClient = require('./mouserClient');

const {
  searchByPartAndManufacturer,
  getErrorsFromRoot,
  getPartsFromRoot,
  firstPartWithImage,
  downloadImageFromPath,
} = mouserClient;

function extensionFromContentType(contentType) {
  const base = (contentType || '').split(';')[0].trim().toLowerCase();
  const map = {
    'image/jpeg': '.jpg',
    'image/jpg': '.jpg',
    'image/png': '.png',
    'image/gif': '.gif',
    'image/webp': '.webp',
    'image/svg+xml': '.svg',
    'image/bmp': '.bmp',
  };
  return map[base] || '.jpg';
}

function sanitizeFileBase(partNumber) {
  return String(partNumber)
    .replace(/[/\\?%*:|"<>]/g, '_')
    .replace(/\s+/g, '_')
    .slice(0, 120) || 'part';
}

/**
 * @param {string} partNumber
 * @param {string} manufacturerName
 */
async function getImageForPart(partNumber, manufacturerName) {
  const root = await searchByPartAndManufacturer(partNumber, manufacturerName);

  const apiErrors = getErrorsFromRoot(root);
  if (apiErrors.length > 0) {
    const msg = apiErrors
      .map((e) => (e && (e.Message || e.message)) || JSON.stringify(e))
      .join('; ');
    const err = new Error(msg || 'Mouser API returned errors');
    err.isMouserApiError = true;
    throw err;
  }

  const parts = getPartsFromRoot(root);
  if (parts.length === 0) {
    const err = new Error('No parts for search');
    err.isNoParts = true;
    throw err;
  }

  const part = firstPartWithImage(parts);
  if (!part) {
    const err = new Error('No image for part');
    err.isNoImage = true;
    throw err;
  }

  const imagePath = part.ImagePath || part.imagePath;
  const { buffer, contentType } = await downloadImageFromPath(imagePath);

  const ext = extensionFromContentType(contentType);
  const fileName = `${sanitizeFileBase(partNumber)}${ext}`;

  return {
    partNumber,
    contentType,
    contentLength: buffer.length,
    fileName,
    imageBase64: buffer.toString('base64'),
  };
}

module.exports = { getImageForPart };
