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
  // A copy of an object keyed by country, without those countries.
  function without(byCountry) {
    const kept = {};
    for (const [code, value] of Object.entries(byCountry)) {
      if (!codes.includes(code)) kept[code] = value;
    }
    return kept;
  }

  const benchmarkFigures = {};
  for (const [benchmark, figures] of Object.entries(data.benchmark_figures)) {
    benchmarkFigures[benchmark] = without(figures);
  }

  const daysWithoutCountries = [];
  for (const day of data.days) {
    const mentions = {};
    for (const [slug, outletMentions] of Object.entries(day.mentions)) {
      mentions[slug] = without(outletMentions);
    }
    daysWithoutCountries.push({ ...day, mentions });
  }

  return { ...data, names: without(data.names), benchmark_figures: benchmarkFigures, days: daysWithoutCountries };
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

// Each country's count as a percentage of all the counts: {ISR: 1, CHN: 3} -> {ISR: 0.25, CHN: 0.75}.
export function percentagesOfTotal(countsByCountry) {
  const total = sum(Object.values(countsByCountry));
  if (!total) return {};
  const percentages = {};
  for (const [code, count] of Object.entries(countsByCountry)) {
    percentages[code] = count / total;
  }
  return percentages;
}

// Each benchmark's weight in the composite. Equal, on Kahneman's point that
// simple equally weighted formulas are often very good predictors.
export const COMPOSITE_WEIGHTS = { population: 1 / 3, gdp: 1 / 3, conflict_deaths: 1 / 3 };

// data.json plus a "composite" benchmark: each country's shares of the
// weighted benchmarks' totals, averaged by weight. Shares are of the countries
// in the data, so page.js adds it after leaving countries out.
export function withComposite(data, weights) {
  const benchmarksAsPercentages = {};
  for (const benchmark of Object.keys(weights)) {
    benchmarksAsPercentages[benchmark] = percentagesOfTotal(data.benchmark_figures[benchmark]);
  }

  const composite = {};
  for (const code of Object.keys(data.names)) {
    // A country missing any of the figures (North Korea has no GDP) gets no score.
    const hasEveryFigure = Object.values(benchmarksAsPercentages).every(benchmark => code in benchmark);
    if (!hasEveryFigure) continue;

    let score = 0;
    for (const [benchmark, weight] of Object.entries(weights)) {
      score += weight * benchmarksAsPercentages[benchmark][code];
    }
    composite[code] = score;
  }

  return { ...data, benchmark_figures: { ...data.benchmark_figures, composite } };
}

// Fewer mentions than this from the selected outlets in a day, and the day's
// shares are left out as if it had none. A share out of a handful of mentions
// says nothing: in February 2019, GDELT has an article a day from ABC on some
// days and none on the rest. Normal days have far more, even CBS's and NPR's
// quiet ones (20 or more).
export const MIN_MENTIONS_PER_DAY = 10;

// One row per day: both countries' share of mentions that day, and of the
// world's total for the benchmark.
export function lineChartRows(data, selectedOutlets, comparisonCode, benchmark) {
  const benchmarkPercentages = percentagesOfTotal(data.benchmark_figures[benchmark]);
  return data.days.map(day => {
    const mentions = mentionsByCountry([day], selectedOutlets);
    const mentionsPercentages = percentagesOfTotal(mentions);
    // A day with (almost) no mentions from the selected outlets has no shares
    // at all, rather than 0% for everyone: GDELT has no data for it (June 15
    // to July 1, 2025), or next to none from these outlets. Null, so the line
    // breaks there rather than falling to 0.
    const hasMentions = sum(Object.values(mentions)) >= MIN_MENTIONS_PER_DAY;
    return {
      date: day.date,
      // Whether GDELT has the day at all, from any outlet, which tells an
      // outage on its side from a day the selected outlets were missing.
      gdeltHasDay: Object.values(day.mentions).some(counts => Object.keys(counts).length > 0),
      focusMentionsPercentage: hasMentions ? (mentionsPercentages[data.focus] ?? 0) : null,
      focusBenchmarkPercentage: benchmarkPercentages[data.focus] ?? null,
      comparisonMentionsPercentage: hasMentions ? (mentionsPercentages[comparisonCode] ?? 0) : null,
      comparisonBenchmarkPercentage: benchmarkPercentages[comparisonCode] ?? null,
    };
  });
}

// One point per country: its share of the mentions over the days shown,
// beside its figure for the benchmark and that figure's share of the total.
// Countries with no figure have no place on the benchmark's axis.
export function scatterPoints(data, selectedOutlets, benchmark) {
  const mentions = mentionsByCountry(data.days, selectedOutlets);
  const mentionsPercentages = percentagesOfTotal(mentions);
  const benchmarkPercentages = percentagesOfTotal(data.benchmark_figures[benchmark]);
  const points = [];
  for (const code of Object.keys(mentions).sort()) {
    if (!(code in benchmarkPercentages)) continue;
    points.push({
      code,
      name: countryName(data, code),
      mentions: mentions[code],
      mentionsPercentage: mentionsPercentages[code],
      benchmarkFigure: data.benchmark_figures[benchmark][code],
      benchmarkPercentage: benchmarkPercentages[code],
    });
  }
  return points;
}

// The benchmark added up over every country in the data.
export function benchmarkTotal(data, benchmark) {
  return sum(Object.values(data.benchmark_figures[benchmark]));
}
