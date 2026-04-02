/**
 * Image orchestration: get product (Image link), subscribe and retry once if needed, fetch binary image, return base64 payload.
 */

const mcmasterClient = require('./mcmasterClient');

async function getImageForPart(partNumber, authToken) {
  const { getProduct, getImage, extractImagePathFromProduct, withSubscribeRetry } = mcmasterClient;

  const product = await withSubscribeRetry(partNumber, authToken, function getProductOnce() {
    return getProduct(partNumber, authToken);
  });

  const imagePath = extractImagePathFromProduct(product);
  const { buffer, contentType } = await withSubscribeRetry(partNumber, authToken, function getImageOnce() {
    return getImage(imagePath, authToken);
  });

  return {
    partNumber,
    contentType,
    contentLength: buffer.length,
    imageBase64: buffer.toString('base64'),
  };
}

module.exports = { getImageForPart };
