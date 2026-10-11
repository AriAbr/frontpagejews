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
        {"id": "UKR", "region": {"value": "Europe & Central Asia"}},
        {"id": "WLD", "region": {"value": "Aggregates"}},
    ]
    population = [
        {"countryiso3code": "ISR", "value": 10},
        {"countryiso3code": "UKR", "value": 30},
        {"countryiso3code": "WLD", "value": 40},
    ]
    response = mocker.Mock()
    response.json.side_effect = [[{}, countries], [{}, population]]
    return mocker.patch.object(benchmarks.requests, "get", return_value=response)


def describe_population_shares():
    """Tests for the population shares the dashboard compares coverage against"""

    def test_gives_each_country_its_share_of_world_population(world_bank):
        """The "World" aggregate is excluded, or every share would be halved"""
        benchmarks.refresh_population()

        assert benchmarks.population_shares() == {"ISR": 0.25, "UKR": 0.75}

    def test_is_empty_and_does_not_fetch_before_the_first_refresh(mocker):
        get = mocker.patch.object(benchmarks.requests, "get")

        assert benchmarks.population_shares() == {}
        get.assert_not_called()


def describe_fetch_benchmarks():
    """Tests for the command that refreshes the cache"""

    def test_replaces_an_existing_cache(world_bank, cache_dir):
        (cache_dir / "population.json").write_text(json.dumps({"ISR": 1}))

        call_command("fetch_benchmarks")

        assert benchmarks.population()["ISR"] == 10

    def test_keeps_the_old_cache_when_the_fetch_fails(mocker, cache_dir):
        old = {"ISR": 1}
        (cache_dir / "population.json").write_text(json.dumps(old))
        mocker.patch.object(benchmarks.requests, "get", side_effect=benchmarks.requests.ConnectionError)

        with pytest.raises(benchmarks.requests.ConnectionError):
            call_command("fetch_benchmarks")

        assert benchmarks.population() == old
