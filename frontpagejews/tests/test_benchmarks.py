import json

import pytest
from django.core.management import call_command

from frontpagejews import benchmarks
from frontpagejews.ucdp import months_between


def cache_history(benchmark, history):
    benchmarks.cache_path(benchmark).write_text(json.dumps(history))


def world_bank_rows(figures_by_year_by_country):
    """{"ISR": {"2025": 10}} -> the rows the World Bank sends for those figures."""
    rows = []
    for code, figures_by_year in figures_by_year_by_country.items():
        for year, figure in figures_by_year.items():
            rows.append({"countryiso3code": code, "date": year, "value": figure})
    return rows


def mock_world_bank_response(mocker, page_info, rows):
    response = mocker.Mock()
    response.json.return_value = [page_info, rows]
    return mocker.patch.object(benchmarks.requests, "get", return_value=response)


def mock_sources(mocker, *, regions, population, gdp, deaths):
    """Stand in for the World Bank and UCDP, for `refresh`.

    regions: ISO3 -> World Bank region. population, gdp: ISO3 -> year -> figure.
    deaths: month -> ISO3 -> deaths.
    """
    rows_by_indicator = {
        benchmarks.WORLD_BANK_INDICATORS["population"]: world_bank_rows(population),
        benchmarks.WORLD_BANK_INDICATORS["gdp"]: world_bank_rows(gdp),
    }
    countries = [{"id": code, "region": {"value": region}} for code, region in regions.items()]

    def get(url, params, timeout):
        response = mocker.Mock()
        if url.endswith("/country"):
            response.json.return_value = [{}, countries]
        else:
            indicator = url.rsplit("/", 1)[-1]
            response.json.return_value = [{}, rows_by_indicator[indicator]]
        return response

    mocker.patch.object(benchmarks.requests, "get", side_effect=get)
    # UCDP's files have tests of their own, in test_ucdp.py.
    mocker.patch.object(benchmarks.ucdp, "fetch_deaths", return_value=deaths)


def describe_fetch_country_codes():
    """Tests for which of the World Bank's countries count"""

    def test_leaves_out_aggregates(mocker):
        """The "World" aggregate is excluded, or every share would be halved"""
        mock_world_bank_response(
            mocker,
            {},
            [
                {"id": "ISR", "region": {"value": "Middle East & North Africa"}},
                {"id": "WLD", "region": {"value": "Aggregates"}},
            ],
        )

        assert benchmarks.fetch_country_codes() == {"ISR"}


def describe_fetch_world_bank_history():
    """Tests for population and GDP over the years"""

    def test_starts_at_2014(mocker):
        mock_world_bank_response(mocker, {}, world_bank_rows({"ISR": {"2013": 8, "2014": 9}}))

        history = benchmarks.fetch_world_bank_history("population", {"ISR"})

        assert history == {"2014": {"ISR": 9}}

    def test_leaves_out_countries_not_given(mocker):
        mock_world_bank_response(mocker, {}, world_bank_rows({"ISR": {"2014": 9}, "WLD": {"2014": 40}}))

        history = benchmarks.fetch_world_bank_history("population", {"ISR"})

        assert history == {"2014": {"ISR": 9}}

    def test_fills_a_year_without_a_figure_from_the_latest_before_it(mocker):
        """Even from before 2014"""
        mock_world_bank_response(mocker, {}, world_bank_rows({"ISR": {"2013": 8, "2016": 10}}))

        history = benchmarks.fetch_world_bank_history("population", {"ISR"})

        assert history == {"2014": {"ISR": 8}, "2015": {"ISR": 8}, "2016": {"ISR": 10}}

    def test_treats_a_year_not_in_yet_as_missing(mocker):
        """The World Bank lists the newest year before it has figures for it"""
        mock_world_bank_response(
            mocker, {}, world_bank_rows({"ISR": {"2024": 500, "2025": None}, "UKR": {"2025": 200}})
        )

        history = benchmarks.fetch_world_bank_history("gdp", {"ISR", "UKR"})

        assert history["2025"] == {"ISR": 500, "UKR": 200}

    def test_adds_the_west_bank_and_gaza_to_israel(mocker):
        """Mentions of the three are counted as one, so their figures are too"""
        mock_world_bank_response(mocker, {}, world_bank_rows({"ISR": {"2025": 10}, "PSE": {"2025": 5}}))

        history = benchmarks.fetch_world_bank_history("population", {"ISR", "PSE"})

        assert history["2025"] == {"ISR": 15}

    def test_raises_when_the_world_bank_sends_no_figures(mocker):
        """As it did to GitHub's runners on 2026-10-17, while answering elsewhere"""
        mock_world_bank_response(mocker, {"page": 0, "pages": 0, "total": 0}, None)

        with pytest.raises(benchmarks.IncompleteFetch):
            benchmarks.fetch_world_bank_history("gdp", {"ISR"})

    def test_raises_when_the_world_bank_splits_the_figures_into_pages(mocker):
        """Only the first page would be read, so most countries would be missing"""
        mock_world_bank_response(
            mocker, {"page": 1, "pages": 2}, world_bank_rows({"ISR": {"2025": 500}})
        )

        with pytest.raises(benchmarks.IncompleteFetch):
            benchmarks.fetch_world_bank_history("gdp", {"ISR"})


