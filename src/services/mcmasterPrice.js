/**
 * Price orchestration: get price, optionally subscribe and retry once, normalize to single price (lowest MinimumQuantity break).
 */

const mcmasterClient = require('./mcmasterClient');
const logger = require('../lib/logger');

function normalizePriceBreaks(partNumber, rawBreaks) {
  if (!Array.isArray(rawBreaks) || rawBreaks.length === 0) {
    throw new Error('Empty price array');
  }

  let minBreak = rawBreaks[0];
  let minQty = getMinQty(minBreak);

  for (let i = 1; i < rawBreaks.length; i++) {
    const qty = getMinQty(rawBreaks[i]);
    if (qty < minQty) {
      minQty = qty;
      minBreak = rawBreaks[i];
    }
  }

  const amount = minBreak.Amount ?? minBreak.amount ?? minBreak.Price ?? minBreak.price;
  const minimumQuantity = minBreak.MinimumQuantity ?? minBreak.minimumQuantity ?? minBreak.MinQty ?? minBreak.minQty ?? minQty;
  const unitOfMeasure = minBreak.UnitOfMeasure ?? minBreak.unitOfMeasure ?? minBreak.UOM ?? minBreak.uom ?? 'Each';

  return {
    partNumber,
    price: typeof amount === 'number' ? amount : parseFloat(amount) || 0,
    minimumQuantity: typeof minimumQuantity === 'number' ? minimumQuantity : parseInt(minimumQuantity, 10) || 1,
    unitOfMeasure: String(unitOfMeasure),
    rawPriceBreaks: rawBreaks,
  };
}

function getMinQty(breakItem) {
  if (breakItem == null) return Infinity;
  const q = breakItem.MinimumQuantity ?? breakItem.minimumQuantity ?? breakItem.MinQty ?? breakItem.minQty;
  const n = typeof q === 'number' ? q : parseInt(q, 10);
  return Number.isFinite(n) ? n : Infinity;
}

async function getPriceForPart(partNumber, authToken) {
  const { getPrice, addProduct, NotSubscribedError } = mcmasterClient;

  let rawBreaks;
  try {
    rawBreaks = await getPrice(partNumber, authToken);
  } catch (err) {
    if (err.isNotSubscribed) {
      await addProduct(partNumber, authToken);
      rawBreaks = await getPrice(partNumber, authToken);
    } else {
      throw err;
    }
  }

  return normalizePriceBreaks(partNumber, rawBreaks);
}

module.exports = { getPriceForPart, normalizePriceBreaks };
