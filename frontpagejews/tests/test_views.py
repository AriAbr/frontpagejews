import json
from datetime import date

import pytest

from frontpagejews import benchmarks, gdelt, news_coverage


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
        # The page never reads article counts.
        domain: {"articles": 1, "countries": mentions}
        for domain, mentions in mentions_by_domain.items()
    }
    gdelt.cache_path(date.fromisoformat(day)).write_text(json.dumps({"date": day, "domains": domains}))


def cache_population(**population):
    benchmarks.population_path().write_text(json.dumps(population))


def describe_dashboard():
    """Tests for the coverage-vs-reality page"""

    def test_compares_israel_with_china_by_default(client):
        cache_day("2026-09-22", {"bbc.co.uk": {"ISR": 1, "CHN": 1}})

        response = client.get("/")

        assert response.context["countries"]["comparison"]["name"] == "China"

    def test_gives_each_days_coverage_and_population_shares(client):
        """Israel has 3 of the 4 mentions and 10 of the 100 people"""
        cache_day("2026-09-22", {"bbc.co.uk": {"ISR": 3, "CHN": 1}})
        cache_population(ISR=10, CHN=90)

        response = client.get("/")

        assert response.context["line_chart_data"] == [
            {
                "date": "2026-09-22",
                "focus_coverage": 0.75,
                "focus_reality": 0.1,
                "comparison_coverage": 0.25,
                "comparison_reality": 0.9,
            }
        ]

    def test_compares_with_the_country_given(client):
        cache_day("2026-09-22", {"bbc.co.uk": {"ISR": 1, "USA": 3}})

        response = client.get("/", {"vs": "USA"})

        assert response.context["countries"]["comparison"]["name"] == "United States"
        assert response.context["line_chart_data"][0]["comparison_coverage"] == 0.75

    def test_restricts_coverage_to_the_selected_outlets(client):
        """Fox alone gives Israel 3 of 4 mentions; with the BBC it would be 3 of 8"""
        cache_day(
            "2026-09-22",
            {"foxnews.com": {"ISR": 3, "CHN": 1}, "bbc.co.uk": {"CHN": 4}},
        )

        response = client.get("/", {"outlet": "fox"})

        assert response.context["selected_outlets"] == ["fox"]
        assert response.context["line_chart_data"][0]["focus_coverage"] == 0.75

    def test_uses_every_outlet_when_none_is_selected(client):
        response = client.get("/", {"outlet": "not-an-outlet"})

        assert response.context["selected_outlets"] == list(news_coverage.OUTLETS)

    def test_offers_every_mentioned_country_but_israel_most_mentioned_first(client):
        cache_day("2026-09-22", {"bbc.co.uk": {"ISR": 5, "CHN": 1, "USA": 3}})
        cache_population(ISR=10, CHN=30, USA=60)

        response = client.get("/")

        assert response.context["choices"] == [("USA", "United States"), ("CHN", "China")]

    def test_renders_with_an_empty_cache(client):
        response = client.get("/")

        assert response.status_code == 200
        assert b"fetch_gdelt" in response.content

    def test_plots_each_countrys_mentions_against_its_population(client):
        cache_day("2026-09-22", {"bbc.co.uk": {"ISR": 3, "CHN": 1}})
        cache_population(ISR=10, CHN=90)

        response = client.get("/")

        assert response.context["scatter_data"]["points"] == [
            {"code": "CHN", "name": "China", "mentions": 1, "population": 90},
            {"code": "ISR", "name": "Israel", "mentions": 3, "population": 10},
        ]

    def test_gives_the_slope_of_mentions_in_proportion_to_population(client):
        """10 mentions over 100 people"""
        cache_day("2026-09-22", {"bbc.co.uk": {"ISR": 6, "CHN": 4}})
        cache_population(ISR=10, CHN=90)

        response = client.get("/")

        assert response.context["scatter_data"]["slope"] == 10 / 100

    def test_leaves_the_outlets_home_countries_out_of_the_slope(client):
        """Only Israel and China count: 10 mentions over 100 people"""
        cache_day("2026-09-22", {"bbc.co.uk": {"ISR": 6, "CHN": 4, "USA": 50, "GBR": 50}})
        cache_population(ISR=10, CHN=90, USA=300, GBR=70)

        response = client.get("/")

        assert response.context["scatter_data"]["slope"] == 10 / 100

    def test_leaves_the_outlets_home_countries_off_the_scatterplot(client):
        cache_day("2026-09-22", {"bbc.co.uk": {"ISR": 1, "USA": 1, "GBR": 1}})
        cache_population(ISR=10, USA=30, GBR=60)

        response = client.get("/")

        assert [point["code"] for point in response.context["scatter_data"]["points"]] == ["ISR"]
