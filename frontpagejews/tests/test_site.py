import io
import json
import os
from datetime import UTC, date, datetime

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


def set_fetch_time(day, fetched_at):
    """Make a cached day look fetched at `fetched_at`, e.g. "2026-09-23T01:35:00+00:00".

    `gdelt.last_fetched` reads the file's modification time, which os.utime sets
    (along with its access time, which nothing reads)."""
    timestamp = datetime.fromisoformat(fetched_at).timestamp()
    os.utime(gdelt.cache_path(date.fromisoformat(day)), (timestamp, timestamp))


def cache_figures(benchmark, **figures):
    benchmarks.cache_path(benchmark).write_text(json.dumps(figures))


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

    def test_names_every_country_mentioned_or_with_a_benchmark_figure():
        cache_day("2026-09-22", {"bbc.co.uk": {"ISR": 1}})
        cache_figures("population", CHN=90)
        cache_figures("gdp", UKR=5)

        assert site_data.site_data()["names"] == {"CHN": "China", "ISR": "Israel", "UKR": "Ukraine"}

    def test_gives_when_a_day_was_last_fetched():
        """The latest fetch of any day, not the latest day's fetch: an older day
        is fetched again with --refresh"""
        cache_day("2026-09-22", {"bbc.co.uk": {"ISR": 1}})
        cache_day("2026-09-23", {"bbc.co.uk": {"ISR": 1}})
        set_fetch_time("2026-09-22", "2026-10-01T09:00:00+00:00")
        set_fetch_time("2026-09-23", "2026-09-24T01:35:00+00:00")

        assert site_data.site_data()["last_fetched"] == "2026-10-01T09:00:00+00:00"

    def test_gives_no_fetch_time_with_nothing_cached():
        assert site_data.site_data()["last_fetched"] is None

    def test_lists_the_months_with_cached_days_but_this_one(mocker):
        """This month isn't over; the last days shown cover it"""
        mocker.patch.object(site_data, "datetime", wraps=datetime)
        site_data.datetime.now.return_value = datetime(2026, 10, 20, tzinfo=UTC)
        cache_day("2024-03-31", {"bbc.co.uk": {"ISR": 1}})
        cache_day("2026-09-30", {"bbc.co.uk": {"ISR": 1}})
        cache_day("2026-10-01", {"bbc.co.uk": {"ISR": 1}})

        assert site_data.site_data()["months"] == ["2024-03", "2026-09"]

    def test_includes_each_benchmarks_figures():
        """A benchmark not fetched yet is there but empty"""
        cache_figures("population", ISR=10, CHN=90)

        assert site_data.site_data()["benchmark_figures"] == {
            "population": {"ISR": 10, "CHN": 90},
            "gdp": {},
            "conflict_deaths": {},
        }


def describe_month_data():
    """Tests for the data of a month the visitor picks"""

    def test_gives_each_day_of_the_month_and_no_others():
        cache_day("2024-02-29", {"bbc.co.uk": {"ISR": 1}})
        cache_day("2024-03-01", {"bbc.co.uk": {"ISR": 2}})
        cache_day("2024-03-31", {"bbc.co.uk": {"ISR": 3}})
        cache_day("2024-04-01", {"bbc.co.uk": {"ISR": 4}})

        days = site_data.month_site_data("2024-03")["days"]

        assert [day["date"] for day in days] == ["2024-03-01", "2024-03-31"]
        assert days[0]["mentions"]["bbc"] == {"ISR": 2}


def describe_dashboard():
    """Tests for the page as Django serves it locally"""

    def test_renders_the_outlet_checkboxes(client):
        response = client.get("/")

        assert response.status_code == 200
        assert b'value="fox"' in response.content
        assert b"Fox News" in response.content

    def test_includes_google_analytics_when_configured(client, settings):
        settings.GA_MEASUREMENT_ID = "G-TEST123"

        assert b"googletagmanager.com/gtag/js?id=G-TEST123" in client.get("/").content

    def test_leaves_out_google_analytics_by_default(client, settings):
        settings.GA_MEASUREMENT_ID = ""

        assert b"googletagmanager" not in client.get("/").content

    def test_names_the_months_the_conflict_deaths_cover(client):
        benchmarks.conflict_deaths_months_path().write_text("Aug 2025–Jul 2026")

        assert "12 months it has data for (Aug 2025–Jul 2026)." in client.get("/").content.decode()

    def test_serves_the_data(client):
        cache_day("2026-09-22", {"bbc.co.uk": {"ISR": 1}})

        response = client.get("/data.json")

        assert response.json()["days"][0]["mentions"]["bbc"] == {"ISR": 1}

    def test_serves_a_months_data(client):
        cache_day("2024-03-05", {"bbc.co.uk": {"ISR": 1}})

        response = client.get("/months/2024-03.json")

        assert response.json()["days"][0]["date"] == "2024-03-05"


def describe_build_site():
    """Tests for writing the site out as static files"""

    def test_writes_the_page_the_data_and_the_scripts(tmp_path):
        cache_day("2026-09-22", {"bbc.co.uk": {"ISR": 1}})
        out = tmp_path / "build"

        call_command("build_site", out=out, stdout=io.StringIO())

        assert "<canvas" in (out / "index.html").read_text()
        assert json.loads((out / "data.json").read_text())["days"][0]["date"] == "2026-09-22"
        assert (
            json.loads((out / "months" / "2026-09.json").read_text())["days"][0]["date"] == "2026-09-22"
        )
        assert (out / "static" / "frontpagejews" / "page.js").exists()
        assert not (out / "static" / "admin").exists()
