// Number formats shared by the headline, the scatter and the benchmark
// display settings.

// 0.139 → "13.9%", and small shares to two decimals: 0.0004 → "0.04%".
export function percent(fraction) {
  const decimals = fraction < 0.01 ? 2 : 1;
  return `${(fraction * 100).toFixed(decimals)}%`;
}

// 1.4e9 → "1.4B", 10e6 → "10M", 11204 → "11K".
export const compact = new Intl.NumberFormat("en-US", { notation: "compact", maximumSignificantDigits: 2 }).format;

// A share of coverage over a share of the benchmark, to two significant
// figures: "6.7×", "0.42×", "15×".
const twoFigures = new Intl.NumberFormat("en-US", { maximumSignificantDigits: 2 }).format;
export function multiple(mentionsPercentage, benchmarkPercentage) {
  return `${twoFigures(mentionsPercentage / benchmarkPercentage)}×`;
}
