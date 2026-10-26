from frontpagejews import news_coverage


def day_summary(date, domains):
    return {"date": date, "domains": domains}


def outlet(articles, **countries):
    """One domain's day, its articles each mentioning a single country, e.g.
    outlet(3, ISR=2, USA=1)."""
    return {"articles": articles, "country_sets": countries}


def describe_outlet_mentions():
    """Tests for one outlet's mentions on one day"""

    def test_adds_up_an_outlets_domains():
        data = day_summary(
            "2026-09-22", {"bbc.co.uk": outlet(2, ISR=1, USA=1), "bbc.com": outlet(1, USA=1)}
        )

        assert news_coverage.outlet_mentions(data, "bbc") == {"ISR": 1, "USA": 2}

    def test_ignores_other_outlets():
        data = day_summary("2026-09-22", {"foxnews.com": outlet(1, ISR=1)})

        assert news_coverage.outlet_mentions(data, "bbc") == {}


def describe_country_counts():
    """Tests for reading one domain's per-country counts from its day"""

    def test_counts_an_article_once_for_each_country_it_mentions():
        domain_day_summary = {"articles": 4, "country_sets": {"ISR,USA": 2, "ISR": 1}}

        assert news_coverage.country_counts(domain_day_summary) == {"ISR": 3, "USA": 2}

    def test_reads_a_day_fetched_before_country_sets():
        domain_day_summary = {"articles": 2, "countries": {"ISR": 2, "USA": 1}}

        assert news_coverage.country_counts(domain_day_summary) == {"ISR": 2, "USA": 1}
