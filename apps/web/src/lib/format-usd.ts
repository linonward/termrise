// Prices are always shown in USD (docs/product/ux.md#internationalization).
// Whole dollars drop the cents ("$9"); other prices always show two digits ("$5.90").
export function formatUsd(cents: number, { cents: showCents = false } = {}) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: showCents || cents % 100 !== 0 ? 2 : 0,
  }).format(cents / 100);
}
