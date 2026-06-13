export const CURRENCY_RATES = {
  USD: 1.0,
  EUR: 1.10,
  GBP: 1.25,
  CAD: 0.75,
  INR: 0.012,
  AUD: 0.65,
  JPY: 0.0065,
};

/**
 * Converts an amount from a foreign currency to USD.
 * Returns null if the currency is not supported.
 */
export function convertToUSD(amount, currency) {
  const code = currency?.toUpperCase();
  if (!code || !CURRENCY_RATES[code]) {
    return null;
  }
  const rate = CURRENCY_RATES[code];
  return {
    amountUSD: (parseFloat(amount) * rate).toFixed(4),
    rate,
    isConverted: code !== "USD",
  };
}

export function isSupportedCurrency(currency) {
  const code = currency?.toUpperCase();
  return !!CURRENCY_RATES[code];
}
