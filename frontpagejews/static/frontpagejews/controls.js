// The comparison-country picker, the benchmark choice, the outlet checkboxes
// and the month.
//
// All work by reloading the page with new query-string choices: each country
// is a link, choosing a benchmark goes to its own URL, the outlets are a GET
// form, and picking a month goes to its URL.
//
// Each choice is counted in Google Analytics on the way, as comparison_change,
// benchmark_change, outlets_change or period_change, with what was chosen.
import { track } from "./analytics.js";
import { BENCHMARK_DISPLAY_SETTINGS } from "./benchmark-display-settings.js";
import { choicesQuery, countryMatches, neighboringPeriods } from "./choices.js";
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
    link.addEventListener("click", () => track("comparison_change", { country: name }));
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
    link.addEventListener("click", () => track("benchmark_change", { benchmark: benchmarkOption }));
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
    toggle.textContent = capitalize(description);
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
    if (!changed) return;
    track("outlets_change", { outlets: ticked.join(",") });
    form.submit();
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

const MONTH_ABBREVIATIONS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

// Month: a button that opens a link to the last days and, under it, a year's
// twelve months, a link each where there's data for it. Arrows beside the
// year page through the years. It opens on the year shown, or with the last
// days shown, the newest year. Either side of the button, a link a month
// earlier and later; a month later than the newest is the last days.
function setUpMonthControl({ months, daysShown, chosen }) {
  const toggle = document.getElementById("period-toggle");
  const panel = document.getElementById("period-panel");
  const dropdown = panel.parentElement;
  toggle.textContent = capitalize(describePeriod(chosen.month, daysShown));

  const lastDays = document.getElementById("period-last-days");
  lastDays.href = choicesQuery({ ...chosen, month: null });
  lastDays.addEventListener("click", () => trackPeriod(null, daysShown));
  lastDays.textContent = capitalize(describePeriod(null, daysShown));
  if (!chosen.month) {
    lastDays.className = "current";
    lastDays.setAttribute("aria-current", "true");
  }

  const { earlier, later } = neighboringPeriods(months, chosen.month);
  setUpStep({ link: document.getElementById("period-earlier"), period: earlier, daysShown, chosen });
  setUpStep({ link: document.getElementById("period-later"), period: later, daysShown, chosen });

  const firstYear = Number(months[0]?.slice(0, 4));
  const lastYear = Number(months.at(-1)?.slice(0, 4));
  const yearLabel = document.getElementById("period-year");
  const yearEarlier = document.getElementById("period-year-earlier");
  const yearLater = document.getElementById("period-year-later");
  const monthGrid = document.getElementById("period-months");
  let yearShown = Number((chosen.month ?? months.at(-1))?.slice(0, 4));
  const showYear = year => {
    yearShown = year;
    yearLabel.textContent = year;
    yearEarlier.disabled = year <= firstYear;
    yearLater.disabled = year >= lastYear;
    monthGrid.replaceChildren();
    MONTH_ABBREVIATIONS.forEach((abbreviation, index) => {
      const month = `${year}-${String(index + 1).padStart(2, "0")}`;
      // A month without data is a plain span, grayed out, so the grid keeps its shape.
      const cell = document.createElement(months.includes(month) ? "a" : "span");
      cell.textContent = abbreviation;
      if (months.includes(month)) {
        cell.href = choicesQuery({ ...chosen, month });
        cell.addEventListener("click", () => trackPeriod(month, daysShown));
      }
      if (month === chosen.month) {
        cell.className = "current";
        cell.setAttribute("aria-current", "true");
      }
      monthGrid.append(cell);
    });
  };
  // With no past months yet, just the last days.
  panel.querySelector(".period-year").hidden = !months.length;
  if (months.length) showYear(yearShown);
  yearEarlier.addEventListener("click", () => showYear(yearShown - 1));
  yearLater.addEventListener("click", () => showYear(yearShown + 1));

  const open = () => {
    panel.hidden = false;
    toggle.setAttribute("aria-expanded", "true");
  };
  const close = () => {
    panel.hidden = true;
    toggle.setAttribute("aria-expanded", "false");
  };
  toggle.addEventListener("click", () => {
    if (panel.hidden) open();
    else close();
  });
  dropdown.addEventListener("keydown", event => {
    if (event.key === "Escape") {
      close();
      toggle.focus();
    }
  });
  // Closes when a click or focus lands anywhere else. Focus going nowhere is
  // left to the click: a year arrow loses it when it's disabled at the first
  // or last year, and the panel should stay open.
  document.addEventListener("click", event => {
    if (!dropdown.contains(event.target)) close();
  });
  dropdown.addEventListener("focusout", event => {
    if (event.relatedTarget && !dropdown.contains(event.relatedTarget)) close();
  });
}

// A month earlier or later: a link to it, or with none, the arrow grayed out.
function setUpStep({ link, period, daysShown, chosen }) {
  if (period === undefined) {
    link.setAttribute("aria-disabled", "true");
    return;
  }
  link.href = choicesQuery({ ...chosen, month: period });
  link.title = capitalize(describePeriod(period, daysShown));
  link.addEventListener("click", () => trackPeriod(period, daysShown));
}

// A month as "YYYY-MM", or the last days as "last 30 days".
function trackPeriod(month, daysShown) {
  track("period_change", { period: month ?? describePeriod(null, daysShown) });
}

// "last 30 days" → "Last 30 days".
function capitalize(text) {
  return text[0].toUpperCase() + text.slice(1);
}
