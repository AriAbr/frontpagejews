// The bar that takes the masthead's place once it scrolls away: the masthead
// is too tall to keep in view, so this says in a line what's being compared,
// beside every chart and in screenshots of it.
import { COLORS } from "./chart-common.js";
import { describeOutlets } from "./formats.js";

// benchmarkDisplaySettings: the benchmark's entry in BENCHMARK_DISPLAY_SETTINGS.
// outletCount: how many outlets there are to choose from.
export function drawSummaryBar({ focus, comparison, benchmarkDisplaySettings, selectedOutlets, outletCount }) {
  const focusName = element("strong", focus.name);
  focusName.style.color = COLORS.focus;
  const comparisonName = element("strong", comparison.name);
  comparisonName.style.color = COLORS.comparison;
  const countries = document.createElement("span");
  countries.append(focusName, " vs ", comparisonName);

  const outlets = describeOutlets(selectedOutlets.length, outletCount);
  const measures = element("span", `by ${benchmarkDisplaySettings.noun} · ${outlets}`);

  // In two parts, so the second moves to the next line whole where both don't fit.
  const parts = document.createElement("div");
  parts.append(countries, measures);
  document.getElementById("summary").append(parts);

  // Shown once the masthead has gone up behind where the bar sits, so what's
  // below the masthead, the headline first, shows just below the bar rather
  // than behind it. Not before, since until then they say the same.
  const bar = document.getElementById("summary-bar");
  // For the CSS, so a jump to a heading stops below the bar, not behind it.
  document.documentElement.style.setProperty("--summary-bar-height", `${bar.offsetHeight}px`);
  new IntersectionObserver(([masthead]) => {
    bar.classList.toggle("shown", !masthead.isIntersecting);
  }, { rootMargin: `-${bar.offsetHeight}px 0px 0px 0px` }).observe(document.querySelector(".masthead"));
}

function element(tag, text) {
  const created = document.createElement(tag);
  created.textContent = text;
  return created;
}
