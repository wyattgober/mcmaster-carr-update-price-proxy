/**
 * Image orchestration: get product (Image link), subscribe and retry once if needed, fetch binary image, return base64 payload.
 */

const mcmasterClient = require('./mcmasterClient');

async function getImageForPart(partNumber, authToken) {
  const { getProduct, getImage, extractImagePathFromProduct, addProduct } = mcmasterClient;

  let product;
  try {
    product = await getProduct(partNumber, authToken);
  } catch (err) {
    if (err.isNotSubscribed) {
      await addProduct(partNumber, authToken);
      product = await getProduct(partNumber, authToken);
    } else {
      throw err;
    }
  }

  const imagePath = extractImagePathFromProduct(product);
  const { buffer, contentType } = await getImage(imagePath, authToken);

  return {
    partNumber,
    contentType,
    contentLength: buffer.length,
    imageBase64: buffer.toString('base64'),
  };
}

module.exports = { getImageForPart };