def describe_fetch_conflict_deaths_history():
    """Tests for deaths in organized violence over the months"""

    def test_has_each_months_deaths_for_the_given_countries(mocker):
        """With every given country listed, even one without deaths: zero is a real figure, unlike a missing GDP"""
        mocker.patch.object(
            benchmarks.ucdp,
            "fetch_deaths",
            return_value={"2026-07": {"ISR": 7, "SWE": 1}, "2026-08": {}},
        )

        history = benchmarks.fetch_conflict_deaths_history({"ISR", "UKR"})

        assert history == {
            "countries": ["ISR", "UKR"],
            "months": {"2026-07": {"ISR": 7}, "2026-08": {}},
        }

    def test_adds_the_west_bank_and_gaza_to_israel(mocker):
        """Even in a month Israel has none of its own"""
        mocker.patch.object(
            benchmarks.ucdp,
            "fetch_deaths",
            return_value={"2026-07": {"ISR": 7, "PSE": 2}, "2026-08": {"PSE": 3}},
        )

        history = benchmarks.fetch_conflict_deaths_history({"ISR", "PSE"})

        assert history == {
            "countries": ["ISR"],
            "months": {"2026-07": {"ISR": 9}, "2026-08": {"ISR": 3}},
        }


def describe_latest_figures():
    """Tests for the figures today, worked out from a history"""

    def test_take_the_newest_years_population_or_gdp():
        history = {"2024": {"ISR": 9}, "2025": {"ISR": 10}}

        assert benchmarks.latest_figures("population", history) == {"ISR": 10}

    def test_sum_the_conflict_deaths_over_the_last_12_months():
        """August 2025 is 13 months back from August 2026, so it's left out"""
        months = {month: {} for month in months_between("2025-08", "2026-08")}
        months["2025-08"] = {"ISR": 100}
        months["2025-09"] = {"ISR": 7}
        months["2026-08"] = {"ISR": 2}
        history = {"countries": ["ISR", "UKR"], "months": months}

        assert benchmarks.latest_figures("conflict_deaths", history) == {"ISR": 9, "UKR": 0}

    def test_are_empty_without_a_history():
        assert benchmarks.latest_figures("population", {}) == {}


def describe_conflict_deaths_months_for():
    """Tests for which months a month's conflict deaths are summed over"""

    def test_are_the_12_months_up_to_and_including_it():
        history = {"countries": [], "months": dict.fromkeys(months_between("2025-01", "2026-08"), {})}

        months = benchmarks.conflict_deaths_months_for(history, "2026-03")

        assert months == months_between("2025-04", "2026-03")

    def test_are_ucdps_newest_12_for_a_month_it_has_no_data_for_yet():
        history = {"countries": [], "months": dict.fromkeys(months_between("2025-01", "2026-08"), {})}

        months = benchmarks.conflict_deaths_months_for(history, "2026-10")

        assert months == months_between("2025-09", "2026-08")


def describe_describe_months():
    def test_names_the_first_and_last_month():
        assert benchmarks.describe_months(months_between("2025-09", "2026-08")) == "Sep 2025–Aug 2026"


def describe_fetch_benchmarks():
    """Tests for the command that refreshes the cache"""

    def test_caches_each_benchmarks_history(mocker):
        mock_sources(
            mocker,
            regions={"ISR": "Middle East & North Africa"},
            population={"ISR": {"2025": 10}},
            gdp={"ISR": {"2025": 500}},
            deaths={"2026-08": {"ISR": 7}},
        )

        call_command("fetch_benchmarks")

        assert benchmarks.load_history("population")["2025"] == {"ISR": 10}
        assert benchmarks.load_history("gdp")["2025"] == {"ISR": 500}
        assert benchmarks.load_history("conflict_deaths") == {
            "countries": ["ISR"],
            "months": {"2026-08": {"ISR": 7}},
        }
        assert benchmarks.load_conflict_deaths_months() == "Aug 2026–Aug 2026"

    def test_replaces_an_existing_cache(mocker):
        cache_history("population", {"2020": {"ISR": 1}})
        mock_sources(
            mocker,
            regions={"ISR": "Middle East & North Africa"},
            population={"ISR": {"2025": 10}},
            gdp={"ISR": {"2025": 500}},
            deaths={"2026-08": {"ISR": 7}},
        )

        call_command("fetch_benchmarks")

        assert benchmarks.load_history("population")["2025"] == {"ISR": 10}

    def test_keeps_the_old_cache_when_the_fetch_fails(mocker):
        old = {"2020": {"ISR": 1}}
        cache_history("population", old)
        mocker.patch.object(benchmarks.requests, "get", side_effect=benchmarks.requests.ConnectionError)

        with pytest.raises(benchmarks.requests.ConnectionError):
            call_command("fetch_benchmarks")

        assert benchmarks.load_history("population") == old

    def test_keeps_the_old_cache_when_the_fetch_has_under_half_its_countries(mocker):
        """A source answering with less than it should, not countries vanishing"""
        old = {"2020": {"ISR": 1, "UKR": 2, "FRA": 3, "DEU": 4, "ITA": 5}}
        cache_history("population", old)
        mock_sources(
            mocker,
            regions={"ISR": "Middle East & North Africa", "UKR": "Europe & Central Asia"},
            population={"ISR": {"2025": 10}, "UKR": {"2025": 30}},
            gdp={"ISR": {"2025": 500}},
            deaths={"2026-08": {"ISR": 7}},
        )

        with pytest.raises(benchmarks.IncompleteFetch):
            call_command("fetch_benchmarks")

        assert benchmarks.load_history("population") == old

    def test_leaves_the_cache_empty_until_the_first_fetch(mocker):
        get = mocker.patch.object(benchmarks.requests, "get")

        assert benchmarks.load_figures("population") == {}
        assert benchmarks.load_conflict_deaths_months() is None
        get.assert_not_called()
