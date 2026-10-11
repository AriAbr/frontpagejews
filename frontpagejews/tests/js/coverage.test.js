// Tests for coverage.js, the page's numbers. Run with `npm test`.
import assert from "node:assert/strict";
import { describe, test } from "node:test";

import {
  averageMentionsPerPerson,
  choicesFromUrl,
  comparisonChoices,
  lineChartRows,
  mentionsByCountry,
  scatterPoints,
} from "../../static/frontpagejews/coverage.js";

// A data.json with the given days of per-outlet mentions, e.g.
// { "2026-09-22": { bbc: { ISR: 3 } } }, and population.
function siteData(mentionsByDay, population = {}) {
  return {
    focus: "ISR",
    default_comparison: "CHN",
    outlets: { fox: "Fox News", bbc: "BBC" },
    home_countries: ["GBR", "USA"],
    names: { CHN: "China", ISR: "Israel", USA: "United States", GBR: "United Kingdom" },
    population,
    days: Object.entries(mentionsByDay).map(([date, mentions]) => ({ date, mentions })),
  };
}

describe("choicesFromUrl", () => {
  const data = siteData({});

  test("compares Israel with China and uses every outlet by default", () => {
    assert.deepEqual(choicesFromUrl("", data), { selectedOutlets: ["fox", "bbc"], comparisonCode: "CHN" });
  });

  test("takes the outlets and country given", () => {
    assert.deepEqual(choicesFromUrl("?vs=USA&outlet=bbc", data), { selectedOutlets: ["bbc"], comparisonCode: "USA" });
  });

  test("uses every outlet when none valid is given", () => {
    assert.deepEqual(choicesFromUrl("?outlet=not-an-outlet", data).selectedOutlets, ["fox", "bbc"]);
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

    assert.deepEqual(mentionsByCountry(data.days, ["bbc"]), {});
  });
});

describe("lineChartRows", () => {
  test("gives each day's coverage and population shares", () => {
    // Israel has 3 of the 4 mentions and 10 of the 100 people.
    const data = siteData({ "2026-09-22": { bbc: { ISR: 3, CHN: 1 } } }, { ISR: 10, CHN: 90 });

    assert.deepEqual(lineChartRows(data, ["bbc"], "CHN"), [
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

    assert.equal(lineChartRows(data, ["fox"], "CHN")[0].focusCoverage, 0.75);
  });
});

describe("comparisonChoices", () => {
  test("offers every mentioned country with a population but Israel, most mentioned first", () => {
    const data = siteData(
      { "2026-09-22": { bbc: { ISR: 5, CHN: 1, USA: 3, XKX: 9 } } },
      { ISR: 10, CHN: 30, USA: 60 },
    );

    assert.deepEqual(comparisonChoices(data, ["bbc"]), [
      { code: "USA", name: "United States" },
      { code: "CHN", name: "China" },
    ]);
  });
});

describe("scatterPoints", () => {
  test("plots each country's mentions against its population", () => {
    const data = siteData({ "2026-09-22": { bbc: { ISR: 3, CHN: 1 } } }, { ISR: 10, CHN: 90 });

    assert.deepEqual(scatterPoints(data, ["bbc"]), [
      { code: "CHN", name: "China", mentions: 1, population: 90 },
      { code: "ISR", name: "Israel", mentions: 3, population: 10 },
    ]);
  });

  test("leaves the outlets' home countries off", () => {
    const data = siteData({ "2026-09-22": { bbc: { ISR: 1, USA: 1, GBR: 1 } } }, { ISR: 10, USA: 30, GBR: 60 });

    assert.deepEqual(scatterPoints(data, ["bbc"]).map(point => point.code), ["ISR"]);
  });
});

describe("averageMentionsPerPerson", () => {
  test("divides all mentions by all people", () => {
    // 10 mentions over 100 people.
    const data = siteData({ "2026-09-22": { bbc: { ISR: 6, CHN: 4 } } }, { ISR: 10, CHN: 90 });

    assert.equal(averageMentionsPerPerson(data, ["bbc"]), 10 / 100);
  });

  test("leaves the outlets' home countries out of both sides", () => {
    // Only Israel and China count: 10 mentions over 100 people.
    const data = siteData(
      { "2026-09-22": { bbc: { ISR: 6, CHN: 4, USA: 50, GBR: 50 } } },
      { ISR: 10, CHN: 90, USA: 300, GBR: 70 },
    );

    assert.equal(averageMentionsPerPerson(data, ["bbc"]), 10 / 100);
  });
});
