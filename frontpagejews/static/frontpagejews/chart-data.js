// The numbers the charts show, worked out from data.json for the visitor's
// choices (see choices.js). Nothing here touches the page.
//
// data.json (see site_data.py) holds, for each of the days shown, each
// outlet's mentions of each country, plus each benchmark's (population, GDP)
// figures by country. Coverage is compared with one benchmark at a time, the
// visitor's choice.

const sum = numbers => numbers.reduce((total, n) => total + n, 0);

export const countryName = (data, code) => data.names[code] ?? code;

// data.json without the given countries' mentions, benchmark figures and
// names. page.js leaves the outlets' home countries (the US and UK) out this
// way, before anything else sees the data: most of their mentions are home
// news, a different thing from foreign coverage.
export function withoutCountries(data, codes) {
  const without = countsByCountry =>
    Object.fromEntries(Object.entries(countsByCountry).filter(([code]) => !codes.includes(code)));
  const mapValues = (object, transform) =>
    Object.fromEntries(Object.entries(object).map(([key, value]) => [key, transform(value)]));
  return {
    ...data,
    names: without(data.names),
    benchmark_figures: mapValues(data.benchmark_figures, without),
    days: data.days.map(day => ({ ...day, mentions: mapValues(day.mentions, without) })),
  };
}

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
// axis.
export function scatterPoints(data, selectedOutlets, benchmark) {
  const mentions = mentionsByCountry(data.days, selectedOutlets);
  const figures = data.benchmark_figures[benchmark];
  return Object.keys(mentions)
    .filter(code => code in figures)
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
// followed the benchmark.
export function averageMentionsPerUnit(data, selectedOutlets, benchmark) {
  const totalMentions = sum(Object.values(mentionsByCountry(data.days, selectedOutlets)));
  const benchmarkTotal = sum(Object.values(data.benchmark_figures[benchmark]));
  return benchmarkTotal ? totalMentions / benchmarkTotal : 0;
}
