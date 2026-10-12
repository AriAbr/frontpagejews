// The visitor's choices: which outlets, which country to compare with, and
// which benchmark to measure reality by. Read from and written to the query
// string. Nothing here touches the page.
import { countryName, mentionsByCountry } from "./chart-data.js";

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

// Countries to compare with: mentioned and with a figure for the benchmark,
// most mentioned first, Israel aside.
export function comparisonChoices(data, selectedOutlets, benchmark) {
  const mentions = mentionsByCountry(data.days, selectedOutlets);
  return Object.keys(mentions)
    .sort((a, b) => mentions[b] - mentions[a])
    .filter(code => code in data.benchmark_figures[benchmark] && code !== data.focus)
    .map(code => ({ code, name: countryName(data, code) }));
}
