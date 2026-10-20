// Number formats shared by the headline, the scatter and the benchmark
// display settings, and the outlets and period chosen, shared by the controls,
// the charts and the summary bar.

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

// "all 7 outlets", or where some are left out, "3 of 7 outlets".
export function describeOutlets(selectedCount, outletCount) {
  if (selectedCount < outletCount) return `${selectedCount} of ${outletCount} outlets`;
  return `all ${outletCount} outlets`;
}

// "2024-03" → "March 2024".
export function monthName(month) {
  return new Date(`${month}-01T00:00:00Z`).toLocaleDateString("en-US", { month: "long", year: "numeric", timeZone: "UTC" });
}

// The period shown: the month picked, or with none, "last 30 days".
export function describePeriod(month, daysShown) {
  return month ? monthName(month) : `last ${daysShown} days`;
}

// How long ago a moment was, in the largest whole unit that reads naturally:
// "just now", "5 minutes ago", "2 hours ago", and from two days on, "3 days ago".
const relativeTime = new Intl.RelativeTimeFormat("en-US", { numeric: "always" });
export function timeAgo(then, now) {
  const minutes = Math.floor((now - then) / 60_000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return relativeTime.format(-minutes, "minute");
  const hours = Math.floor(minutes / 60);
  if (hours < 48) return relativeTime.format(-hours, "hour");
  return relativeTime.format(-Math.floor(hours / 24), "day");
}
