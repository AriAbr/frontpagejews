// Tests for coverage.js, the page's numbers. Run with `npm test`.
import assert from "node:assert/strict";
import { describe, test } from "node:test";

import {
  averageMentionsPerUnit,
  choicesFromUrl,
  choicesQuery,
  comparisonChoices,
  lineChartRows,
  mentionsByCountry,
  scatterPoints,
} from "../../static/frontpagejews/coverage.js";

// A data.json with the given days of per-outlet mentions, e.g.
// { "2026-09-22": { bbc: { ISR: 3 } } }, and benchmark figures, e.g.
// { population: { ISR: 10 } }.
function siteData(mentionsByDay, benchmarkFigures = {}) {
  return {
    focus: "ISR",
    default_comparison: "CHN",
    default_benchmark: "population",
    outlets: { fox: "Fox News", bbc: "BBC" },
    home_countries: ["GBR", "USA"],
    names: { CHN: "China", ISR: "Israel", USA: "United States", GBR: "United Kingdom" },
    benchmark_figures: { population: {}, gdp: {}, ...benchmarkFigures },
    days: Object.entries(mentionsByDay).map(([date, mentions]) => ({ date, mentions })),
  };
}

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

describe("mentionsByCountry", () => {
  test("adds up mentions across outlets and days", () => {
    const data = siteData({
      "2026-09-21": { bbc: { ISR: 1 }, fox: { ISR: 2, USA: 1 } },
      "2026-09-22": { bbc: { USA: 1 } },
    });

    assert.deepEqual(mentionsByCountry(data.days, ["bbc", "fox"]), { ISR: 3, USA: 2 });
  });

  test("ignores outlets not selected", () => {
    const data = siteData({ "2026-09-22": { fox: { ISR: 1 } } });

    assert.deepEqual(mentionsByCountry(data.days, ["bbc"], "population"), {});
  });
});

describe("lineChartRows", () => {
  test("gives each day's coverage and population shares", () => {
    // Israel has 3 of the 4 mentions and 10 of the 100 people.
    const data = siteData({ "2026-09-22": { bbc: { ISR: 3, CHN: 1 } } }, { population: { ISR: 10, CHN: 90 } });

    assert.deepEqual(lineChartRows(data, ["bbc"], "CHN", "population"), [
      {
        date: "2026-09-22",
        focusCoverage: 0.75,
        focusReality: 0.1,
        comparisonCoverage: 0.25,
        comparisonReality: 0.9,
      },
    ]);
  });

  test("counts only the selected outlets", () => {
    // Fox alone gives Israel 3 of 4 mentions; with the BBC it would be 3 of 8.
    const data = siteData({ "2026-09-22": { fox: { ISR: 3, CHN: 1 }, bbc: { CHN: 4 } } });

    assert.equal(lineChartRows(data, ["fox"], "CHN", "population")[0].focusCoverage, 0.75);
  });

  test("measures reality by the chosen benchmark", () => {
    // Israel has 10 of the 100 people but 1 of the 4 dollars.
    const data = siteData(
      { "2026-09-22": { bbc: { ISR: 1 } } },
      { population: { ISR: 10, CHN: 90 }, gdp: { ISR: 1, CHN: 3 } },
    );

    assert.equal(lineChartRows(data, ["bbc"], "CHN", "gdp")[0].focusReality, 0.25);
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

describe("scatterPoints", () => {
  test("plots each country's mentions against its population", () => {
    const data = siteData({ "2026-09-22": { bbc: { ISR: 3, CHN: 1 } } }, { population: { ISR: 10, CHN: 90 } });

    assert.deepEqual(scatterPoints(data, ["bbc"], "population"), [
      { code: "CHN", name: "China", mentions: 1, reality: 90 },
      { code: "ISR", name: "Israel", mentions: 3, reality: 10 },
    ]);
  });

  test("leaves the outlets' home countries off", () => {
    const data = siteData({ "2026-09-22": { bbc: { ISR: 1, USA: 1, GBR: 1 } } }, { population: { ISR: 10, USA: 30, GBR: 60 } });

    assert.deepEqual(scatterPoints(data, ["bbc"], "population").map(point => point.code), ["ISR"]);
  });

  test("leaves off countries with no figure for the chosen benchmark", () => {
    const data = siteData(
      { "2026-09-22": { bbc: { ISR: 1, PRK: 1 } } },
      { population: { ISR: 10, PRK: 30 }, gdp: { ISR: 5 } },
    );

    assert.deepEqual(scatterPoints(data, ["bbc"], "gdp"), [{ code: "ISR", name: "Israel", mentions: 1, reality: 5 }]);
  });
});

describe("averageMentionsPerUnit", () => {
  test("divides all mentions by all people", () => {
    // 10 mentions over 100 people.
    const data = siteData({ "2026-09-22": { bbc: { ISR: 6, CHN: 4 } } }, { population: { ISR: 10, CHN: 90 } });

    assert.equal(averageMentionsPerUnit(data, ["bbc"], "population"), 10 / 100);
  });

  test("leaves the outlets' home countries out of both sides", () => {
    // Only Israel and China count: 10 mentions over 100 people.
    const data = siteData(
      { "2026-09-22": { bbc: { ISR: 6, CHN: 4, USA: 50, GBR: 50 } } },
      { population: { ISR: 10, CHN: 90, USA: 300, GBR: 70 } },
    );

    assert.equal(averageMentionsPerUnit(data, ["bbc"], "population"), 10 / 100);
  });
});
