// Every country's gap between its share of coverage and its share of the
// benchmark, in percentage points, as a bar from the benchmark's line down the
// middle: right for more coverage than the benchmark's share, left for less.
// Each row pairs the two sides: the most over-covered country and the most
// under-covered in the top row, the second most of each in the next, and so
// on. The rows scroll inside a box of their own.
//
// The plot takes the whole width, so the bars have room. The countries' gaps
// and names are over its outer parts, gaps outermost, so each list reads
// straight down, and a long bar runs under them: the bars are see-through, so
// the text reads over them and their length still shows.
import { ANIMATION, COLORS, drawLegend, FOREGROUND, hideTooltipOnPressElsewhere, noDataNoteElement, OTHER_COUNTRIES_COLOR } from "./chart-common.js";
import { percentagePoints } from "./formats.js";
import { arrowIcon } from "./icons.js";

// Where each side's bars are in the chart's datasets: the over-covered side's
// first, then the under-covered side's.
const OVER_COVERED_DATASET_INDEX = 0;
const UNDER_COVERED_DATASET_INDEX = 1;

// Each row, and its bars' thickness within it: as tall as the text, so the
// text crosses into a bar all at once rather than partway up a letter.
const ROW_HEIGHT = 20;
const BAR_THICKNESS = 14;
// Between the gaps' and the names' columns.
const SPACE_BETWEEN_COLUMNS = 8;
// The names' column narrows to reach no closer than this to the line, so the
// two sides' names don't meet in the middle; a longer name is cut short:
// "Democratic Republic o…".
const MIN_SPACE_BESIDE_LINE = 12;
// The box's height for a period without data, about as tall as when it's full.
const WITHOUT_DATA_HEIGHT = 300;

// The bars' opacity, as the two hex digits added to the end of their
// "#rrggbb" color: 4d is 77 of 255, about 30%.
const BAR_FILL_ALPHA = "4d";
// Other countries' bars' color: the gray of their dots, cut to "#rrggbb" to
// drop the dots' own opacity, so the bars' can be added instead.
const OTHER_COUNTRIES_BAR_COLOR = OTHER_COUNTRIES_COLOR.slice(0, 7);
// How much of the page's text color is mixed into a highlighted country's
// color for its name (0 to 1), so the name stands out against its own bar,
// which is a see-through tint of the same color. Other names are in the text
// color itself.
const HIGHLIGHTED_NAME_TEXT_COLOR_MIX = 0.25;
// The lines from each name to its bar: faint, at this much of the grid lines'
// opacity (0 to 1), so they're fainter than the grid, and the hovered bar's
// brighter, at this much of the page's muted text color's.
const NAME_LINES_OPACITY = 0.5;
const HOVERED_NAME_LINE_OPACITY = 0.4;

// The distance between grid lines, 5 points. When a gap goes past the
// benchmark's usual axis end, the end is rounded up to a multiple of this.
const AXIS_STEP = 0.05;
// When the axis reaches past this many points (25) either way, only every
// other grid line is labeled, every 10 points, so the labels don't crowd, as
// with conflict deaths' ±40.
const LABEL_EVERY_GRID_LINE_UP_TO = 0.25;

const roundUp = (number, step) => Math.ceil(number / step) * step;

// Chart.js's interaction mode, choosing which bar the cursor hovers: the one
// in the cursor's row, on the cursor's side of the line down the middle. The
// cursor can be anywhere along that half of the row, so a tiny bar can still
// be hovered.
Chart.Interaction.modes.barOnSideOfRow = (chart, event, options, useFinalPosition) => {
  const barsInRow = Chart.Interaction.modes.index(chart, event, { axis: "y", intersect: false }, useFinalPosition);
  const benchmarkLineX = chart.scales.x.getPixelForValue(0);
  const cursorDatasetIndex = event.x >= benchmarkLineX ? OVER_COVERED_DATASET_INDEX : UNDER_COVERED_DATASET_INDEX;
  // A row past the end of the shorter side has no bar on that side.
  return barsInRow.filter(bar => bar.datasetIndex === cursorDatasetIndex && chart.data.datasets[cursorDatasetIndex].data[bar.index].code);
};

