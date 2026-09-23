import datetime

import pytest
from django.db.utils import IntegrityError

from frontpagejews.models import DailyCount, Feed, Outlet


@pytest.fixture
def nyt(db):
    return Outlet.objects.create(name="The New York Times", slug="nyt")


def describe_daily_count():
    """Tests for the DailyCount uniqueness rules"""

    def test_one_row_per_date_outlet_and_country(nyt):
        DailyCount.objects.create(
            date=datetime.date(2026, 9, 23),
            outlet=nyt,
            country_code="ISR",
            mention_count=12,
            article_count=9,
        )

        with pytest.raises(IntegrityError):
            DailyCount.objects.create(
                date=datetime.date(2026, 9, 23),
                outlet=nyt,
                country_code="ISR",
                mention_count=3,
                article_count=2,
            )

    def test_the_same_country_may_recur_on_another_date(nyt):
        for day in (22, 23):
            DailyCount.objects.create(
                date=datetime.date(2026, 9, day),
                outlet=nyt,
                country_code="ISR",
                mention_count=12,
                article_count=9,
            )

        assert DailyCount.objects.filter(country_code="ISR").count() == 2

    def test_outlets_are_counted_independently_on_the_same_date(nyt, db):
        bbc = Outlet.objects.create(name="BBC News", slug="bbc")
        for outlet in (nyt, bbc):
            DailyCount.objects.create(
                date=datetime.date(2026, 9, 23),
                outlet=outlet,
                country_code="ISR",
                mention_count=12,
                article_count=9,
            )

        assert DailyCount.objects.count() == 2

    def test_outlets_with_counts_cannot_be_deleted(nyt):
        """on_delete=PROTECT, so scraped history survives an accidental delete"""
        from django.db.models import ProtectedError

        DailyCount.objects.create(
            date=datetime.date(2026, 9, 23),
            outlet=nyt,
            country_code="ISR",
            mention_count=12,
            article_count=9,
        )

        with pytest.raises(ProtectedError):
            nyt.delete()


def describe_feed():
    """Tests for Feed, which lets one outlet carry several section feeds"""

    def test_an_outlet_may_have_several_feeds(nyt):
        for section in ("HomePage", "World", "US", "Politics"):
            Feed.objects.create(
                outlet=nyt,
                name=section,
                url=f"https://rss.nytimes.com/services/xml/rss/nyt/{section}.xml",
            )

        assert nyt.feeds.count() == 4

    def test_the_same_url_cannot_repeat_within_an_outlet(nyt):
        url = "https://rss.nytimes.com/services/xml/rss/nyt/World.xml"
        Feed.objects.create(outlet=nyt, name="World", url=url)

        with pytest.raises(IntegrityError):
            Feed.objects.create(outlet=nyt, name="World (again)", url=url)

    def test_deleting_an_outlet_deletes_its_feeds(nyt):
        """Feeds are configuration, so they cascade -- unlike DailyCount"""
        Feed.objects.create(
            outlet=nyt, name="World", url="https://rss.nytimes.com/services/xml/rss/nyt/World.xml"
        )

        nyt.delete()

        assert Feed.objects.count() == 0
