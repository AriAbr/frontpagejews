// Tests for choices.js, the visitor's choices. Run with `npm test`.
import assert from "node:assert/strict";
import { describe, test } from "node:test";

import { choicesFromUrl, choicesQuery, comparisonChoices } from "../../static/frontpagejews/choices.js";
import { siteData } from "./site-data.js";

describe("choicesFromUrl", () => {
  const data = siteData({});

  test("compares Israel with China by population and uses every outlet by default", () => {
    assert.deepEqual(choicesFromUrl("", data), {
      selectedOutlets: ["fox", "bbc"],
      comparisonCode: "CHN",
      benchmark: "population",
    });
  });

  test("takes the outlets, country and benchmark given", () => {
    assert.deepEqual(choicesFromUrl("?vs=USA&outlet=bbc&by=gdp", data), {
      selectedOutlets: ["bbc"],
      comparisonCode: "USA",
      benchmark: "gdp",
    });
  });

  test("uses the default benchmark when the one given is unknown", () => {
    assert.equal(choicesFromUrl("?by=vibes", data).benchmark, "population");
  });

  test("uses every outlet when none valid is given", () => {
    assert.deepEqual(choicesFromUrl("?outlet=not-an-outlet", data).selectedOutlets, ["fox", "bbc"]);
  });
});

describe("choicesQuery", () => {
  const data = siteData({});

  test("gives the choices back to choicesFromUrl unchanged", () => {
    const choices = { selectedOutlets: ["bbc"], comparisonCode: "USA", benchmark: "gdp" };

    assert.deepEqual(choicesFromUrl(choicesQuery(choices), data), choices);
  });

  test("includes the benchmark even when it is the default", () => {
    const query = choicesQuery({ selectedOutlets: ["bbc"], comparisonCode: "USA", benchmark: "population" });

    assert.equal(query, "?vs=USA&by=population&outlet=bbc");
  });
});

describe("comparisonChoices", () => {
  test("offers every mentioned country with a population but Israel, most mentioned first", () => {
    const data = siteData(
      { "2026-09-22": { bbc: { ISR: 5, CHN: 1, USA: 3, XKX: 9 } } },
      { population: { ISR: 10, CHN: 30, USA: 60 } },
    );

    assert.deepEqual(comparisonChoices(data, ["bbc"], "population"), [
      { code: "USA", name: "United States" },
      { code: "CHN", name: "China" },
    ]);
  });
});