// Chart.js's tooltip position for a bar: its start, on the line down the
// middle, rather than its end, where the line from its name meets it.
Chart.Tooltip.positioners.barStart = tooltipItems => {
  if (tooltipItems.length === 0) return false;
  const bar = tooltipItems[0].element;
  return { x: bar.base, y: bar.y };
};

// overCovered, underCovered: each country's measures with its coverageGap,
// furthest from the benchmark first, from coverageGapsBySide in chart-data.js.
// benchmarkDisplaySettings: the benchmark's entry in BENCHMARK_DISPLAY_SETTINGS.
// noDataExplanation: for a period without a single day of data, why. The box
// is drawn empty and shaded, with the "No data ⓘ" note over it.
export function drawGapChart({ overCovered, underCovered, benchmarkDisplaySettings, focus, comparison, noDataExplanation }) {
  const allCountries = [...overCovered, ...underCovered];
  const axisMax = axisMaxFor(allCountries, benchmarkDisplaySettings);

  // The highlighted countries' color, as in the legend; other countries have none.
  const highlightColorOf = country => {
    if (country.code === focus.code) return COLORS.focus;
    if (country.code === comparison.code) return COLORS.comparison;
    return null;
  };

  // A row for each country on the longer side.
  const rowCount = Math.max(overCovered.length, underCovered.length);
  const rowLabels = [];
  for (let row = 0; row < rowCount; row++) rowLabels.push(String(row));

  const wrapper = document.getElementById("gap-chart-wrap");
  wrapper.style.height = noDataExplanation ? `${WITHOUT_DATA_HEIGHT}px` : `${rowCount * ROW_HEIGHT}px`;

  // The plot is inset from the canvas's edges by half the width of the
  // axis's end labels ("−15", "+15"). Those labels are centered over the
  // plot's ends, so they then end flush with the canvas's edges, lined up
  // with the gap figures. The grid lines at the plot's ends aren't drawn,
  // since they'd run through the gap figures.
  const axisLabelsRow = document.getElementById("gap-chart-axis");
  const endLabelsWidth = Math.max(textWidthIn(axisLabelsRow, axisLabel(-axisMax)), textWidthIn(axisLabelsRow, axisLabel(axisMax)));
  const plotInset = Math.ceil(endLabelsWidth / 2);
  const isAtPlotEnd = value => Math.abs(Math.abs(value) - axisMax) < AXIS_STEP / 2;

  const gapChart = new Chart(document.getElementById("gap-chart"), {
    type: "bar",
    data: {
      labels: rowLabels,
      // In the order of OVER_COVERED_DATASET_INDEX and UNDER_COVERED_DATASET_INDEX.
      datasets: [sideDataset(overCovered, rowLabels, highlightColorOf), sideDataset(underCovered, rowLabels, highlightColorOf)],
    },
    options: {
      indexAxis: "y",
      animation: ANIMATION,
      // A hovered bar's color changes at once, in one redraw, rather than over
      // a few: redrawing a canvas this tall again and again is slow on a
      // phone.
      transitions: { active: { animation: { duration: 0 } } },
      maintainAspectRatio: false,
      layout: { padding: { left: plotInset, right: plotInset } },
      interaction: { mode: "barOnSideOfRow" },
      scales: {
        x: {
          min: -axisMax,
          max: axisMax,
          // Labeled above the scrolling box instead, so they stay in view. See axisLabels.
          ticks: { display: false, stepSize: AXIS_STEP },
          grid: { drawTicks: false, color: ({ tick }) => (isAtPlotEnd(tick.value) ? "transparent" : Chart.defaults.borderColor) },
          border: { display: false },
        },
        y: { display: false },
      },
      plugins: {
        // In the page instead, above the scrolling box. See drawLegend.
        legend: { display: false },
        tooltip: {
          position: "barStart",
          withoutAnimation: true,
          awayFromBar: true,
          aboveOrBelowIfNoRoomBeside: true,
          // When the popup opens above or below the bar, as on a phone
          // where there's no room beside it, its arrow points halfway from
          // the line down the middle to the gap figures on the bar's side.
          // Pointing at the bar's start would put both sides' arrows on the
          // same spot.
          aboveOrBelowAt: item => halfwayToGapsColumn(item.chart, item),
          displayColors: false,
          callbacks: { title: items => items[0].raw.name },
          // Under the name, in place of lines of text.
          bodyFor: item => tooltipEquation(item.raw, benchmarkDisplaySettings),
        },
      },
    },
    plugins: [
      textColumns(allCountries),
      axisLabels(axisLabelsRow, axisMax),
      benchmarkLine(),
      barLabels(highlightColorOf),
      ...(noDataExplanation ? [shadedWithoutData(wrapper, noDataExplanation)] : []),
    ],
  });
  hideTooltipOnPressElsewhere(gapChart);

  // The side headings, either side of the line, each with an arrow pointing
  // the way its bars go.
  document.getElementById("gap-chart-under-side").prepend(arrowIcon("left"));
  document.getElementById("gap-chart-over-side").append(arrowIcon("right"));

  drawLegend(document.getElementById("gap-chart-legend"), [
    { label: "Other countries", color: OTHER_COUNTRIES_COLOR },
    { label: comparison.name, color: COLORS.comparison },
    { label: focus.name, color: COLORS.focus },
  ]);

  fadeEdgesWhileScrolling(document.getElementById("gap-chart-scroll"), gapChart);
}

