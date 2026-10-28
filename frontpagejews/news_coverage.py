"""The outlets, and their mentions of each set of countries.

The counts come from the cached GDELT summaries (see `gdelt.py`). The browser
turns them into each country's percentage of coverage and compares that with
the benchmarks (see `benchmarks.py`). Nothing here knows about the web page.
"""

from collections import Counter
from typing import NamedTuple


class Outlet(NamedTuple):
    name: str
    # The domains GDELT files the outlet's articles under.
    domains: list[str]


# slug -> Outlet. Limited to outlets GDELT actually crawls: paywalled sites (NYT, WSJ, WaPo) are
# mostly absent from its data, so their lines would be near zero for the wrong
# reason. Also limited to general-audience outlets: regional ones (Jerusalem
# Post, Al Jazeera) cover their own region heavily by design, which is not the
# disproportion this project is looking for.
#
# Mostly US, with the BBC and the Guardian kept as a non-US reference point. The
# list is kept short on purpose: NBC, the Independent, the Daily Mail and the
# Mirror are well crawled too, but each closely tracked an outlet already here,
# so they lengthened the checkbox row without adding anything to explore.
OUTLETS = {
    "fox": Outlet("Fox News", ["foxnews.com"]),
    "nypost": Outlet("New York Post", ["nypost.com"]),
    "cbs": Outlet("CBS News", ["cbsnews.com"]),
    "abc": Outlet("ABC News", ["abcnews.com", "abcnews.go.com"]),
    "npr": Outlet("NPR", ["npr.org"]),
    "bbc": Outlet("BBC", ["bbc.co.uk", "bbc.com"]),
    "guardian": Outlet("The Guardian", ["theguardian.com"]),
}

# How many of the most recent cached days the site shows, and so how far back
# `fetch_gdelt` fills in by default. Counted in cached days, not calendar days:
# a gap in the cache reaches further back rather than shrinking the window.
DAYS_SHOWN = 30

# Every domain the outlets publish under. The GDELT cache keeps only these.
OUTLET_DOMAINS = {domain for outlet in OUTLETS.values() for domain in outlet.domains}

# Where the outlets are based. These get heavy coverage as home, which is not
# the disproportion this project is looking for.
HOME_COUNTRIES = {"USA", "GBR"}


def outlet_country_set_mentions(day_summary, slug):
    """Map country set -> one outlet's mentions of it on one day, added up over the
    outlet's domains. Each set is treated as one unit: an article about Israel
    and the US is one mention of "ISR,USA", and none of "ISR" alone. Keyed like
    the day files (see `gdelt.country_set_key`): {"ISR,USA": 6, "ISR": 3}."""
    country_set_mentions = Counter()
    for domain in OUTLETS[slug].domains:
        domain_day_summary = day_summary["domains"].get(domain)
        if domain_day_summary:
            country_set_mentions.update(domain_day_summary["country_sets"])
    return dict(country_set_mentions)
