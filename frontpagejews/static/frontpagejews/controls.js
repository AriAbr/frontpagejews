// The comparison-country picker, the benchmark choice and the outlet checkboxes.
//
// All work by reloading the page with new query-string choices: each country
// is a link, a benchmark radio button goes to its own URL, and the outlets are
// a GET form.
import { BENCHMARK_DISPLAY_SETTINGS } from "./benchmark-display-settings.js";
import { choicesQuery } from "./choices.js";

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

  // Benchmark choice: one radio button per benchmark, starting on the chosen one.
  const benchmarkChoice = document.getElementById("benchmark-choice");
  for (const [benchmarkOption, displaySettings] of Object.entries(BENCHMARK_DISPLAY_SETTINGS)) {
    const radio = Object.assign(document.createElement("input"), { type: "radio", name: "by", value: benchmarkOption });
    radio.checked = benchmarkOption === benchmark;
    radio.addEventListener("change", () => {
      location.search = choicesQuery({ selectedOutlets, comparisonCode: comparison.code, benchmark: benchmarkOption });
    });
    const wrapper = document.createElement("label");
    wrapper.append(radio, ` ${displaySettings.label}`);
    benchmarkChoice.append(wrapper);
  }

  // The outlet form carries the comparison and benchmark along, and starts with
  // the chosen outlets ticked.
  const outletForm = document.getElementById("outlet-form");
  outletForm.elements.vs.value = comparison.code;
  outletForm.elements.by.value = benchmark;
  for (const box of outletForm.querySelectorAll("input[name=outlet]")) box.checked = selectedOutlets.includes(box.value);
  // Unticking every outlet would mean "all", so keep at least one.
  outletForm.addEventListener("change", event => {
    if (!outletForm.querySelector("input[name=outlet]:checked")) { event.target.checked = true; return; }
    outletForm.submit();
  });
}
