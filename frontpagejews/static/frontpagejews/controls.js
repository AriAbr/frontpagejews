// The comparison-country picker, the benchmark choice and the outlet checkboxes.
//
// All work by reloading the page with new query-string choices: each country
// is a link, choosing a benchmark goes to its own URL, and the outlets are a
// GET form.
import { BENCHMARK_DISPLAY_SETTINGS } from "./benchmark-display-settings.js";
import { choicesQuery } from "./choices.js";
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
    const typed = search.value.trim().toLowerCase();
    items.forEach(li => { li.hidden = typed && !li.textContent.toLowerCase().includes(typed); });
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

  // Benchmark choice: an option per benchmark, starting on the chosen one.
  const benchmarkChoice = document.getElementById("benchmark-choice");
  for (const [benchmarkOption, displaySettings] of Object.entries(BENCHMARK_DISPLAY_SETTINGS)) {
    const option = new Option(displaySettings.label, benchmarkOption, false, benchmarkOption === benchmark);
    benchmarkChoice.append(option);
  }
  // Picked from the open list, a choice applies at once. With the list closed,
  // arrow keys change the choice too, and applying each would reload the page
  // before the visitor reaches the one they want, so a choice made from the
  // keyboard waits for Enter or for focus to leave.
  const applyBenchmark = () => {
    if (benchmarkChoice.value === benchmark) return;
    location.search = choicesQuery({ selectedOutlets, comparisonCode: comparison.code, benchmark: benchmarkChoice.value });
  };
  let choosingByKeyboard = false;
  benchmarkChoice.addEventListener("pointerdown", () => { choosingByKeyboard = false; });
  benchmarkChoice.addEventListener("keydown", event => {
    if (event.key === "Enter") applyBenchmark();
    else choosingByKeyboard = true;
  });
  benchmarkChoice.addEventListener("change", () => { if (!choosingByKeyboard) applyBenchmark(); });
  benchmarkChoice.addEventListener("blur", applyBenchmark);

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
