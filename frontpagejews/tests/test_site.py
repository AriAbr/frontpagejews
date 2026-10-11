import io
import json
from datetime import date

import pytest
from django.core.management import call_command

from frontpagejews import benchmarks, gdelt, site_data


@pytest.fixture(autouse=True)
def _empty_caches(settings, tmp_path):
    """Point both caches at empty directories, so each test caches only what it shows."""
    settings.GDELT_CACHE_DIR = tmp_path / "gdelt"
    settings.BENCHMARK_CACHE_DIR = tmp_path / "benchmarks"
    settings.GDELT_CACHE_DIR.mkdir()
    settings.BENCHMARK_CACHE_DIR.mkdir()


def cache_day(day, mentions_by_domain):
    """Cache one day's GDELT summary, e.g. {"bbc.co.uk": {"ISR": 3}}."""
    domains = {
        # The site never reads article counts.
        domain: {"articles": 1, "countries": mentions}
        for domain, mentions in mentions_by_domain.items()
    }
    gdelt.cache_path(date.fromisoformat(day)).write_text(json.dumps({"date": day, "domains": domains}))


def cache_population(**population):
    benchmarks.population_path().write_text(json.dumps(population))


def describe_site_data():
    """Tests for the data.json the page works from"""

    def test_gives_each_outlets_mentions_per_day():
        """The BBC's two domains count as one outlet"""
        cache_day(
            "2026-09-22", {"bbc.co.uk": {"ISR": 1}, "bbc.com": {"ISR": 2}, "foxnews.com": {"CHN": 1}}
        )

        day = site_data.site_data()["days"][0]

        assert day["date"] == "2026-09-22"
        assert day["mentions"]["bbc"] == {"ISR": 3}
        assert day["mentions"]["fox"] == {"CHN": 1}
        assert day["mentions"]["npr"] == {}

    def test_includes_only_the_most_recent_days(mocker):
        mocker.patch.object(site_data, "DAYS_SHOWN", 1)
        cache_day("2026-09-21", {"bbc.co.uk": {"ISR": 1}})
        cache_day("2026-09-22", {"bbc.co.uk": {"ISR": 1}})

        assert [day["date"] for day in site_data.site_data()["days"]] == ["2026-09-22"]

    def test_names_every_country_mentioned_or_with_a_population():
        cache_day("2026-09-22", {"bbc.co.uk": {"ISR": 1}})
        cache_population(CHN=90)

        assert site_data.site_data()["names"] == {"CHN": "China", "ISR": "Israel"}

    def test_includes_the_population():
        cache_population(ISR=10, CHN=90)

        assert site_data.site_data()["population"] == {"ISR": 10, "CHN": 90}


def describe_dashboard():
    """Tests for the page as Django serves it locally"""

    def test_renders_the_outlet_checkboxes(client):
        response = client.get("/")

        assert response.status_code == 200
        assert b'value="fox"' in response.content

    def test_serves_the_data(client):
        cache_day("2026-09-22", {"bbc.co.uk": {"ISR": 1}})

        response = client.get("/data.json")

        assert response.json()["days"][0]["mentions"]["bbc"] == {"ISR": 1}


def describe_build_site():
    """Tests for writing the site out as static files"""

    def test_writes_the_page_the_data_and_the_scripts(tmp_path):
        cache_day("2026-09-22", {"bbc.co.uk": {"ISR": 1}})
        out = tmp_path / "build"

        call_command("build_site", out=out, stdout=io.StringIO())

        assert "<canvas" in (out / "index.html").read_text()
        assert json.loads((out / "data.json").read_text())["days"][0]["date"] == "2026-09-22"
        assert (out / "static" / "frontpagejews" / "page.js").exists()
        assert not (out / "static" / "admin").exists()
