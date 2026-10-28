// Tests for chart-data.js, the charts' numbers. Run with `npm test`.
import assert from "node:assert/strict";
import { describe, test } from "node:test";

import {
  benchmarkTotal,
  lineChartRows,
  mentionsByCountry,
  scatterPoints,
  withComposite,
  withCountriesCombined,
  withoutCountries,
} from "../../static/frontpagejews/chart-data.js";
import { siteData } from "./site-data.js";

describe("withoutCountries", () => {
  test("drops the countries' mentions, benchmark figures and names", () => {
    const data = siteData({ "2026-09-22": { bbc: { ISR: 1, USA: 2 } } }, { population: { ISR: 10, USA: 300 } });

    const without = withoutCountries(data, ["USA", "GBR"]);

    assert.deepEqual(without.days[0].country_set_mentions_by_outlet.bbc, { ISR: 1 });
    assert.deepEqual(without.benchmark_figures.population, { ISR: 10 });
    assert.deepEqual(without.names, { CHN: "China", ISR: "Israel" });
  });

  test("takes the countries out of each article's set, keeping its other countries", () => {
    const data = siteData({ "2026-09-22": { bbc: { "ISR,USA": 2, ISR: 1, "CHN,GBR,USA": 1, USA: 4 } } });

    const without = withoutCountries(data, ["USA", "GBR"]);

    assert.deepEqual(without.days[0].country_set_mentions_by_outlet.bbc, { ISR: 3, CHN: 1 });
  });
});

describe("withCountriesCombined", () => {
  test("counts an article about any of the countries once for the group", () => {
    const data = siteData({ "2026-09-22": { bbc: { "RUS,UKR": 2, RUS: 1, "ISR,UKR": 1, ISR: 4 } } });

    const combined = withCountriesCombined(data, ["UKR", "RUS"]);

    assert.deepEqual(combined.days[0].country_set_mentions_by_outlet.bbc, { "RUS+UKR": 3, "ISR,RUS+UKR": 1, ISR: 4 });
    assert.deepEqual(mentionsByCountry(combined.days, ["bbc"]), { "RUS+UKR": 4, ISR: 5 });
  });

  test("adds up the countries' benchmark figures", () => {
    const data = siteData({}, { population: { RUS: 140, UKR: 40, ISR: 10 } });

    const combined = withCountriesCombined(data, ["RUS", "UKR"]);

    assert.deepEqual(combined.benchmark_figures.population, { "RUS+UKR": 180, ISR: 10 });
  });

  test("gives the group no figure where any of the countries has none", () => {
    const data = siteData({}, { gdp: { RUS: 2000, ISR: 500 } });

    const combined = withCountriesCombined(data, ["RUS", "UKR"]);

    assert.deepEqual(combined.benchmark_figures.gdp, { ISR: 500 });
  });

  test("names the group after the countries", () => {
    const data = siteData({});

    const combined = withCountriesCombined(data, ["CHN", "USA"]);

    assert.deepEqual(combined.names, { "CHN+USA": "China + United States", ISR: "Israel", GBR: "United Kingdom" });
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

  test("counts an article once for each country in its set", () => {
    const data = siteData({ "2026-09-22": { bbc: { "IRN,ISR": 2, ISR: 1 } } });

    assert.deepEqual(mentionsByCountry(data.days, ["bbc"]), { IRN: 2, ISR: 3 });
  });

  test("ignores outlets not selected", () => {
    const data = siteData({ "2026-09-22": { fox: { ISR: 1 } } });

    assert.deepEqual(mentionsByCountry(data.days, ["bbc"], "population"), {});
  });
});

describe("lineChartRows", () => {
  test("gives each day's coverage and population shares", () => {
    // Israel has 30 of the 40 mentions and 10 of the 100 people.
    const data = siteData({ "2026-09-22": { bbc: { ISR: 30, CHN: 10 } } }, { population: { ISR: 10, CHN: 90 } });

    assert.deepEqual(lineChartRows(data, ["bbc"], "CHN", "population"), [
      {
        date: "2026-09-22",
        gdeltHasDay: true,
        focusMentionsPercentage: 0.75,
        focusBenchmarkPercentage: 0.1,
        comparisonMentionsPercentage: 0.25,
        comparisonBenchmarkPercentage: 0.9,
      },
    ]);
  });

  test("counts only the selected outlets", () => {
    // Fox alone gives Israel 30 of 40 mentions; with the BBC it would be 30 of 80.
    const data = siteData({ "2026-09-22": { fox: { ISR: 30, CHN: 10 }, bbc: { CHN: 40 } } });

    assert.equal(lineChartRows(data, ["fox"], "CHN", "population")[0].focusMentionsPercentage, 0.75);
  });

  test("gives no coverage shares for a day without mentions, rather than 0", () => {
    // GDELT has no data for the 23rd, so the line breaks there.
    const data = siteData({ "2026-09-22": { bbc: { ISR: 10 } }, "2026-09-23": { bbc: {} } });

    const [, dayWithoutData] = lineChartRows(data, ["bbc"], "CHN", "population");

    assert.equal(dayWithoutData.focusMentionsPercentage, null);
    assert.equal(dayWithoutData.comparisonMentionsPercentage, null);
  });

  test("gives no coverage shares for a day with too few mentions to share out", () => {
    // 9 mentions, one under the minimum: China's 0% of them would mean nothing.
    const data = siteData({ "2026-09-22": { bbc: { ISR: 9 } } });

    assert.equal(lineChartRows(data, ["bbc"], "CHN", "population")[0].comparisonMentionsPercentage, null);
  });

  test("tells a day GDELT has nothing for from one the selected outlets missed", () => {
    // On the 22nd only Fox has articles; on the 23rd, no outlet does.
    const data = siteData({ "2026-09-22": { fox: { ISR: 1 }, bbc: {} }, "2026-09-23": { fox: {}, bbc: {} } });

    const [outletsMissing, gdeltMissing] = lineChartRows(data, ["bbc"], "CHN", "population");

    assert.equal(outletsMissing.gdeltHasDay, true);
    assert.equal(gdeltMissing.gdeltHasDay, false);
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
