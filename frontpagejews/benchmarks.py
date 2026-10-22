"""Real-world data to compare coverage against.

Population, GDP and conflict deaths so far, each standing in for the composite
score until market moves are added. They are kept separate all the way to the
browser, which does any combining. They are fetched from the World Bank and
UCDP by `manage.py fetch_benchmarks` and read from the cache by everything
else, so a page request never waits on either.

Each is cached with its history back to 2014, for showing past periods:
population and GDP per year, deaths per month.
"""

import json
from datetime import date, datetime

import requests
from django.conf import settings

from frontpagejews import ucdp

# Benchmark -> the World Bank indicator it is fetched from. GDP is in current
# US dollars, not purchasing power parity, so it measures each country's weight
# in the world economy rather than its standard of living.
WORLD_BANK_INDICATORS = {"population": "SP.POP.TOTL", "gdp": "NY.GDP.MKTP.CD"}

BENCHMARKS = [*WORLD_BANK_INDICATORS, "conflict_deaths"]

# The first year whose population and GDP are kept, matching ucdp.FIRST_MONTH.
FIRST_YEAR = 2014
# Today's conflict deaths are summed over the 12 months up to the newest month
# UCDP has data for.
MONTHS_SUMMED = 12

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


def fetch_benchmark_history(benchmark, country_codes):
    """The benchmark's figures over time, for the given countries only: see
    `fetch_world_bank_history` and `fetch_conflict_deaths_history`."""
    if benchmark == "conflict_deaths":
        return fetch_conflict_deaths_history(country_codes)
    return fetch_world_bank_history(benchmark, country_codes)


def fetch_world_bank_history(benchmark, country_codes):
    """Map year -> ISO3 -> the country's figure for a World Bank benchmark,
    each year from `FIRST_YEAR` to the newest any country has a figure for.

    A country missing a year keeps its figure from the latest year before it
    since 2000, so a few countries' figures are years old (Yemen's GDP stops in
    2018). Fetched as every year's figures rather than with the World Bank's
    option for the latest, `mrnev=1`, which it ignored for GitHub's runners on
    2026-10-17 and sent every year instead.
    """
    page_info, rows = requests.get(
        f"https://api.worldbank.org/v2/country/all/indicator/{WORLD_BANK_INDICATORS[benchmark]}",
        params={"format": "json", "per_page": 20000, "date": f"2000:{date.today().year}"},
        timeout=60,
    ).json()
    if page_info.get("pages", 1) > 1:
        raise IncompleteFetch(f"The World Bank split {benchmark} into pages: {page_info}")
    rows_with_figures = [
        row for row in rows or [] if row["countryiso3code"] in country_codes and row["value"]
    ]
    if not rows_with_figures:
        # What the World Bank sent, for the log.
        raise IncompleteFetch(
            f"No {benchmark} figures from the World Bank: {page_info}, first rows {(rows or [])[:3]}"
        )

    latest_year_with_data = max(int(row["date"]) for row in rows_with_figures)
    history = {}
    latest = {}
    for year in range(2000, latest_year_with_data + 1):
        for row in rows_with_figures:
            if row["date"] == str(year):
                latest[row["countryiso3code"]] = row["value"]
        if year >= FIRST_YEAR:
            figures = dict(latest)
            for part, whole in COMBINED_INTO.items():
                if part in figures and whole in figures:
                    figures[whole] += figures.pop(part)
            history[str(year)] = figures
    return history


def fetch_conflict_deaths_history(country_codes):
    """The countries, and a map of month -> ISO3 -> deaths in organized
    violence that month, from UCDP. A country is left out of the months it had
    no deaths in, but it's in the countries: zero is its real figure, unlike a
    missing GDP, and it still belongs on the chart."""
    months = {}
    for month, deaths_by_country in ucdp.fetch_deaths().items():
        months[month] = {}
        for code, deaths in deaths_by_country.items():
            code = COMBINED_INTO.get(code, code)
            if code in country_codes:
                months[month][code] = months[month].get(code, 0) + deaths
    return {"countries": sorted(set(country_codes) - set(COMBINED_INTO)), "months": months}


