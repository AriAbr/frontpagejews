import pytest

from frontpagejews.gazetteer import Gazetteer


@pytest.fixture(autouse=True)
def _empty_caches(settings, tmp_path):
    """Point every cache at empty directories for every test, so each test caches
    only what it shows, and none can touch the real data in var/."""
    settings.GDELT_CACHE_DIR = tmp_path / "gdelt"
    settings.BENCHMARK_CACHE_DIR = tmp_path / "benchmarks"
    settings.NYT_CACHE_DIR = tmp_path / "nyt"
    settings.GDELT_CACHE_DIR.mkdir()
    settings.BENCHMARK_CACHE_DIR.mkdir()


@pytest.fixture(autouse=True)
def _no_place_lookups(mocker):
    """Fail any lookup that would reach Wikidata or GeoNames: a test that needs
    one says what it returns."""
    mocker.patch.object(
        Gazetteer, "_call", side_effect=AssertionError("a place lookup reached the network")
    )
