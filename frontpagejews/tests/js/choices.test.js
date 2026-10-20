// Tests for choices.js, the visitor's choices. Run with `npm test`.
import assert from "node:assert/strict";
import { describe, test } from "node:test";

import { choicesFromUrl, choicesQuery, comparisonChoices, countryMatches, neighboringPeriods } from "../../static/frontpagejews/choices.js";
import { siteData } from "./site-data.js";

describe("choicesFromUrl", () => {
  const data = siteData({}, {}, ["2024-03"]);

  test("compares Israel with China by population over the last days, with every outlet, by default", () => {
    assert.deepEqual(choicesFromUrl("", data), {
      selectedOutlets: ["fox", "bbc"],
      comparisonCode: "CHN",
      benchmark: "population",
      month: null,
    });
  });

  test("takes the outlets, country, benchmark and month given", () => {
    assert.deepEqual(choicesFromUrl("?vs=USA&outlet=bbc&by=gdp&month=2024-03", data), {
      selectedOutlets: ["bbc"],
      comparisonCode: "USA",
      benchmark: "gdp",
      month: "2024-03",
    });
  });

  test("shows the last days when the month given has no data", () => {
    assert.equal(choicesFromUrl("?month=1999-01", data).month, null);
  });

  test("uses the default comparison when the country given is unknown", () => {
    assert.equal(choicesFromUrl("?vs=XKX", data).comparisonCode, "CHN");
  });

  test("uses the default benchmark when the one given is unknown", () => {
    assert.equal(choicesFromUrl("?by=vibes", data).benchmark, "population");
  });

  test("uses every outlet when none valid is given", () => {
    assert.deepEqual(choicesFromUrl("?outlet=not-an-outlet", data).selectedOutlets, ["fox", "bbc"]);
  });
});

describe("choicesQuery", () => {
  const data = siteData({}, {}, ["2024-03"]);

  test("gives the choices back to choicesFromUrl unchanged", () => {
    const choices = { selectedOutlets: ["bbc"], comparisonCode: "USA", benchmark: "gdp", month: "2024-03" };

    assert.deepEqual(choicesFromUrl(choicesQuery(choices), data), choices);
  });

  test("leaves the month out when there is none", () => {
    const query = choicesQuery({ selectedOutlets: ["bbc"], comparisonCode: "USA", benchmark: "gdp", month: null });

    assert.equal(query, "?vs=USA&by=gdp&outlet=bbc");
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

describe("countryMatches", () => {
  test("finds the typed text anywhere in the name, whatever its case", () => {
    assert.equal(countryMatches("South Korea", "KOR"), true);
    assert.equal(countryMatches("South Korea", "japan"), false);
  });

  test("ignores accents, in the name or the typing", () => {
    assert.equal(countryMatches("Türkiye", "turk"), true);
    assert.equal(countryMatches("Cote d'Ivoire", "côte"), true);
  });
});

describe("neighboringPeriods", () => {
  // No data for April.
  const months = ["2024-01", "2024-02", "2024-03", "2024-05"];

  test("are the months either side", () => {
    assert.deepEqual(neighboringPeriods(months, "2024-02"), { earlier: "2024-01", later: "2024-03" });
  });

  test("skip months without data", () => {
    assert.equal(neighboringPeriods(months, "2024-03").later, "2024-05");
  });

  test("go from the newest month to the last days, null", () => {
    assert.equal(neighboringPeriods(months, "2024-05").later, null);
  });

  test("go from the last days back to the newest month, and no later", () => {
    assert.deepEqual(neighboringPeriods(months, null), { earlier: "2024-05", later: undefined });
  });

  test("have none earlier than the oldest month", () => {
    assert.equal(neighboringPeriods(months, "2024-01").earlier, undefined);
  });
});
