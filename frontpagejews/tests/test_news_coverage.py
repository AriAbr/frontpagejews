from frontpagejews import news_coverage


def day_summary(date, domains):
    return {"date": date, "domains": domains}


def describe_outlet_country_set_mentions():
    """Tests for one outlet's mentions per country set on one day"""

    def test_adds_up_an_outlets_domains():
        data = day_summary(
            "2026-09-22",
            {
                "bbc.co.uk": {"articles": 3, "country_sets": {"ISR,USA": 2, "ISR": 1}},
                "bbc.com": {"articles": 1, "country_sets": {"ISR,USA": 1}},
            },
        )

        assert news_coverage.outlet_country_set_mentions(data, "bbc") == {"ISR,USA": 3, "ISR": 1}

    def test_ignores_other_outlets():
        data = day_summary("2026-09-22", {"foxnews.com": {"articles": 1, "country_sets": {"ISR": 1}}})

        assert news_coverage.outlet_country_set_mentions(data, "bbc") == {}
