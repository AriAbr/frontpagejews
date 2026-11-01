"""Everything the dashboard needs, as one JSON-ready dict.

The site is static: `manage.py build_site` writes this out as `data.json`, and
the page's scripts do the rest in the browser, since which outlets and which
comparison country to show are the visitor's choice. Mentions are counted per
set of countries (see `outlet_country_set_mentions`) and summed per outlet
here, so the browser only adds up the outlets that are ticked.

`data.json` holds the last `DAYS_SHOWN` days. Each earlier month the visitor can
pick instead is a file of its own, `months/YYYY-MM.json`, so the page only
downloads the month it shows.
"""

from datetime import UTC, datetime

from frontpagejews import benchmarks, gdelt
from frontpagejews.countries import country_name
from frontpagejews.news_coverage import DAYS_SHOWN, HOME_COUNTRIES, OUTLETS, outlet_country_set_mentions

FOCUS = "ISR"
DEFAULT_COMPARISON = "CHN"
# Israel, Gaza and the West Bank are shown as one, "Israel". GDELT files much of
# the coverage of Gaza and the West Bank under Israel (see `country_codes.py`),
# and the World Bank has one figure for the two, Palestine's, whose borders
# needn't match GDELT's. The sources' data keeps them apart; they're merged here.
# UCDP files deaths in all three under Israel already.
MERGED_INTO_FOCUS_MENTIONS = {"XGZ", "XWB"}
MERGED_INTO_FOCUS_FIGURES = {"PSE"}
# Worked out in the browser from the other benchmarks (withComposite in
# chart-data.js), so it has no figures here.
DEFAULT_BENCHMARK = "composite"


def with_mentions_merged_into_focus(country_set_mentions):
    """Mentions per country set, with Gaza and the West Bank counted as the
    focus, Israel: {"ISR,XGZ": 2, "XGZ": 1} -> {"ISR": 3}."""
    merged = {}
    for country_set_key, mention_count in country_set_mentions.items():
        countries = set(country_set_key.split(","))
        if countries & MERGED_INTO_FOCUS_MENTIONS:
            countries = (countries - MERGED_INTO_FOCUS_MENTIONS) | {FOCUS}
        merged_key = gdelt.country_set_key(countries)
        merged[merged_key] = merged.get(merged_key, 0) + mention_count
    return merged


def with_figures_merged_into_focus(figures):
    """A benchmark's figures by ISO3, with Palestine's added to Israel's."""
    merged = dict(figures)
    for code in MERGED_INTO_FOCUS_FIGURES:
        figure = merged.pop(code, None)
        if figure is not None and FOCUS in merged:
            merged[FOCUS] += figure
    return merged


def load_country_set_mentions_by_outlet(days):
    """Each day's mentions per country set, per outlet, as the page reads them."""
    day_summaries = [gdelt.load_day(day) for day in days]
    return [
        {
            "date": day_summary["date"],
            "country_set_mentions_by_outlet": {
                slug: with_mentions_merged_into_focus(outlet_country_set_mentions(day_summary, slug))
                for slug in OUTLETS
            },
        }
        for day_summary in day_summaries
    ]


def cached_past_months():
    """The months with cached days, as "YYYY-MM", oldest first. Not the current
    month, which isn't over yet; the last `DAYS_SHOWN` days cover it."""
    this_month = f"{datetime.now(UTC):%Y-%m}"
    all_cached_months = {f"{day:%Y-%m}" for day in gdelt.cached_days()}
    return sorted(month for month in all_cached_months if month < this_month)


def month_site_data(month):
    """The days of one month, "YYYY-MM", for the page to show in place of the last
    `DAYS_SHOWN` days, and the benchmarks' figures for it: population and GDP
    for its year, and the conflict deaths over the 12 months up to it."""
    population_history = benchmarks.load_history("population")
    population_year = benchmarks.world_bank_year_for(population_history, month[:4])
    gdp_history = benchmarks.load_history("gdp")
    gdp_year = benchmarks.world_bank_year_for(gdp_history, month[:4])
    deaths_history = benchmarks.load_history("conflict_deaths")
    deaths_months = benchmarks.conflict_deaths_months_for(deaths_history, month)
    return {
        "days": load_country_set_mentions_by_outlet(
            [day for day in gdelt.cached_days() if f"{day:%Y-%m}" == month]
        ),
        "benchmark_figures": {
            "population": with_figures_merged_into_focus(population_history[population_year]),
            "gdp": with_figures_merged_into_focus(gdp_history[gdp_year]),
            "conflict_deaths": with_figures_merged_into_focus(
                benchmarks.conflict_deaths_over(deaths_history, deaths_months)
            ),
        },
    }


def site_data():
    figures_by_benchmark = {
        benchmark: with_figures_merged_into_focus(benchmarks.load_figures(benchmark))
        for benchmark in benchmarks.BENCHMARKS
    }
    days_shown = gdelt.cached_days()[-DAYS_SHOWN:]
    daily_country_set_mentions_by_outlet = load_country_set_mentions_by_outlet(days_shown)
    last_fetched = gdelt.last_fetched(days_shown)
    mentioned_country_codes = set()
    for day in daily_country_set_mentions_by_outlet:
        for country_set_mentions in day["country_set_mentions_by_outlet"].values():
            for country_set_key in country_set_mentions:
                mentioned_country_codes.update(country_set_key.split(","))
    benchmarked_country_codes = {code for figures in figures_by_benchmark.values() for code in figures}
    return {
        "focus": FOCUS,
        "default_comparison": DEFAULT_COMPARISON,
        "default_benchmark": DEFAULT_BENCHMARK,
        "outlets": {slug: outlet.name for slug, outlet in OUTLETS.items()},
        "home_countries": sorted(HOME_COUNTRIES),
        "names": {
            code: country_name(code)
            for code in sorted(mentioned_country_codes | benchmarked_country_codes)
        },
        "benchmark_figures": figures_by_benchmark,
        "days": daily_country_set_mentions_by_outlet,
        "months": cached_past_months(),
        # For "Data updated 2 hours ago", worked out in the browser.
        "last_fetched": last_fetched.isoformat(timespec="seconds") if last_fetched else None,
    }