// How far the axis reaches, the same each way so the line stays in the
// middle: the benchmark's usual gapAxisMax, or, if a gap is larger, that gap
// rounded up to a grid line.
function axisMaxFor(countries, benchmarkDisplaySettings) {
  let largestGap = 0;
  for (const country of countries) largestGap = Math.max(largestGap, Math.abs(country.coverageGap));
  return Math.max(benchmarkDisplaySettings.gapAxisMax, roundUp(largestGap, AXIS_STEP));
}

// One side's dataset: a bar in each row, for the side's countries in order.
// Each bar keeps its whole country, so the labels and tooltip can use its name
// and measures; a row past the end of the shorter side has an empty bar.
function sideDataset(countries, rowLabels, highlightColorOf) {
  const barData = [];
  for (const [rowIndex, rowLabel] of rowLabels.entries()) barData.push({ row: rowLabel, coverageGap: null, ...countries[rowIndex] });
  return {
    data: barData,
    parsing: { xAxisKey: "coverageGap", yAxisKey: "row" },
    backgroundColor: countries.map(country => `${highlightColorOf(country) ?? OTHER_COUNTRIES_BAR_COLOR}${BAR_FILL_ALPHA}`),
    barThickness: BAR_THICKNESS,
    borderRadius: 2,
    // Both sides' bars in the middle of their row, rather than side by side.
    grouped: false,
  };
}

