import datetime

import pytest
from django.db.models import ProtectedError
from django.db.utils import IntegrityError

from frontpagejews.models import DailyCountryCount, DailyScrape, Outlet


@pytest.fixture
def nyt(db):
    return Outlet.objects.create(name="The New York Times", slug="nyt")


@pytest.fixture
def scrape(nyt):
    return DailyScrape.objects.create(date=datetime.date(2026, 9, 23), outlet=nyt, article_count=97)


def describe_daily_scrape():
    """Tests for the per-outlet, per-day scrape record"""

    def test_one_scrape_per_outlet_and_day(nyt, scrape):
        with pytest.raises(IntegrityError):
            DailyScrape.objects.create(date=datetime.date(2026, 9, 23), outlet=nyt, article_count=42)

    def test_outlets_are_scraped_independently_on_the_same_day(nyt, scrape, db):
        wsj = Outlet.objects.create(name="The Wall Street Journal", slug="wsj")
        DailyScrape.objects.create(date=datetime.date(2026, 9, 23), outlet=wsj, article_count=40)

        assert DailyScrape.objects.count() == 2

    def test_scraped_outlets_cannot_be_deleted(nyt, scrape):
        """PROTECT, so scraped history survives an accidental outlet delete"""
        with pytest.raises(ProtectedError):
            nyt.delete()


def describe_daily_country_count():
    """Tests for the per-country counts hanging off a scrape"""

    def test_one_row_per_country_within_a_scrape(scrape):
        DailyCountryCount.objects.create(daily_scrape=scrape, country_code="ISR", count=12)

        with pytest.raises(IntegrityError):
            DailyCountryCount.objects.create(daily_scrape=scrape, country_code="ISR", count=3)

    def test_the_same_country_may_recur_in_another_scrape(nyt, scrape):
        later = DailyScrape.objects.create(date=datetime.date(2026, 9, 24), outlet=nyt, article_count=88)
        for s in (scrape, later):
            DailyCountryCount.objects.create(daily_scrape=s, country_code="ISR", count=12)

        assert DailyCountryCount.objects.filter(country_code="ISR").count() == 2

    def test_counts_are_reachable_from_their_scrape(scrape):
        DailyCountryCount.objects.create(daily_scrape=scrape, country_code="ISR", count=12)
        DailyCountryCount.objects.create(daily_scrape=scrape, country_code="IRN", count=10)

        assert scrape.country_counts.count() == 2

    def test_deleting_a_scrape_deletes_its_counts(scrape):
        """CASCADE, so re-scraping a day can clear and rewrite atomically"""
        DailyCountryCount.objects.create(daily_scrape=scrape, country_code="ISR", count=12)

        scrape.delete()

        assert DailyCountryCount.objects.count() == 0

    def test_the_denominator_is_one_attribute_away(scrape):
        """The point of DailyScrape: counts are comparable across outlets"""
        count = DailyCountryCount.objects.create(daily_scrape=scrape, country_code="IRN", count=10)

        assert count.count / count.daily_scrape.article_count == pytest.approx(0.103, abs=0.001)
