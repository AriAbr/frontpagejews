"""Real-world data to compare coverage against.

Only population so far, standing in for the composite score until GDP,
conflict deaths and market moves are added. It is fetched from the World Bank
by `manage.py fetch_benchmarks` and read from the cache by everything else, so
a page request never waits on the World Bank.
"""

import json

import requests
from django.conf import settings

POPULATION_URL = "https://api.worldbank.org/v2/country/all/indicator/SP.POP.TOTL"


def fetch_population():
    """Map ISO3 -> latest population, for countries only.

    The World Bank mixes countries with aggregates ("World", "Euro area"); its
    country list files the aggregates under the region "Aggregates". `mrnev=1`
    gives each country its latest non-empty year.
    """
    countries = requests.get(
        "https://api.worldbank.org/v2/country", params={"format": "json", "per_page": 400}, timeout=60
    ).json()[1]
    real = {c["id"] for c in countries if c["region"]["value"] != "Aggregates"}
    rows = requests.get(
        POPULATION_URL, params={"format": "json", "per_page": 400, "mrnev": 1}, timeout=60
    ).json()[1]
    return {
        r["countryiso3code"]: r["value"] for r in rows if r["countryiso3code"] in real and r["value"]
    }


def population_path():
    return settings.BENCHMARK_CACHE_DIR / "population.json"


def refresh_population():
    """Refetch population and replace the cache.

    The new file is written beside the old one and renamed over it, so a failed
    fetch or write leaves the last good copy in place.
    """
    data = fetch_population()
    path = population_path()
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_suffix(".tmp")
    tmp.write_text(json.dumps(data))
    tmp.replace(path)
    return data


def population():
    """The cached population, or an empty dict if it has not been fetched."""
    path = population_path()
    if not path.exists():
        return {}
    return json.loads(path.read_text())


def population_shares():
    """Map ISO3 -> the country's share of world population, as a fraction."""
    by_country = population()
    total = sum(by_country.values())
    return {code: count / total for code, count in by_country.items()}
