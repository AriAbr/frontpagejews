"""Everything the dashboard needs, as one JSON-ready dict.

The site is static: `manage.py build_site` writes this out as `data.json`, and
the page's scripts do the rest in the browser, since which outlets and which
comparison country to show are the visitor's choice. Mentions are summed per
outlet here, so the browser only adds up the outlets that are ticked.

`data.json` holds the last `DAYS_SHOWN` days. Each earlier month the visitor can
pick instead is a file of its own, `months/YYYY-MM.json`, so the page only
downloads the month it shows.
"""

from datetime import UTC, datetime

from frontpagejews import benchmarks, gdelt
from frontpagejews.countries import country_name
from frontpagejews.news_coverage import DAYS_SHOWN, HOME_COUNTRIES, OUTLETS, mention_counts

FOCUS = "ISR"
DEFAULT_COMPARISON = "CHN"
# Worked out in the browser from the other benchmarks (withComposite in
# chart-data.js), so it has no figures here.
DEFAULT_BENCHMARK = "composite"


def daily_mentions(days):
    """Each day's mentions, per outlet, as the page reads them."""
    day_summaries = [gdelt.load_day(day) for day in days]
    return [
        {
            "date": day_summary["date"],
            "mentions": {slug: dict(mention_counts([day_summary], [slug])) for slug in OUTLETS},
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
    `DAYS_SHOWN` days."""
    return {"days": daily_mentions([day for day in gdelt.cached_days() if f"{day:%Y-%m}" == month])}


def site_data():
    figures_by_benchmark = {
        benchmark: benchmarks.load_figures(benchmark) for benchmark in benchmarks.BENCHMARKS
    }
    days = daily_mentions(gdelt.cached_days()[-DAYS_SHOWN:])
    last_fetched = gdelt.last_fetched()
    mentioned = {code for day in days for counts in day["mentions"].values() for code in counts}
    with_figures = {code for figures in figures_by_benchmark.values() for code in figures}
    return {
        "focus": FOCUS,
        "default_comparison": DEFAULT_COMPARISON,
        "default_benchmark": DEFAULT_BENCHMARK,
        "outlets": {slug: outlet.name for slug, outlet in OUTLETS.items()},
        "home_countries": sorted(HOME_COUNTRIES),
        "names": {code: country_name(code) for code in sorted(mentioned | with_figures)},
        "benchmark_figures": figures_by_benchmark,
        "days": days,
        "months": cached_past_months(),
        # For "Data updated 2 hours ago", worked out in the browser.
        "last_fetched": last_fetched.isoformat(timespec="seconds") if last_fetched else None,
    }