// The tooltip's body, under the country's name: the gap worked out as a
// subtraction down the page, large, each number with what it is beside it,
// then a note on rounding:
//
//      4.3%  share of coverage
//   −
//     13.9%  composite score
//   ───────
//   −  9.6   coverage gap*
//
// All three to one decimal, as the bars' gaps, so a small country's shares
// read 0.0%. Each is rounded on its own, so the result can be off by 0.1, which
// the note says.
function tooltipEquation({ mentionsPercentage, benchmarkPercentage, coverageGap }, benchmarkDisplaySettings) {
  const inPoints = fraction => (fraction * 100).toFixed(1);

  const equation = document.createElement("div");
  equation.className = "gap-equation";
  // The "%" in a column of its own after the number, empty for the result,
  // so the numbers' last digits, and so their decimal points, line up.
  // The result's row is marked, so it alone is in the full text color.
  const addRow = (number, unit, label, isResult = false) => {
    for (const [className, text] of [["number", number], ["unit", unit], ["label", label]]) {
      const element = document.createElement("span");
      element.className = className;
      if (isResult) element.classList.add("result");
      element.textContent = text;
      equation.append(element);
    }
  };
  addRow(inPoints(mentionsPercentage), "%", "share of coverage");
  addRow(inPoints(benchmarkPercentage), "%", benchmarkDisplaySettings.shortShare);
  // Between the two shares rather than beside the second, so it doesn't read
  // as that share's sign.
  const minus = document.createElement("span");
  minus.className = "minus";
  minus.textContent = "−";
  equation.append(minus);
  const rule = document.createElement("span");
  rule.className = "rule";
  equation.append(rule);
  // The result's sign, as on its bar ("+", "−", or none for 0.0), in the
  // minus's column, so all three numbers' digits line up.
  const gapPoints = percentagePoints(coverageGap);
  const resultSign = document.createElement("span");
  resultSign.className = "sign result";
  resultSign.textContent = gapPoints.match(/^[+−]/)?.[0] ?? "";
  equation.append(resultSign);
  addRow(gapPoints.replace(/^[+−]/, ""), "", "coverage gap*", true);

  const roundingNote = document.createElement("div");
  roundingNote.className = "rounding-note";
  roundingNote.textContent = "* Numbers are rounded, so the math may be off by 0.1.";
  return [equation, roundingNote];
}

// Fades the box's top and bottom edges while there are more rows beyond them,
// so it reads as a list that scrolls. A tooltip left open would stay put while
// its row scrolls away, so scrolling hides it.
function fadeEdgesWhileScrolling(scrollArea, chart) {
  const onScroll = () => {
    const atTop = scrollArea.scrollTop <= 0;
    const atBottom = scrollArea.scrollTop + scrollArea.clientHeight >= scrollArea.scrollHeight - 1;
    scrollArea.classList.toggle("fade-top", !atTop);
    scrollArea.classList.toggle("fade-bottom", !atBottom);
    if (chart.getActiveElements().length > 0) {
      chart.setActiveElements([]);
      chart.tooltip.setActiveElements([], { x: 0, y: 0 });
      chart.update();
    }
  };
  onScroll();
  scrollArea.addEventListener("scroll", onScroll, { passive: true });
}

// A Chart.js plugin sizing the columns of gaps and names, before each layout
// of the chart: the gaps' as wide as the widest, and the names' as wide as the
// longest, but narrower where it'd come closer to the line than
// MIN_SPACE_BESIDE_LINE. The sizes are kept on the chart, as
// chart.textColumns, for barLabels.
function textColumns(countries) {
  return {
    id: "textColumns",
    beforeLayout(chart) {
      const { ctx } = chart;
      ctx.save();
      ctx.font = labelFont(true);
      let longestNameWidth = 0;
      for (const country of countries) longestNameWidth = Math.max(longestNameWidth, ctx.measureText(country.name).width);
      ctx.font = labelFont(false);
      let widestGapWidth = 0;
      for (const country of countries) widestGapWidth = Math.max(widestGapWidth, ctx.measureText(percentagePoints(country.coverageGap)).width);
      ctx.restore();

      const gapsColumnWidth = Math.ceil(widestGapWidth);
      const namesColumnWidth = Math.min(Math.ceil(longestNameWidth), Math.floor(chart.width / 2 - MIN_SPACE_BESIDE_LINE - gapsColumnWidth - SPACE_BETWEEN_COLUMNS));
      chart.textColumns = { namesColumnWidth, gapsColumnWidth };
    },
  };
}

// A Chart.js plugin labeling the grid lines in `labelsRow`, an element above the
// scrolling box, after each layout: "−10 −5 0 +5 +10", each label over its
// line, signed like the bars' gaps.
function axisLabels(labelsRow, axisMax) {
  const labelStep = axisMax > LABEL_EVERY_GRID_LINE_UP_TO ? 2 * AXIS_STEP : AXIS_STEP;
  return {
    id: "axisLabels",
    afterLayout(chart) {
      // The canvas sits inside the scrolling box, past its scrollbar's room.
      const canvasOffset = chart.canvas.getBoundingClientRect().left - labelsRow.getBoundingClientRect().left;
      const labelElements = [];
      // In whole steps, so floating-point sums don't drift off the lines.
      const stepCount = Math.round(axisMax / labelStep);
      for (let step = -stepCount; step <= stepCount; step++) {
        const value = step * labelStep;
        const labelElement = document.createElement("span");
        labelElement.textContent = axisLabel(value);
        labelElement.style.left = `${canvasOffset + chart.scales.x.getPixelForValue(value)}px`;
        labelElements.push(labelElement);
      }
      labelsRow.replaceChildren(...labelElements);
    },
  };
}

