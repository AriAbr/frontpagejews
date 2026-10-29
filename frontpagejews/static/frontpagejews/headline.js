// The page's headline: how many times its share of the benchmark each of the
// two countries gets in coverage, in big type above the charts, so the gist
// is there at a glance and in a screenshot.
import { COLORS, explainedNote } from "./chart-common.js";
import { definitionLink, withBenchmarkLinked } from "./definitions.js";
import { multiple, percent } from "./formats.js";

// points: the scatter's points, {code, coverage, reality} with shares.
// benchmarkDisplaySettings: the benchmark's entry in BENCHMARK_DISPLAY_SETTINGS.
// focusPointBeforeCombining: Israel's point with the comparison's countries
// separate, when they're combined; otherwise null.
export function drawHeadline({ points, benchmarkDisplaySettings, focus, comparison, focusPointBeforeCombining }) {
  const headline = document.getElementById("headline");
  headline.append(...headlineLine(focus, COLORS.focus, points, benchmarkDisplaySettings, focusPointBeforeCombining));
  headline.append(...headlineLine(comparison, COLORS.comparison, points, benchmarkDisplaySettings));
}

// The country's part, as a list of one block, or of none if the country
// wasn't mentioned: its line, and under it the two shares the multiple comes
// from, or only its line where it has no figure for the benchmark. Given its
// point before combining, the line shows that multiple too.
function headlineLine(country, color, points, benchmarkDisplaySettings, pointBeforeCombining = null) {
  const point = points.find(p => p.code === country.code);
  if (!point) return [];

  const part = document.createElement("div");
  const line = document.createElement("p");
  const name = element("strong", `${country.name}:`);
  name.style.color = color;
  part.append(line);

  // A multiple of nothing means nothing.
  if (!point.benchmarkPercentage) {
    line.append(name, ` ${percent(point.mentionsPercentage)} `, definitionLink("share of coverage", "share-of-coverage"), `, no ${benchmarkDisplaySettings.noun} recorded`);
    return [part];
  }

  const times = element("strong", multiple(point.mentionsPercentage, point.benchmarkPercentage));
  line.append(name, " ", times, " expected coverage");
  if (pointBeforeCombining?.benchmarkPercentage) line.append(" ", beforeCombiningNote(pointBeforeCombining));

  // Each share is kept in one piece, with a dot between them, so where the two
  // don't fit on one line they break between them, and the dot goes:
  // "6.0% share of coverage · 0.89% composite score".
  const coverageShare = document.createElement("span");
  coverageShare.append(`${percent(point.mentionsPercentage)} `, definitionLink("share of coverage", "share-of-coverage"));
  const benchmarkShare = document.createElement("span");
  benchmarkShare.append(...withBenchmarkLinked(benchmarkDisplaySettings.describeShare(point.benchmarkPercentage), benchmarkDisplaySettings));
  const shares = document.createElement("div");
  shares.append(
    coverageShare,
    benchmarkShare,
  );
  const detail = document.createElement("div");
  detail.className = "detail";
  detail.append(shares);
  part.append(detail);
  return [part];
}

// "9.5× before combining ⓘ": Israel's multiple with the comparison's
// countries separate, beside the combined one, and why the two differ.
function beforeCombiningNote(pointBeforeCombining) {
  const label = `${multiple(pointBeforeCombining.mentionsPercentage, pointBeforeCombining.benchmarkPercentage)} before combining`;
  const explanation =
    "Counting multiple countries as one means there are fewer mentions in total, so every other country's share goes up slightly.";
  const note = explainedNote(label, explanation);
  note.classList.add("before-combining");
  return note;
}

function element(tag, text) {
  const created = document.createElement(tag);
  created.textContent = text;
  return created;
}
