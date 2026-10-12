"""Real-world data to compare coverage against.

Population and GDP so far, each standing in for the composite score until
conflict deaths and market moves are added. They are kept separate all the way
to the browser, which does any combining. They are fetched from the World Bank
by `manage.py fetch_benchmarks` and read from the cache by everything else, so
a page request never waits on the World Bank.
"""

import json

import requests
from django.conf import settings

# Benchmark -> the World Bank indicator it is fetched from. GDP is in current
# US dollars, not purchasing power parity, so it measures each country's weight
# in the world economy rather than its standard of living.
WORLD_BANK_INDICATORS = {"population": "SP.POP.TOTL", "gdp": "NY.GDP.MKTP.CD"}

# Country -> the country whose figures it is added to, matching how
# `country_codes.py` buckets GDELT's mentions.
COMBINED_INTO = {"PSE": "ISR"}


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
    """Map ISO3 -> the country's latest figure for the benchmark ("population"
    or "gdp"), for the given countries only.

    `mrnev=1` gives each country its latest non-empty year, so a few countries'
    figures are years older than the rest (Yemen's GDP is from 2018).
    """
    rows = requests.get(
        f"https://api.worldbank.org/v2/country/all/indicator/{WORLD_BANK_INDICATORS[benchmark]}",
        params={"format": "json", "per_page": 400, "mrnev": 1},
        timeout=60,
    ).json()[1]
    figures = {
        row["countryiso3code"]: row["value"]
        for row in rows
        if row["countryiso3code"] in country_codes and row["value"]
    }
    for part, whole in COMBINED_INTO.items():
        if part in figures and whole in figures:
            figures[whole] += figures.pop(part)
    return figures


def cache_path(benchmark):
    return settings.BENCHMARK_CACHE_DIR / f"{benchmark}.json"


def refresh():
    """Refetch every benchmark's figures and replace its cache.

    Each new file is written beside the old one and renamed over it, so a failed
    fetch or write leaves the last good copy in place.
    """
    country_codes = fetch_country_codes()
    figures_by_benchmark = {}
    for benchmark in WORLD_BANK_INDICATORS:
        figures = fetch_figures(benchmark, country_codes)
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
