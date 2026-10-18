// The comparison-country picker, the benchmark choice and the outlet checkboxes.
//
// All work by reloading the page with new query-string choices: each country
// is a link, choosing a benchmark goes to its own URL, and the outlets are a
// GET form.
import { BENCHMARK_DISPLAY_SETTINGS } from "./benchmark-display-settings.js";
import { choicesQuery, countryMatches } from "./choices.js";
import { describeOutlets } from "./formats.js";

export function setUpControls({ choices, comparison, selectedOutlets, benchmark }) {
  // Country picker: focus opens the full list, typing filters it (anywhere in
  // the name), arrows move, Enter follows the highlighted link, Escape closes.
  const search = document.getElementById("country-search");
  const list = document.getElementById("country-list");
  const none = list.querySelector(".none");
  for (const { code, name } of choices) {
    const link = document.createElement("a");
    link.href = choicesQuery({ selectedOutlets, comparisonCode: code, benchmark });
    link.textContent = name;
    const item = document.createElement("li");
    if (code === comparison.code) item.className = "current";
    item.append(link);
    list.insertBefore(item, none);
  }
  const items = [...list.querySelectorAll("li:not(.none)")];
  search.value = comparison.name;
  const current = search.value;
  let active = -1;

  const visible = () => items.filter(li => !li.hidden);
  const highlight = index => {
    const shown = visible();
    items.forEach(li => li.classList.remove("active"));
    active = shown.length ? (index + shown.length) % shown.length : -1;
    if (active >= 0) {
      shown[active].classList.add("active");
      shown[active].scrollIntoView({ block: "nearest" });
    }
  };
  const filter = () => {
    const typed = search.value.trim();
    items.forEach(li => { li.hidden = typed && !countryMatches(li.textContent, typed); });
    none.hidden = visible().length > 0;
    highlight(typed ? 0 : -1);
  };
  const open = () => { list.hidden = false; };
  const close = () => { list.hidden = true; search.value = current; };

  search.addEventListener("focus", () => {
    search.value = "";
    filter();
    open();
    const here = list.querySelector(".current");
    if (here) here.scrollIntoView({ block: "center" });
  });
  search.addEventListener("input", () => { filter(); open(); });
  search.addEventListener("keydown", event => {
    if (event.key === "ArrowDown") { event.preventDefault(); open(); highlight(active + 1); }
    else if (event.key === "ArrowUp") { event.preventDefault(); highlight(active - 1); }
    else if (event.key === "Enter" && active >= 0) { visible()[active].querySelector("a").click(); }
    else if (event.key === "Escape") { close(); search.blur(); }
  });
  // Close on outside clicks; mousedown on the list keeps focus so a click lands.
  list.addEventListener("mousedown", event => event.preventDefault());
  search.addEventListener("blur", close);

  // Benchmark choice: a button that opens a link per benchmark, each with its
  // label and, under it, what it is. The button shows the chosen one the same
  // way. Arrow keys move between the links, Escape closes the list.
  const benchmarkToggle = document.getElementById("benchmark-toggle");
  const benchmarkList = document.getElementById("benchmark-list");
  const benchmarkDropdown = benchmarkList.parentElement;
  const describeBenchmark = (element, displaySettings) => {
    const label = document.createElement("span");
    label.className = "label";
    label.textContent = displaySettings.label;
    const description = document.createElement("span");
    description.className = "description";
    description.textContent = displaySettings.description;
    element.append(label, description);
  };
  for (const [benchmarkOption, displaySettings] of Object.entries(BENCHMARK_DISPLAY_SETTINGS)) {
    const link = document.createElement("a");
    link.href = choicesQuery({ selectedOutlets, comparisonCode: comparison.code, benchmark: benchmarkOption });
    describeBenchmark(link, displaySettings);
    const item = document.createElement("li");
    if (benchmarkOption === benchmark) {
      item.className = "current";
      link.setAttribute("aria-current", "true");
    }
    item.append(link);
    benchmarkList.append(item);
  }
  describeBenchmark(benchmarkToggle, BENCHMARK_DISPLAY_SETTINGS[benchmark]);
  const benchmarkLinks = [...benchmarkList.querySelectorAll("a")];

  const openBenchmarks = () => {
    benchmarkList.hidden = false;
    benchmarkToggle.setAttribute("aria-expanded", "true");
  };
  const closeBenchmarks = () => {
    benchmarkList.hidden = true;
    benchmarkToggle.setAttribute("aria-expanded", "false");
  };
  benchmarkToggle.addEventListener("click", () => {
    if (benchmarkList.hidden) openBenchmarks();
    else closeBenchmarks();
  });
  benchmarkDropdown.addEventListener("keydown", event => {
    if (event.key === "Escape") {
      closeBenchmarks();
      benchmarkToggle.focus();
    } else if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      openBenchmarks();
      const step = event.key === "ArrowDown" ? 1 : -1;
      const current = benchmarkLinks.indexOf(document.activeElement);
      // From the button, down goes to the first link and up to the last.
      const next = current === -1 ? (step === 1 ? 0 : benchmarkLinks.length - 1) : current + step;
      benchmarkLinks[(next + benchmarkLinks.length) % benchmarkLinks.length].focus();
    }
  });
  // Closes when a click or focus lands anywhere else.
  document.addEventListener("click", event => {
    if (!benchmarkDropdown.contains(event.target)) closeBenchmarks();
  });
  benchmarkDropdown.addEventListener("focusout", event => {
    if (!benchmarkDropdown.contains(event.relatedTarget)) closeBenchmarks();
  });

  // Outlets: a button that opens the checkboxes. Ticking doesn't reload the
  // page, which would close the list after every click; closing it does, if
  // the outlets ticked have changed. The form carries the comparison and
  // benchmark along, and starts with the chosen outlets ticked.
  const outletForm = document.getElementById("outlet-form");
  outletForm.elements.vs.value = comparison.code;
  outletForm.elements.by.value = benchmark;
  const boxes = [...outletForm.querySelectorAll("input[name=outlet]")];
  for (const box of boxes) box.checked = selectedOutlets.includes(box.value);
  const toggle = document.getElementById("outlets-toggle");
  const outletList = document.getElementById("outlet-list");
  const dropdown = outletList.parentElement;

  const tickedOutlets = () => boxes.filter(box => box.checked).map(box => box.value);
  const describeTicked = () => {
    const description = describeOutlets(tickedOutlets().length, boxes.length);
    toggle.textContent = description[0].toUpperCase() + description.slice(1);
  };
  const openOutlets = () => {
    outletList.hidden = false;
    toggle.setAttribute("aria-expanded", "true");
  };
  const closeOutlets = () => {
    if (outletList.hidden) return;
    outletList.hidden = true;
    toggle.setAttribute("aria-expanded", "false");
    const ticked = tickedOutlets();
    const changed = ticked.length !== selectedOutlets.length || ticked.some(outlet => !selectedOutlets.includes(outlet));
    if (changed) outletForm.submit();
  };

  describeTicked();
  toggle.addEventListener("click", () => { if (outletList.hidden) openOutlets(); else closeOutlets(); });
  outletList.querySelector(".done").addEventListener("click", () => { closeOutlets(); toggle.focus(); });
  dropdown.addEventListener("keydown", event => {
    if (event.key === "Escape") { closeOutlets(); toggle.focus(); }
  });
  document.addEventListener("click", event => { if (!dropdown.contains(event.target)) closeOutlets(); });
  // Unticking every outlet would mean "all", so keep at least one.
  outletForm.addEventListener("change", event => {
    if (!tickedOutlets().length) event.target.checked = true;
    describeTicked();
  });
}
