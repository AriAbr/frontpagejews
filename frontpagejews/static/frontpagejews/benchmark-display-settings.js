// How each benchmark is labelled and drawn. Its description says in a few
// words what it is, under its label in the benchmark choice. It has to fit on
// one line of the button, which has 192px for it (see dashboard.css). The keys
// match BENCHMARKS in benchmarks.py, and data.json's benchmark_figures, plus
// "composite", which withComposite (chart-data.js) works out in the browser.
//
// The scatter's benchmark axis shows the benchmark's own figures (people,
// dollars, deaths, or for the composite score, shares). Its maximum is fixed
// so the axis never rescales: just past the largest figure in the 12 months
// to August 2026, with the US and UK left out. Its grid lines are axisStep
// apart, about 1% of the benchmark's total, which makes the grid's cells near
// square, since the chart is sized for a 45-degree line. Only the lines at
// multiples of labelStep get a label, where there is one.
import { compact, percent } from "./formats.js";

export const BENCHMARK_DISPLAY_SETTINGS = {
  composite: {
    label: "Composite score",
    description: "Population + GDP + deaths",
    // Fills in the page's descriptions: "against its composite score".
    noun: "composite score",
    share: "composite score — the average of its shares of population, GDP and conflict deaths",
    // A country's share, as the headline puts it after its share of mentions.
    // The composite score is already a share, so "0.9% of the composite score"
    // would read as a share of a share.
    describeShare: share => `${percent(share)} composite score`,
    // A country's share and figure, as the scatter's tooltip puts them, like
    // its mentions: "1.0% of the world's population (84M)". The composite
    // score's figure is its share, so it's given once.
    describeFigure: (score, share) => `${percent(share)} composite score`,
    // China, 13.9%.
    axisMax: 0.15,
    axisStep: 0.01,
    format: percent,
  },
  population: {
    label: "Population",
    description: "Share of world's people",
    noun: "population",
    share: "share of the world's population",
    describeShare: share => `${percent(share)} of the world's population`,
    // India, 1.46B.
    axisMax: 1.5e9,
    axisStep: 100e6,
    format: compact,
    describeFigure: (people, share) => `${percent(share)} of the world's population (${compact(people)})`,
  },
  gdp: {
    label: "GDP",
    description: "Share of world economy",
    noun: "GDP",
    share: "share of world GDP",
    describeShare: share => `${percent(share)} of world GDP`,
    // China, $18.7T.
    axisMax: 20e12,
    axisStep: 1e12,
    format: dollars => `$${compact(dollars)}`,
    describeFigure: (dollars, share) => `${percent(share)} of world GDP ($${compact(dollars)})`,
  },
  conflict_deaths: {
    label: "Conflict deaths",
    description: "Share of armed conflict deaths",
    noun: "conflict deaths",
    share: "share of the world's conflict deaths",
    describeShare: share => `${percent(share)} of the world's conflict deaths`,
    // Ukraine, 85K.
    axisMax: 100e3,
    // 1% of the total is about 2,350.
    axisStep: 2.5e3,
    labelStep: 5e3,
    format: compact,
    describeFigure: (deaths, share) => `${percent(share)} of the world's conflict deaths (${compact(deaths)})`,
  },
};