def latest_figures(benchmark, history):
    """Map ISO3 -> the benchmark's figure today: the newest year's population or
    GDP, or the deaths over the last `MONTHS_SUMMED` months UCDP has data for."""
    if not history:
        return {}
    if benchmark == "conflict_deaths":
        latest_month_with_data = list(history["months"])[-1]
        return conflict_deaths_over(history, conflict_deaths_months_for(history, latest_month_with_data))
    return history[max(history)]


def world_bank_year_for(history, year):
    """The year of a population or GDP history to use for a year ("YYYY"): that
    year, or the newest the World Bank has, if it has none that recent."""
    return min(year, max(history))


def conflict_deaths_months_for(history, month):
    """The `MONTHS_SUMMED` months a month's conflict deaths are summed over: the
    ones up to and including it, or UCDP's newest, if it has no data for the
    month yet."""
    months = list(history["months"])
    end = months.index(min(month, months[-1]))
    return months[max(0, end - MONTHS_SUMMED + 1) : end + 1]


def describe_months(months):
    """["2025-09", ..., "2026-08"] -> "Sep 2025–Aug 2026"."""
    first, last = (
        datetime.strptime(month, "%Y-%m").strftime("%b %Y") for month in (months[0], months[-1])
    )
    return f"{first}–{last}"


def conflict_deaths_over(history, months):
    """Map ISO3 -> deaths over the given months, 0 for a country with none."""
    deaths = dict.fromkeys(history["countries"], 0)
    for month in months:
        for code, month_deaths in history["months"][month].items():
            deaths[code] += month_deaths
    return deaths


def cache_path(benchmark):
    # "_history" since the cache became the history. A cache of the latest
    # figures alone, as they were cached before, is left alone, never read.
    return settings.BENCHMARK_CACHE_DIR / f"{benchmark}_history.json"


def refresh():
    """Refetch every benchmark's history and replace its cache. Returns today's
    figures for each.

    Each new file is written beside the old one and renamed over it, so a failed
    fetch or write leaves the last good copy in place. So does a fetch whose
    figures today cover under half the countries the cache's do: a source
    answering with less than it should, not countries vanishing.
    """
    country_codes = fetch_country_codes()
    figures_by_benchmark = {}
    for benchmark in BENCHMARKS:
        history = fetch_benchmark_history(benchmark, country_codes)
        figures = latest_figures(benchmark, history)
        cached = load_figures(benchmark)
        if len(figures) < len(cached) / 2:
            raise IncompleteFetch(
                f"{benchmark}: {len(figures)} countries, against {len(cached)} in the cache"
            )
        path = cache_path(benchmark)
        path.parent.mkdir(parents=True, exist_ok=True)
        tmp = path.with_suffix(".tmp")
        tmp.write_text(json.dumps(history))
        tmp.replace(path)
        figures_by_benchmark[benchmark] = figures
    return figures_by_benchmark


def load_history(benchmark):
    """The benchmark's cached history, or an empty dict if it has not been
    fetched."""
    path = cache_path(benchmark)
    if not path.exists():
        return {}
    return json.loads(path.read_text())


def load_figures(benchmark):
    """The benchmark's figures today by ISO3, from the cache, or an empty dict
    if they have not been fetched."""
    return latest_figures(benchmark, load_history(benchmark))


def load_latest_world_bank_years():
    """Map benchmark -> the year today's population or GDP are from, or None if
    it has not been fetched."""
    years = {}
    for benchmark in WORLD_BANK_INDICATORS:
        history = load_history(benchmark)
        years[benchmark] = max(history) if history else None
    return years


def load_conflict_deaths_months():
    """Which months today's conflict deaths cover, as "Sep 2025–Aug 2026", or
    None if they have not been fetched."""
    history = load_history("conflict_deaths")
    if not history:
        return None
    return describe_months(conflict_deaths_months_for(history, list(history["months"])[-1]))
