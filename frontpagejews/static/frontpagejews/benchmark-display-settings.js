// How each benchmark is labelled and drawn. The keys match
// BENCHMARKS in benchmarks.py, and data.json's benchmark_figures.

// 1.4e9 → "1.4B", 10e6 → "10M", 11204 → "11K".
const compact = new Intl.NumberFormat("en-US", { notation: "compact", maximumSignificantDigits: 2 }).format;
const oneDecimal = n => n.toLocaleString(undefined, { minimumFractionDigits: 1, maximumFractionDigits: 1 });

export const BENCHMARK_DISPLAY_SETTINGS = {
  population: {
    label: "Population",
    // Fills in the page's descriptions: "against its population".
    noun: "population",
    share: "share of the world's population",
    // Fixed, so the scatter's axis never rescales: just past India, the most populous country.
    axisMax: 1.5e9,
    axisStep: 100e6,
    format: compact,
    // 1549 mentions over 10.1M people → "153.0 mentions per million people".
    rate: (mentions, people) => `${oneDecimal((mentions / people) * 1e6)} mentions per million people`,
  },
  gdp: {
    label: "GDP",
    noun: "GDP",
    share: "share of world GDP",
    // Just past China, the largest economy shown (the US is left off the scatter).
    axisMax: 20e12,
    axisStep: 1e12,
    format: dollars => `$${compact(dollars)}`,
    rate: (mentions, dollars) => `${oneDecimal((mentions / dollars) * 1e9)} mentions per $1B of GDP`,
  },
  conflict_deaths: {
    label: "Conflict deaths",
    noun: "conflict deaths",
    share: "share of the world's conflict deaths",
    // Just past Ukraine, the most over the 12 months to August 2026 (85K).
    axisMax: 100e3,
    axisStep: 10e3,
    format: compact,
    // Per 1,000, since per death rounds the worst-covered to 0.0: Sudan, with
    // 67K deaths and about 100 mentions, is 1.4 per 1,000. Most countries have
    // no deaths, and a rate means nothing for them.
    rate: (mentions, deaths) =>
      deaths ? `${oneDecimal((mentions / deaths) * 1e3)} mentions per 1,000 conflict deaths` : "No conflict deaths recorded",
  },
};
