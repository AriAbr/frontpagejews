"""Real-world data to compare coverage against.

Population, GDP and conflict deaths so far, each standing in for the composite
score until market moves are added. They are kept separate all the way to the
browser, which does any combining. They are fetched from the World Bank and
UCDP by `manage.py fetch_benchmarks` and read from the cache by everything
else, so a page request never waits on either.
"""

import json
from datetime import datetime

import requests
from django.conf import settings

from frontpagejews import ucdp

# Benchmark -> the World Bank indicator it is fetched from. GDP is in current
# US dollars, not purchasing power parity, so it measures each country's weight
# in the world economy rather than its standard of living.
WORLD_BANK_INDICATORS = {"population": "SP.POP.TOTL", "gdp": "NY.GDP.MKTP.CD"}

BENCHMARKS = [*WORLD_BANK_INDICATORS, "conflict_deaths"]

# Country -> the country whose figures it is added to, matching how
# `country_codes.py` buckets GDELT's mentions.
COMBINED_INTO = {"PSE": "ISR"}


class IncompleteFetch(Exception):
    """A fetch came back with too few countries to replace the cache with."""


def fetch_country_codes():
    """The ISO3 codes of real countries.

    The World Bank mixes countries with aggregates ("World", "Euro area"); its
    country list files the aggregates under the region "Aggregates".
    """
    countries = requests.get(
        "https://api.worldbank.org/v2/country", params={"format": "json", "per_page": 400}, timeout=60
    ).json()[1]
    return {country["id"] for country in countries if country["region"]["value"] != "Aggregates"}


def fetch_figures(benchmark, country_codes):
    """Map ISO3 -> the country's figure for the benchmark, for the given
    countries only."""
    if benchmark == "conflict_deaths":
        figures = fetch_conflict_deaths(country_codes)
    else:
        figures = fetch_world_bank_figures(benchmark, country_codes)
    for part, whole in COMBINED_INTO.items():
        if part in figures and whole in figures:
            figures[whole] += figures.pop(part)
    return figures


def fetch_world_bank_figures(benchmark, country_codes):
    """Map ISO3 -> the country's latest figure for a World Bank benchmark.

    `mrnev=1` gives each country its latest non-empty year, so a few countries'
    figures are years older than the rest (Yemen's GDP is from 2018).
    """
    page_info, rows = requests.get(
        f"https://api.worldbank.org/v2/country/all/indicator/{WORLD_BANK_INDICATORS[benchmark]}",
        params={"format": "json", "per_page": 400, "mrnev": 1},
        timeout=60,
    ).json()
    figures = {
        row["countryiso3code"]: row["value"]
        for row in rows or []
        if row["countryiso3code"] in country_codes and row["value"]
    }
    if not figures:
        # What the World Bank sent, for the log: it has answered GitHub's
        # runners with no figures while answering elsewhere as normal.
        raise IncompleteFetch(
            f"No {benchmark} figures from the World Bank: {page_info}, first rows {(rows or [])[:3]}"
        )
    return figures


def fetch_conflict_deaths(country_codes):
    """Map ISO3 -> deaths in organized violence over the last 12 months UCDP has
    data for. A country UCDP recorded no deaths in has 0, not no figure: zero is
    its real figure, and it still belongs on the chart.

    Also caches which months those are, as "Sep 2025–Aug 2026", for the page."""
    months, deaths = ucdp.fetch_deaths()
    first, last = (
        datetime.strptime(month, "%Y-%m").strftime("%b %Y") for month in (months[0], months[-1])
    )
    conflict_deaths_months_path().write_text(f"{first}–{last}")
    return {code: deaths.get(code, 0) for code in country_codes}


def cache_path(benchmark):
    return settings.BENCHMARK_CACHE_DIR / f"{benchmark}.json"


def conflict_deaths_months_path():
    return settings.BENCHMARK_CACHE_DIR / "conflict_deaths_months.txt"


def refresh():
    """Refetch every benchmark's figures and replace its cache.

    Each new file is written beside the old one and renamed over it, so a failed
    fetch or write leaves the last good copy in place. So does a fetch with
    under half the countries the cache has: a source answering with less than
    it should, not countries vanishing.
    """
    country_codes = fetch_country_codes()
    figures_by_benchmark = {}
    for benchmark in BENCHMARKS:
        figures = fetch_figures(benchmark, country_codes)
        cached = load_figures(benchmark)
        if len(figures) < len(cached) / 2:
            raise IncompleteFetch(
                f"{benchmark}: {len(figures)} countries, against {len(cached)} in the cache"
            )
        path = cache_path(benchmark)
        path.parent.mkdir(parents=True, exist_ok=True)
        tmp = path.with_suffix(".tmp")
        tmp.write_text(json.dumps(figures))
        tmp.replace(path)
        figures_by_benchmark[benchmark] = figures
    return figures_by_benchmark


def load_figures(benchmark):
    """The benchmark's cached figures by ISO3, or an empty dict if they have not
    been fetched."""
    path = cache_path(benchmark)
    if not path.exists():
        return {}
    return json.loads(path.read_text())


def load_conflict_deaths_months():
    """Which months the cached conflict deaths cover, or None if they have not
    been fetched."""
    path = conflict_deaths_months_path()
    return path.read_text() if path.exists() else None