// A grid line's label: "−10", "0", "+10".
function axisLabel(value) {
  const points = Math.round(Math.abs(value) * 100);
  if (points === 0) return "0";
  return value < 0 ? `−${points}` : `+${points}`;
}

// How wide the text is in the element's font, measured in a span put in it
// for the moment.
function textWidthIn(element, text) {
  const span = document.createElement("span");
  span.textContent = text;
  element.append(span);
  const { width } = span.getBoundingClientRect();
  span.remove();
  return width;
}

// A Chart.js plugin drawing the benchmark's line down the middle, where the
// gaps are zero: dashed, as the scatter's. Under the bars, which start on it.
function benchmarkLine() {
  return {
    id: "benchmarkLine",
    beforeDatasetsDraw(chart) {
      const lineX = Math.round(chart.scales.x.getPixelForValue(0)) + 0.5;
      const { ctx, chartArea } = chart;
      ctx.save();
      ctx.strokeStyle = Chart.defaults.color;
      ctx.lineWidth = 1;
      ctx.setLineDash([4, 4]);
      ctx.beginPath();
      ctx.moveTo(lineX, chartArea.top);
      ctx.lineTo(lineX, chartArea.bottom);
      ctx.stroke();
      ctx.restore();
    },
  };
}

// A Chart.js plugin writing each bar's gap and country, level with the bar:
// "−9.8  China" on the left, mirrored on the right as "Israel  +5.2". The
// gaps are flush with the edges, and the names line up just inside them, so
// each row's text reaches in only as far as its name, and a short name leaves
// its bar more room. A name can be far from its bar, so each gets a faint
// line from its name to its end, brighter for the hovered bar.
function barLabels(highlightColorOf) {
  return {
    id: "barLabels",
    afterDatasetsDraw(chart) {
      const { ctx } = chart;
      const { namesColumnWidth, gapsColumnWidth } = chart.textColumns;
      // How far in from the outer edge the names start.
      const namesStart = gapsColumnWidth + SPACE_BETWEEN_COLUMNS;

      ctx.save();
      // Level with the bars by the capitals' and figures' middle: a
      // "middle" baseline centers the font's whole height, room below the
      // line included, and sets the text a little high.
      ctx.textBaseline = "alphabetic";
      ctx.font = labelFont(false);
      const halfCapHeight = ctx.measureText("H").actualBoundingBoxAscent / 2;

      for (const datasetIndex of [OVER_COVERED_DATASET_INDEX, UNDER_COVERED_DATASET_INDEX]) {
        const isLeft = datasetIndex === UNDER_COVERED_DATASET_INDEX;
        // Turns a distance in from this side's outer edge into an x across
        // the chart, so both sides can be laid out with the same distances.
        const fromOuterEdge = distance => (isLeft ? distance : chart.width - distance);
        ctx.textAlign = isLeft ? "left" : "right";
        const bars = chart.getDatasetMeta(datasetIndex).data;
        const countries = chart.data.datasets[datasetIndex].data;
        for (const [rowIndex, bar] of bars.entries()) {
          const country = countries[rowIndex];
          // A row past the end of the shorter side has no country on this side.
          if (!country.code) continue;
          const textY = bar.y + halfCapHeight;

          ctx.font = labelFont(false);
          ctx.fillStyle = Chart.defaults.color;
          ctx.fillText(percentagePoints(country.coverageGap), fromOuterEdge(0), textY);

          const highlightColor = highlightColorOf(country);
          ctx.font = labelFont(Boolean(highlightColor));
          ctx.fillStyle = highlightColor ? mixed(highlightColor, FOREGROUND, HIGHLIGHTED_NAME_TEXT_COLOR_MIX) : FOREGROUND;
          const shownName = cutShort(ctx, country.name, namesColumnWidth);
          ctx.fillText(shownName, fromOuterEdge(namesStart), textY);

          // From just past the name's inner end to the bar's end, where the
          // bar doesn't already reach the name.
          const lineStart = fromOuterEdge(namesStart + ctx.measureText(shownName).width + SPACE_BETWEEN_COLUMNS);
          const reachesName = isLeft ? bar.x <= lineStart : bar.x >= lineStart;
          if (reachesName) continue;
          const isHovered = chart.getActiveElements().some(activeBar => activeBar.datasetIndex === datasetIndex && activeBar.index === rowIndex);
          const lineY = Math.round(bar.y) + 0.5;
          ctx.strokeStyle = isHovered ? Chart.defaults.color : Chart.defaults.borderColor;
          ctx.globalAlpha = isHovered ? HOVERED_NAME_LINE_OPACITY : NAME_LINES_OPACITY;
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.moveTo(lineStart, lineY);
          ctx.lineTo(bar.x, lineY);
          ctx.stroke();
          ctx.globalAlpha = 1;
        }
      }
      ctx.restore();
    },
  };
}

