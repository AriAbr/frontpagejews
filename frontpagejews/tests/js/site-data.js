// Builds the data.json the tests run against. Not a test file itself.

export // A data.json with the given days of per-outlet mentions, e.g.
// { "2026-09-22": { bbc: { ISR: 3 } } }, and benchmark figures, e.g.
// { population: { ISR: 10 } }, and the months there's data for, e.g. ["2024-03"].
function siteData(mentionsByDay, benchmarkFigures = {}, months = []) {
  return {
    focus: "ISR",
    default_comparison: "CHN",
    default_benchmark: "population",
    outlets: { fox: "Fox News", bbc: "BBC" },
    home_countries: ["GBR", "USA"],
    names: { CHN: "China", ISR: "Israel", USA: "United States", GBR: "United Kingdom" },
    benchmark_figures: { population: {}, gdp: {}, ...benchmarkFigures },
    days: Object.entries(mentionsByDay).map(([date, mentions]) => ({ date, mentions })),
    months,
  };
}
