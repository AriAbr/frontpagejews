// Icons drawn on the page, shared by the scatter's offscreen badges and the
// country picker.

// An arrow pointing left or right. Drawn rather than typed: an arrow
// character's height in its line depends on the font, and in some it sits
// well below the text's middle.
export function arrowIcon(side) {
  const svgNamespace = "http://www.w3.org/2000/svg";
  const icon = document.createElementNS(svgNamespace, "svg");
  icon.setAttribute("class", "arrow");
  icon.setAttribute("viewBox", "0 0 12 10");
  icon.setAttribute("aria-hidden", "true");
  const path = document.createElementNS(svgNamespace, "path");
  path.setAttribute("d", side === "left" ? "M11 5H1M5 1 1 5l4 4" : "M1 5h10M7 1l4 4-4 4");
  icon.append(path);
  return icon;
}
