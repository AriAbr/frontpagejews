import json

import pytest
from django.core.management import call_command

from frontpagejews import benchmarks


@pytest.fixture(autouse=True)
def cache_dir(settings, tmp_path):
    settings.BENCHMARK_CACHE_DIR = tmp_path
    return tmp_path


@pytest.fixture
def world_bank(mocker):
    countries = [
        {"id": "ISR", "region": {"value": "Middle East & North Africa"}},
        {"id": "PSE", "region": {"value": "Middle East & North Africa"}},
        {"id": "UKR", "region": {"value": "Europe & Central Asia"}},
        {"id": "WLD", "region": {"value": "Aggregates"}},
    ]
    population = [
        {"countryiso3code": "ISR", "value": 10},
        {"countryiso3code": "PSE", "value": 5},
        {"countryiso3code": "UKR", "value": 30},
        {"countryiso3code": "WLD", "value": 40},
    ]
    # Some countries have no figure at all.
    gdp = [
        {"countryiso3code": "ISR", "value": 500},
        {"countryiso3code": "PSE", "value": 20},
        {"countryiso3code": "UKR", "value": None},
        {"countryiso3code": "WLD", "value": 500},
    ]
    response = mocker.Mock()
    response.json.side_effect = [[{}, countries], [{}, population], [{}, gdp]]
    # UCDP's files have tests of their own, in test_ucdp.py.
    mocker.patch.object(benchmarks.ucdp, "fetch_deaths", return_value={"ISR": 7, "PSE": 2})
    return mocker.patch.object(benchmarks.requests, "get", return_value=response)


def describe_benchmarks():
    """Tests for the real-world figures the dashboard compares coverage against"""

    def test_caches_each_benchmark_for_countries_only(world_bank):
        """The "World" aggregate is excluded, or every share would be halved"""
        benchmarks.refresh()

        assert benchmarks.load_figures("population").keys() == {"ISR", "UKR"}
        assert benchmarks.load_figures("gdp").keys() == {"ISR"}

    def test_give_countries_without_conflict_deaths_zero(world_bank):
        """Zero is a real figure, unlike a missing GDP"""
        benchmarks.refresh()

        assert benchmarks.load_figures("conflict_deaths")["UKR"] == 0

    def test_add_the_west_bank_and_gaza_to_israel(world_bank):
        """Mentions of the three are counted as one, so their figures are too"""
        benchmarks.refresh()

        assert benchmarks.load_figures("population")["ISR"] == 15
        assert benchmarks.load_figures("gdp")["ISR"] == 520
        assert benchmarks.load_figures("conflict_deaths") == {"ISR": 9, "UKR": 0}

    def test_are_empty_and_do_not_fetch_before_the_first_refresh(mocker):
        get = mocker.patch.object(benchmarks.requests, "get")

        assert benchmarks.load_figures("population") == {}
        get.assert_not_called()


def describe_fetch_benchmarks():
    """Tests for the command that refreshes the cache"""

    def test_replaces_an_existing_cache(world_bank, cache_dir):
        (cache_dir / "population.json").write_text(json.dumps({"ISR": 1}))

        call_command("fetch_benchmarks")

        assert benchmarks.load_figures("population")["UKR"] == 30

    def test_keeps_the_old_cache_when_the_fetch_fails(mocker, cache_dir):
        old = {"ISR": 1}
        (cache_dir / "population.json").write_text(json.dumps(old))
        mocker.patch.object(benchmarks.requests, "get", side_effect=benchmarks.requests.ConnectionError)

        with pytest.raises(benchmarks.requests.ConnectionError):
            call_command("fetch_benchmarks")

        assert benchmarks.load_figures("population") == old