// The labels' font: the two highlighted countries' names in bold.
function labelFont(isBold) {
  const font = Chart.defaults.font;
  return `${isBold ? "600 " : ""}${font.size}px ${font.family}`;
}

// The name as it is if it fits in `maxWidth` in the context's font, or cut
// short with an ellipsis where it doesn't.
function cutShort(ctx, fullName, maxWidth) {
  if (ctx.measureText(fullName).width <= maxWidth) return fullName;
  let shortened = fullName;
  while (shortened.length > 1 && ctx.measureText(`${shortened}…`).width > maxWidth) {
    shortened = shortened.slice(0, -1);
  }
  return `${shortened.trimEnd()}…`;
}

// Two "#rrggbb" colors mixed, with `mixInAmount` (0 to 1) of the second.
function mixed(baseColor, mixInColor, mixInAmount) {
  // A color's red, green and blue parts, each 0 to 255.
  const redGreenBlueOf = hexColor => [1, 3, 5].map(start => parseInt(hexColor.slice(start, start + 2), 16));
  const mixInParts = redGreenBlueOf(mixInColor);
  const mixedParts = redGreenBlueOf(baseColor).map((colorPart, partIndex) => Math.round(colorPart + (mixInParts[partIndex] - colorPart) * mixInAmount));
  return `rgb(${mixedParts.join(", ")})`;
}

// The x halfway from the line down the middle to the inner edge of the gap
// figures' column, on the item's side.
function halfwayToGapsColumn(chart, item) {
  const { gapsColumnWidth } = chart.textColumns;
  const gapsColumnInnerEdge = item.datasetIndex === UNDER_COVERED_DATASET_INDEX ? gapsColumnWidth : chart.width - gapsColumnWidth;
  return (item.element.base + gapsColumnInnerEdge) / 2;
}

// A Chart.js plugin shading the empty box, as the scatter shades its plot,
// with the note in the middle of it.
function shadedWithoutData(wrapper, explanation) {
  let shadeElement;
  return {
    id: "shadedWithoutData",
    afterLayout(chart) {
      if (!shadeElement) {
        shadeElement = document.createElement("div");
        shadeElement.className = "gap-chart-without-data";
        wrapper.append(shadeElement);
        const noteElement = noDataNoteElement(shadeElement, explanation);
        noteElement.dataset.side = "center";
        noteElement.style.top = "50%";
        noteElement.style.left = "50%";
      }
      const { left, top, width, height } = chart.chartArea;
      shadeElement.style.left = `${left}px`;
      shadeElement.style.top = `${top}px`;
      shadeElement.style.width = `${width}px`;
      shadeElement.style.height = `${height}px`;
    },
  };
}
