from frontpagejews import news_coverage


def day_summary(date, domains):
    return {"date": date, "domains": domains}


def outlet(articles, **countries):
    """One domain's day, its articles each mentioning a single country, e.g.
    outlet(3, ISR=2, USA=1)."""
    return {"articles": articles, "country_sets": countries}


def describe_coverage_shares():
    """Tests for turning one day's mentions into per-country shares"""

    def test_pools_mentions_across_outlets_so_bigger_outlets_count_for_more():
        """10 Israel mentions out of 1010 in total, however the outlets split them"""
        data = day_summary(
            "2026-09-22",
            {"bbc.co.uk": outlet(10, ISR=10), "foxnews.com": outlet(1000, USA=1000)},
        )

        result = news_coverage.coverage_shares([data], ["bbc", "fox"])

        assert result == {"ISR": 10 / 1010, "USA": 1000 / 1010}

    def test_combines_an_outlets_domains_before_taking_shares():
        data = day_summary("2026-09-22", {"bbc.co.uk": outlet(4, ISR=1), "bbc.com": outlet(4, USA=3)})

        assert news_coverage.coverage_shares([data], ["bbc"]) == {"ISR": 0.25, "USA": 0.75}

    def test_skips_outlets_with_no_mentions_that_day():
        data = day_summary("2026-09-22", {"bbc.co.uk": outlet(4, ISR=1, USA=1)})

        assert news_coverage.coverage_shares([data], ["bbc", "fox"]) == {"ISR": 0.5, "USA": 0.5}

    def test_returns_nothing_when_no_outlet_has_data():
        assert news_coverage.coverage_shares([day_summary("2026-09-22", {})], ["bbc"]) == {}


def describe_mention_counts():
    """Tests for adding up mentions before any division"""

    def test_adds_up_mentions_across_outlets_and_days():
        day_summaries = [
            day_summary(
                "2026-09-22", {"bbc.co.uk": outlet(2, ISR=1, USA=1), "foxnews.com": outlet(1, ISR=2)}
            ),
            day_summary("2026-09-23", {"bbc.com": outlet(1, USA=1)}),
        ]

        assert news_coverage.mention_counts(day_summaries, ["bbc", "fox"]) == {"ISR": 3, "USA": 2}

    def test_ignores_outlets_not_selected():
        day_summaries = [day_summary("2026-09-22", {"foxnews.com": outlet(1, ISR=1)})]

        assert news_coverage.mention_counts(day_summaries, ["bbc"]) == {}


def describe_country_counts():
    """Tests for reading one domain's per-country counts from its day"""

    def test_counts_an_article_once_for_each_country_it_mentions():
        domain_day_summary = {"articles": 4, "country_sets": {"ISR,USA": 2, "ISR": 1}}

        assert news_coverage.country_counts(domain_day_summary) == {"ISR": 3, "USA": 2}

    def test_reads_a_day_fetched_before_country_sets():
        domain_day_summary = {"articles": 2, "countries": {"ISR": 2, "USA": 1}}

        assert news_coverage.country_counts(domain_day_summary) == {"ISR": 2, "USA": 1}
