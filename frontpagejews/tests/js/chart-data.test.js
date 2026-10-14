// Tests for chart-data.js, the charts' numbers. Run with `npm test`.
import assert from "node:assert/strict";
import { describe, test } from "node:test";

import {
  benchmarkTotal,
  lineChartRows,
  mentionsByCountry,
  scatterPoints,
  withComposite,
  withoutCountries,
} from "../../static/frontpagejews/chart-data.js";
import { siteData } from "./site-data.js";

describe("withoutCountries", () => {
  test("drops the countries' mentions, benchmark figures and names", () => {
    const data = siteData({ "2026-09-22": { bbc: { ISR: 1, USA: 2 } } }, { population: { ISR: 10, USA: 300 } });

    const without = withoutCountries(data, ["USA", "GBR"]);

    assert.deepEqual(without.days[0].mentions.bbc, { ISR: 1 });
    assert.deepEqual(without.benchmark_figures.population, { ISR: 10 });
    assert.deepEqual(without.names, { CHN: "China", ISR: "Israel" });
  });
});

describe("withComposite", () => {
  test("averages each country's shares of the benchmarks by weight", () => {
    // Israel has 10% of the people and 50% of the dollars.
    const data = siteData({}, { population: { ISR: 10, CHN: 90 }, gdp: { ISR: 5, CHN: 5 } });

    const { composite } = withComposite(data, { population: 0.5, gdp: 0.5 }).benchmark_figures;

    assert.deepEqual(composite, { CHN: 0.7, ISR: 0.3 });
  });

  test("leaves out a country missing any of the figures", () => {
    const data = siteData({}, { population: { ISR: 10, CHN: 90 }, gdp: { ISR: 5 } });

    const { composite } = withComposite(data, { population: 0.5, gdp: 0.5 }).benchmark_figures;

    assert.deepEqual(Object.keys(composite), ["ISR"]);
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
        focusMentionsPercentage: 0.75,
        focusBenchmarkPercentage: 0.1,
        comparisonMentionsPercentage: 0.25,
        comparisonBenchmarkPercentage: 0.9,
      },
    ]);
  });

  test("counts only the selected outlets", () => {
    // Fox alone gives Israel 3 of 4 mentions; with the BBC it would be 3 of 8.
    const data = siteData({ "2026-09-22": { fox: { ISR: 3, CHN: 1 }, bbc: { CHN: 4 } } });

    assert.equal(lineChartRows(data, ["fox"], "CHN", "population")[0].focusMentionsPercentage, 0.75);
  });

  test("measures reality by the chosen benchmark", () => {
    // Israel has 10 of the 100 people but 1 of the 4 dollars.
    const data = siteData(
      { "2026-09-22": { bbc: { ISR: 1 } } },
      { population: { ISR: 10, CHN: 90 }, gdp: { ISR: 1, CHN: 3 } },
    );

    assert.equal(lineChartRows(data, ["bbc"], "CHN", "gdp")[0].focusBenchmarkPercentage, 0.25);
  });
});

describe("scatterPoints", () => {
  test("plots each country's share of mentions against its population", () => {
    // Israel has 3 of the 4 mentions and 10 of the 100 people.
    const data = siteData({ "2026-09-22": { bbc: { ISR: 3, CHN: 1 } } }, { population: { ISR: 10, CHN: 90 } });

    assert.deepEqual(scatterPoints(data, ["bbc"], "population"), [
      { code: "CHN", name: "China", mentions: 1, mentionsPercentage: 0.25, benchmarkFigure: 90, benchmarkPercentage: 0.9 },
      { code: "ISR", name: "Israel", mentions: 3, mentionsPercentage: 0.75, benchmarkFigure: 10, benchmarkPercentage: 0.1 },
    ]);
  });

  test("leaves off countries with no figure for the chosen benchmark", () => {
    const data = siteData(
      { "2026-09-22": { bbc: { ISR: 1, PRK: 1 } } },
      { population: { ISR: 10, PRK: 30 }, gdp: { ISR: 5 } },
    );

    assert.deepEqual(scatterPoints(data, ["bbc"], "gdp").map(point => point.code), ["ISR"]);
  });
});

describe("benchmarkTotal", () => {
  test("adds up every country's figure", () => {
    const data = siteData({}, { population: { ISR: 10, CHN: 90 } });

    assert.equal(benchmarkTotal(data, "population"), 100);
  });
});
