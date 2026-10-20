// The visitor's choices: which outlets, which country to compare with, which
// benchmark to measure reality by, and which month to show. Read from and
// written to the query string. Nothing here touches the page.
import { countryName, mentionsByCountry } from "./chart-data.js";

// The outlets, comparison country, benchmark and month in the query string,
// falling back to all outlets, the defaults, and no month: the last days
// shown. A country the data doesn't name, like one left out of it, falls back
// too, as does a month with no data.
export function choicesFromUrl(queryString, data) {
  const params = new URLSearchParams(queryString);
  const allOutlets = Object.keys(data.outlets);
  const outletsInUrl = params.getAll("outlet").filter(slug => allOutlets.includes(slug));
  const comparison = params.get("vs");
  const benchmark = params.get("by");
  const month = params.get("month");
  return {
    selectedOutlets: outletsInUrl.length ? outletsInUrl : allOutlets,
    comparisonCode: comparison in data.names ? comparison : data.default_comparison,
    benchmark: benchmark in data.benchmark_figures ? benchmark : data.default_benchmark,
    month: data.months.includes(month) ? month : null,
  };
}

// The query string for the given choices: the reverse of `choicesFromUrl`. In
// the same order as the outlet form submits them, so a view has one URL
// whichever control led to it.
export function choicesQuery({ selectedOutlets, comparisonCode, benchmark, month }) {
  const params = [["vs", comparisonCode], ["by", benchmark]];
  if (month) params.push(["month", month]);
  params.push(...selectedOutlets.map(slug => ["outlet", slug]));
  return `?${new URLSearchParams(params)}`;
}

// The periods either side of the month shown, in the order the visitor steps
// through them: each month there's data for, oldest first, then the last days.
// Each is a month, null for the last days, or undefined at either end.
export function neighboringPeriods(months, month) {
  const periods = [...months, null];
  const index = periods.indexOf(month);
  return { earlier: periods[index - 1], later: periods[index + 1] };
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

// Whether a country's name contains what the visitor typed, anywhere in it,
// ignoring case and accents, so "turk" finds Türkiye.
export function countryMatches(countryName, typed) {
  return withoutAccents(countryName).includes(withoutAccents(typed));
}

// "Türkiye" → "turkiye": each accented letter split into the letter and its
// accent, and the accent dropped.
function withoutAccents(text) {
  return text.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase();
}
