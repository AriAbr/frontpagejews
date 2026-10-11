// Country picker: focus opens the full list, typing filters it (anywhere in
// the name), arrows move, Enter follows the highlighted link, Escape closes.
const search = document.getElementById("country-search");
const list = document.getElementById("country-list");
const items = [...list.querySelectorAll("li:not(.none)")];
const none = list.querySelector(".none");
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

// Unticking every outlet would mean "all" server-side, so keep at least one.
const outletForm = document.getElementById("outlet-form");
outletForm.addEventListener("change", event => {
  if (!outletForm.querySelector("input[name=outlet]:checked")) { event.target.checked = true; return; }
  outletForm.submit();
});
