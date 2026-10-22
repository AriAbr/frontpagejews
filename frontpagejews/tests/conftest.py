import pytest


@pytest.fixture(autouse=True)
def _empty_caches(settings, tmp_path):
    """Point both caches at empty directories for every test, so each test caches
    only what it shows, and none can touch the real data in var/."""
    settings.GDELT_CACHE_DIR = tmp_path / "gdelt"
    settings.BENCHMARK_CACHE_DIR = tmp_path / "benchmarks"
    settings.GDELT_CACHE_DIR.mkdir()
    settings.BENCHMARK_CACHE_DIR.mkdir()
