// Links from the page's text to the terms' definitions in the methodology.

// A term, linked to its definition. The definition is the id of its entry
// there.
export function definitionLink(term, definition) {
  const link = document.createElement("a");
  link.textContent = term;
  link.className = "definition";
  link.href = `#${definition}`;
  return link;
}

// Text that names the benchmark, with only its noun linked to its definition,
// where it has one: "0.89% composite score". As a list, to append. Text
// that doesn't name it is left as it is.
export function withBenchmarkLinked(text, benchmarkDisplaySettings) {
  const { noun, definition } = benchmarkDisplaySettings;
  if (!definition || !text.includes(noun)) return [text];

  const [beforeNoun, afterNoun] = text.split(noun);
  return [beforeNoun, definitionLink(noun, definition), afterNoun];
}
