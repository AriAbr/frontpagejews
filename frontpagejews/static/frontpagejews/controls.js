// The comparison-country picker, the benchmark choice, the outlet checkboxes
// and the month.
//
// All work by reloading the page with new query-string choices: each country
// is a link, choosing a benchmark goes to its own URL, the outlets are a GET
// form, and picking a month goes to its URL.
import { BENCHMARK_DISPLAY_SETTINGS } from "./benchmark-display-settings.js";
import { choicesQuery, countryMatches } from "./choices.js";
import { describeOutlets, describePeriod } from "./formats.js";

// months: every month there's data for, "YYYY-MM", oldest first. month: the
// one shown, or null for the last `daysShown` days.
export function setUpControls({ choices, comparison, selectedOutlets, benchmark, months, month, daysShown }) {
  // What's shown, for each control to change one part of.
  const chosen = { selectedOutlets, comparisonCode: comparison.code, benchmark, month };
  setUpCountryControl({ choices, comparison, chosen });
  setUpBenchmarkControl(chosen);
  setUpOutletControl(chosen);
  setUpMonthControl({ months, daysShown, chosen });
}

// Country picker: focus opens the full list, typing filters it (anywhere in
// the name), arrows move, Enter follows the highlighted link, Escape closes.
function setUpCountryControl({ choices, comparison, chosen }) {
  const search = document.getElementById("country-search");
  const list = document.getElementById("country-list");
  const none = list.querySelector(".none");
  for (const { code, name } of choices) {
    const link = document.createElement("a");
    link.href = choicesQuery({ ...chosen, comparisonCode: code });
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
}

// Benchmark choice: a button that opens a link per benchmark, each with its
// label and, under it, what it is. The button shows the chosen one the same
// way. Arrow keys move between the links, Escape closes the list.
function setUpBenchmarkControl(chosen) {
  const { benchmark } = chosen;
  const toggle = document.getElementById("benchmark-toggle");
  const list = document.getElementById("benchmark-list");
  const dropdown = list.parentElement;
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
    link.href = choicesQuery({ ...chosen, benchmark: benchmarkOption });
    describeBenchmark(link, displaySettings);
    const item = document.createElement("li");
    if (benchmarkOption === benchmark) {
      item.className = "current";
      link.setAttribute("aria-current", "true");
    }
    item.append(link);
    list.append(item);
  }
  describeBenchmark(toggle, BENCHMARK_DISPLAY_SETTINGS[benchmark]);
  const links = [...list.querySelectorAll("a")];

  const open = () => {
    list.hidden = false;
    toggle.setAttribute("aria-expanded", "true");
  };
  const close = () => {
    list.hidden = true;
    toggle.setAttribute("aria-expanded", "false");
  };
  toggle.addEventListener("click", () => {
    if (list.hidden) open();
    else close();
  });
  dropdown.addEventListener("keydown", event => {
    if (event.key === "Escape") {
      close();
      toggle.focus();
    } else if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      open();
      const step = event.key === "ArrowDown" ? 1 : -1;
      const current = links.indexOf(document.activeElement);
      // From the button, down goes to the first link and up to the last.
      const next = current === -1 ? (step === 1 ? 0 : links.length - 1) : current + step;
      links[(next + links.length) % links.length].focus();
    }
  });
  // Closes when a click or focus lands anywhere else.
  document.addEventListener("click", event => {
    if (!dropdown.contains(event.target)) close();
  });
  dropdown.addEventListener("focusout", event => {
    if (!dropdown.contains(event.relatedTarget)) close();
  });
}

// Outlets: a button that opens the checkboxes. Ticking doesn't reload the
// page, which would close the list after every click; closing it does, if the
// outlets ticked have changed. The form carries the comparison, benchmark and
// month along, and starts with the chosen outlets ticked.
function setUpOutletControl({ selectedOutlets, comparisonCode, benchmark, month }) {
  const form = document.getElementById("outlet-form");
  form.elements.vs.value = comparisonCode;
  form.elements.by.value = benchmark;
  // With no month, the field is left out, rather than sent empty.
  form.elements.month.value = month ?? "";
  form.elements.month.disabled = !month;
  const boxes = [...form.querySelectorAll("input[name=outlet]")];
  for (const box of boxes) box.checked = selectedOutlets.includes(box.value);
  const toggle = document.getElementById("outlets-toggle");
  const list = document.getElementById("outlet-list");
  const dropdown = list.parentElement;

  const tickedOutlets = () => boxes.filter(box => box.checked).map(box => box.value);
  const describeTicked = () => {
    const description = describeOutlets(tickedOutlets().length, boxes.length);
    toggle.textContent = description[0].toUpperCase() + description.slice(1);
  };
  const open = () => {
    list.hidden = false;
    toggle.setAttribute("aria-expanded", "true");
  };
  const close = () => {
    if (list.hidden) return;
    list.hidden = true;
    toggle.setAttribute("aria-expanded", "false");
    const ticked = tickedOutlets();
    const changed = ticked.length !== selectedOutlets.length || ticked.some(outlet => !selectedOutlets.includes(outlet));
    if (changed) form.submit();
  };

  describeTicked();
  toggle.addEventListener("click", () => { if (list.hidden) open(); else close(); });
  list.querySelector(".done").addEventListener("click", () => { close(); toggle.focus(); });
  dropdown.addEventListener("keydown", event => {
    if (event.key === "Escape") { close(); toggle.focus(); }
  });
  document.addEventListener("click", event => { if (!dropdown.contains(event.target)) close(); });
  // Unticking every outlet would mean "all", so keep at least one.
  form.addEventListener("change", event => {
    if (!tickedOutlets().length) event.target.checked = true;
    describeTicked();
  });
}

// Month: the last days first, then each month, newest first.
function setUpMonthControl({ months, daysShown, chosen }) {
  const select = document.getElementById("month-select");
  for (const option of [null, ...[...months].reverse()]) {
    const label = describePeriod(option, daysShown);
    const capitalized = label[0].toUpperCase() + label.slice(1);
    select.add(new Option(capitalized, option ?? "", false, option === chosen.month));
  }
  select.addEventListener("change", () => {
    location.search = choicesQuery({ ...chosen, month: select.value || null });
  });
}
