"""Coverage shares: how much of each outlet's attention went to each country.

These are the numbers the project exists to produce, computed from the cached
GDELT summaries (see `gdelt.py`) and compared against the shares in
`benchmarks.py`. Nothing here knows about the web page.
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
    "abc": Outlet("ABC News", ["abcnews.com"]),
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


def mention_counts(day_summaries, outlets):
    """Map ISO3 -> country mentions by the outlets, added up over the given days."""
    domains = []
    for slug in outlets:
        domains.extend(OUTLETS[slug].domains)
    mentions = Counter()
    for day_summary in day_summaries:
        for domain in domains:
            for code, count in day_summary["domains"].get(domain, {}).get("countries", {}).items():
                mentions[code] += count
    return mentions


def coverage_shares(day_summaries, outlets):
    """Map ISO3 -> its share of all country mentions by the outlets over the given days.

    Mentions are added up across outlets and days before dividing, so an outlet
    or a day with more coverage counts for more. Shares are of *mentions*, not
    articles, so that they sum to 1 like the reality shares do.
    """
    mentions = mention_counts(day_summaries, outlets)
    total = sum(mentions.values())
    if not total:
        return {}
    return {code: count / total for code, count in mentions.items()}
