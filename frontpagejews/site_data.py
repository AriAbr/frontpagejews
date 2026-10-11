"""Everything the dashboard needs, as one JSON-ready dict.

The site is static: `manage.py build_site` writes this out as `data.json`, and
the page's scripts do the rest in the browser, since which outlets and which
comparison country to show are the visitor's choice. Mentions are summed per
outlet here, so the browser only adds up the outlets that are ticked.
"""

from frontpagejews import benchmarks, gdelt
from frontpagejews.countries import country_name
from frontpagejews.news_coverage import DAYS_SHOWN, HOME_COUNTRIES, OUTLETS, mention_counts

FOCUS = "ISR"
DEFAULT_COMPARISON = "CHN"


def site_data():
    day_summaries = [gdelt.load_day(day) for day in gdelt.cached_days()[-DAYS_SHOWN:]]
    population = benchmarks.population()
    days = [
        {
            "date": day_summary["date"],
            "mentions": {slug: dict(mention_counts([day_summary], [slug])) for slug in OUTLETS},
        }
        for day_summary in day_summaries
    ]
    mentioned = {code for day in days for counts in day["mentions"].values() for code in counts}
    return {
        "focus": FOCUS,
        "default_comparison": DEFAULT_COMPARISON,
        "outlets": {slug: outlet.name for slug, outlet in OUTLETS.items()},
        "home_countries": sorted(HOME_COUNTRIES),
        "names": {code: country_name(code) for code in sorted(mentioned | population.keys())},
        "population": population,
        "days": days,
    }
