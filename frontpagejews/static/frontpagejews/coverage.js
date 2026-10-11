// The numbers the page shows, worked out from data.json for the visitor's
// choice of outlets and comparison country. Nothing here touches the page.
//
// data.json (see site_data.py) holds, for each of the days shown, each
// outlet's mentions of each country, plus world population by country.

const sum = numbers => numbers.reduce((total, n) => total + n, 0);

// The outlets and comparison country in the query string, falling back to all
// outlets and the default comparison.
export function choicesFromUrl(queryString, data) {
  const params = new URLSearchParams(queryString);
  const allOutlets = Object.keys(data.outlets);
  const outletsInUrl = params.getAll("outlet").filter(slug => allOutlets.includes(slug));
  return {
    selectedOutlets: outletsInUrl.length ? outletsInUrl : allOutlets,
    comparisonCode: params.get("vs") || data.default_comparison,
  };
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

// Countries to compare with: mentioned and with a population figure, most
// mentioned first, Israel aside.
export function comparisonChoices(data, selectedOutlets) {
  const mentions = mentionsByCountry(data.days, selectedOutlets);
  return Object.keys(mentions)
    .sort((a, b) => mentions[b] - mentions[a])
    .filter(code => code in data.population && code !== data.focus)
    .map(code => ({ code, name: countryName(data, code) }));
}

// One row per day: both countries' share of mentions that day, and of world
// population.
export function lineChartRows(data, selectedOutlets, comparisonCode) {
  const populationShares = fractionsOfTotal(data.population);
  return data.days.map(day => {
    const coverageShares = fractionsOfTotal(mentionsByCountry([day], selectedOutlets));
    return {
      date: day.date,
      focusCoverage: coverageShares[data.focus] ?? 0,
      focusReality: populationShares[data.focus] ?? null,
      comparisonCoverage: coverageShares[comparisonCode] ?? 0,
      comparisonReality: populationShares[comparisonCode] ?? null,
    };
  });
}

// One point per country: its mentions over the days shown, beside its
// population. Countries with no population figure have no place on the
// population axis, and the outlets' home countries are left off.
export function scatterPoints(data, selectedOutlets) {
  const mentions = mentionsByCountry(data.days, selectedOutlets);
  return Object.keys(mentions)
    .filter(code => code in data.population && !data.home_countries.includes(code))
    .sort()
    .map(code => ({
      code,
      name: countryName(data, code),
      mentions: mentions[code],
      population: data.population[code],
    }));
}

// Mentions per person over the days shown: the slope of the line a country
// would sit on if mentions followed population. The outlets' home countries are
// left out of both sides, so the line is where the countries actually shown
// would balance. Provisional: the line chart's shares still count them.
export function averageMentionsPerPerson(data, selectedOutlets) {
  const isShown = code => !data.home_countries.includes(code);
  const totalOverShown = countsByCountry =>
    sum(Object.entries(countsByCountry).filter(([code]) => isShown(code)).map(([, count]) => count));
  const totalMentions = totalOverShown(mentionsByCountry(data.days, selectedOutlets));
  const totalPeople = totalOverShown(data.population);
  return totalPeople ? totalMentions / totalPeople : 0;
}
