// The numbers the page shows, worked out from data.json for the visitor's
// choice of outlets and comparison country. Nothing here touches the page.
//
// data.json (see site_data.py) holds, for each of the days shown, each
// outlet's mentions of each country, plus each benchmark's (population, GDP)
// figures by country. Coverage is compared with one benchmark at a time, the visitor's
// choice.

const sum = numbers => numbers.reduce((total, n) => total + n, 0);

// The outlets, comparison country and benchmark in the query string, falling
// back to all outlets and the defaults.
export function choicesFromUrl(queryString, data) {
  const params = new URLSearchParams(queryString);
  const allOutlets = Object.keys(data.outlets);
  const outletsInUrl = params.getAll("outlet").filter(slug => allOutlets.includes(slug));
  const benchmark = params.get("by");
  return {
    selectedOutlets: outletsInUrl.length ? outletsInUrl : allOutlets,
    comparisonCode: params.get("vs") || data.default_comparison,
    benchmark: benchmark in data.benchmark_figures ? benchmark : data.default_benchmark,
  };
}

// The query string for the given choices: the reverse of `choicesFromUrl`. In
// the same order as the outlet form submits them, so a view has one URL
// whichever control led to it.
export function choicesQuery({ selectedOutlets, comparisonCode, benchmark }) {
  const params = [["vs", comparisonCode], ["by", benchmark], ...selectedOutlets.map(slug => ["outlet", slug])];
  return `?${new URLSearchParams(params)}`;
}

export const countryName = (data, code) => data.names[code] ?? code;

// ISO3 -> mentions by the selected outlets, added up over the given days.
export function mentionsByCountry(days, selectedOutlets) {
  const mentions = {};
  for (const day of days) {
    for (const slug of selectedOutlets) {
      for (const [code, count] of Object.entries(day.mentions[slug] ?? {})) {
        mentions[code] = (mentions[code] ?? 0) + count;
      }
    }
  }
  return mentions;
}

// Each country's count as a fraction of all the counts: {ISR: 1, CHN: 3} -> {ISR: 0.25, CHN: 0.75}.
export function fractionsOfTotal(countsByCountry) {
  const total = sum(Object.values(countsByCountry));
  if (!total) return {};
  return Object.fromEntries(Object.entries(countsByCountry).map(([code, count]) => [code, count / total]));
}

// Countries to compare with: mentioned and with a figure for the benchmark,
// most mentioned first, Israel aside.
export function comparisonChoices(data, selectedOutlets, benchmark) {
  const mentions = mentionsByCountry(data.days, selectedOutlets);
  return Object.keys(mentions)
    .sort((a, b) => mentions[b] - mentions[a])
    .filter(code => code in data.benchmark_figures[benchmark] && code !== data.focus)
    .map(code => ({ code, name: countryName(data, code) }));
}

// One row per day: both countries' share of mentions that day, and of the
// world's total for the benchmark.
export function lineChartRows(data, selectedOutlets, comparisonCode, benchmark) {
  const realityShares = fractionsOfTotal(data.benchmark_figures[benchmark]);
  return data.days.map(day => {
    const coverageShares = fractionsOfTotal(mentionsByCountry([day], selectedOutlets));
    return {
      date: day.date,
      focusCoverage: coverageShares[data.focus] ?? 0,
      focusReality: realityShares[data.focus] ?? null,
      comparisonCoverage: coverageShares[comparisonCode] ?? 0,
      comparisonReality: realityShares[comparisonCode] ?? null,
    };
  });
}

// One point per country: its mentions over the days shown, beside its figure
// for the benchmark. Countries with no figure have no place on the benchmark's
// axis, and the outlets' home countries are left off.
export function scatterPoints(data, selectedOutlets, benchmark) {
  const mentions = mentionsByCountry(data.days, selectedOutlets);
  const figures = data.benchmark_figures[benchmark];
  return Object.keys(mentions)
    .filter(code => code in figures && !data.home_countries.includes(code))
    .sort()
    .map(code => ({
      code,
      name: countryName(data, code),
      mentions: mentions[code],
      reality: figures[code],
    }));
}

// Mentions per unit of the benchmark (per person, or per dollar of GDP) over
// the days shown: the slope of the line a country would sit on if mentions
// followed the benchmark. The outlets' home countries are left out of both
// sides, so the line is where the countries actually shown would balance.
// Provisional: the line chart's shares still count them.
export function averageMentionsPerUnit(data, selectedOutlets, benchmark) {
  const isShown = code => !data.home_countries.includes(code);
  const totalOverShown = countsByCountry =>
    sum(Object.entries(countsByCountry).filter(([code]) => isShown(code)).map(([, count]) => count));
  const totalMentions = totalOverShown(mentionsByCountry(data.days, selectedOutlets));
  const benchmarkTotal = totalOverShown(data.benchmark_figures[benchmark]);
  return benchmarkTotal ? totalMentions / benchmarkTotal : 0;
}
