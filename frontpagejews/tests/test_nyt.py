from datetime import date

import pytest
import requests

from frontpagejews import nyt
from frontpagejews.gazetteer import Gazetteer


def article(uri, pub_date, *places, keyword_name="Location"):
    """An article as the NYT's APIs return it, tagged with these places."""
    return {
        "uri": uri,
        "pub_date": pub_date,
        "keywords": [{"name": keyword_name, "value": place, "rank": 1} for place in places],
    }


def api_response(mocker, status_code, contents=None):
    fake = mocker.Mock(status_code=status_code)
    fake.json.return_value = contents
    if status_code >= 400:
        fake.raise_for_status.side_effect = requests.HTTPError(response=fake)
    return fake


def archive_file(articles):
    """A month's archive file as the Archive API returns it."""
    return {"response": {"docs": articles}}


def describe_publication_day():
    """Tests for the day an article was published"""

    def test_reads_each_way_pub_date_is_written():
        assert nyt.publication_day(article("a", "2015-03-01T00:05:25+0000")) == date(2015, 3, 1)
        assert nyt.publication_day(article("a", "2026-10-01T00:00:49Z")) == date(2026, 10, 1)
        assert nyt.publication_day(article("a", "2025-01-05T08:00:11.985+0000")) == date(2025, 1, 5)


def describe_summarize():
    """Tests for reducing a day's articles to counts"""

    def test_counts_articles_by_the_set_of_countries_they_name():
        articles = [
            article("a", "2026-09-15T10:00:00Z", "Iran", "Israel"),
            article("b", "2026-09-15T11:00:00Z", "Tel Aviv (Israel)"),
            article("c", "2026-09-15T12:00:00Z"),
        ]

        summary = nyt.summarize(articles, Gazetteer())

        assert summary == {
            "domains": {"nytimes.com": {"articles": 3, "country_sets": {"IRN,ISR": 1, "ISR": 1}}}
        }

    def test_counts_an_article_once_however_many_places_in_a_country_it_names():
        articles = [article("a", "2026-09-15T10:00:00Z", "Kyiv (Ukraine)", "Ukraine", "Odesa (Ukraine)")]

        summary = nyt.summarize(articles, Gazetteer())

        assert summary["domains"]["nytimes.com"]["country_sets"] == {"UKR": 1}

    def test_reads_older_articles_place_tags():
        """Called glocations before"""
        articles = [article("a", "2015-03-01T00:05:25+0000", "Iran", keyword_name="glocations")]

        summary = nyt.summarize(articles, Gazetteer())

        assert summary["domains"]["nytimes.com"]["country_sets"] == {"IRN": 1}

    def test_ignores_other_keywords():
        articles = [article("a", "2026-09-15T10:00:00Z", "Iran", keyword_name="Subject")]

        summary = nyt.summarize(articles, Gazetteer())

        assert summary["domains"]["nytimes.com"]["country_sets"] == {}


def describe_fetch_archive_month_days():
    """Tests for the days a month's archive file covers"""

    @pytest.fixture(autouse=True)
    def call_api(mocker):
        """Nothing is exported unless a test says so"""
        return mocker.patch.object(nyt, "call_api", return_value=None)

    def test_gives_every_day_of_a_file_that_reaches_the_month_end(call_api):
        call_api.return_value = archive_file(
            [article("a", "2015-03-01T00:05:25+0000"), article("b", "2015-03-31T23:58:11+0000")],
        )

        days = nyt.fetch_archive_month_days(2015, 3)

        assert sorted(days) == [date(2015, 3, 1), date(2015, 3, 31)]

    def test_leaves_out_the_days_an_unfinished_month_may_not_have_all_of(call_api):
        """Exported on Oct 4: the 4th may be missing articles"""
        call_api.return_value = archive_file(
            [
                article("a", "2026-10-02T12:00:00Z"),
                article("b", "2026-10-03T12:00:00Z"),
                article("c", "2026-10-04T12:00:00Z"),
            ],
        )

        assert sorted(nyt.fetch_archive_month_days(2026, 10)) == [date(2026, 10, 2), date(2026, 10, 3)]

    def test_leaves_out_the_last_day_of_a_file_that_stops_before_its_end(call_api):
        """As from late 2020 to 2024"""
        call_api.return_value = archive_file(
            [article("a", "2023-03-30T12:00:00Z"), article("b", "2023-03-31T16:12:54Z")]
        )

        assert sorted(nyt.fetch_archive_month_days(2023, 3)) == [date(2023, 3, 30)]

    def test_leaves_out_the_next_months_first_hours(call_api):
        call_api.return_value = archive_file(
            [article("sep", "2026-09-30T23:00:00Z"), article("oct", "2026-10-01T03:00:00Z")]
        )

        assert sorted(nyt.fetch_archive_month_days(2026, 9)) == [date(2026, 9, 30)]

    def test_gives_no_days_for_a_month_not_exported_yet():
        assert nyt.fetch_archive_month_days(2026, 11) == {}


def fake_search(mocker, article_count):
    """Search over a day with this many articles, paging as the NYT's does."""
    day_articles = [article(f"a{n}", "2026-11-03T10:00:00Z") for n in range(article_count)]

    def call_api(url, params):
        in_order = day_articles if params["sort"] == "oldest" else day_articles[::-1]
        start = params["page"] * nyt.SEARCH_PAGE_SIZE
        docs = in_order[start : start + nyt.SEARCH_PAGE_SIZE]
        return {"response": {"docs": docs, "metadata": {"hits": article_count}}}

    return mocker.patch.object(nyt, "call_api", side_effect=call_api)


def pages_searched(call_api):
    return [(call.args[1]["sort"], call.args[1]["page"]) for call in call_api.call_args_list]


def describe_search_day():
    """Tests for one day's articles from Article Search"""

    def test_reads_every_page(mocker):
        call_api = fake_search(mocker, 11)

        articles, complete = nyt.search_day(date(2026, 11, 3))

        assert len(articles) == 11
        assert complete
        assert pages_searched(call_api) == [("oldest", 0), ("oldest", 1)]

    def test_reads_a_day_past_searchs_last_page_again_from_its_newest(mocker):
        last_page_ends_at = (nyt.LAST_SEARCH_PAGE + 1) * nyt.SEARCH_PAGE_SIZE
        call_api = fake_search(mocker, last_page_ends_at + 15)

        articles, complete = nyt.search_day(date(2026, 11, 3))

        assert len(articles) == last_page_ends_at + 15
        assert complete
        assert pages_searched(call_api)[-2:] == [("newest", 0), ("newest", 1)]

    def test_marks_a_day_too_big_to_read_both_ways_incomplete(mocker):
        last_page_ends_at = (nyt.LAST_SEARCH_PAGE + 1) * nyt.SEARCH_PAGE_SIZE
        fake_search(mocker, 2 * last_page_ends_at + 1)

        articles, complete = nyt.search_day(date(2026, 11, 3))

        assert len(articles) == 2 * last_page_ends_at
        assert not complete


def describe_call_api():
    """Tests for calling the NYT's APIs"""

    @pytest.fixture(autouse=True)
    def sleep(mocker):
        return mocker.patch.object(nyt.time, "sleep")

    def test_tries_again_after_the_per_minute_limit(mocker):
        mocker.patch.object(
            nyt.requests,
            "get",
            side_effect=[api_response(mocker, 429), api_response(mocker, 200, {"ok": 1})],
        )

        assert nyt.call_api(nyt.SEARCH_URL, {}) == {"ok": 1}

    def test_gives_none_for_a_month_not_exported_yet(mocker):
        mocker.patch.object(nyt.requests, "get", return_value=api_response(mocker, 403))

        assert nyt.call_api(nyt.ARCHIVE_URL.format(year=2026, month=11), {}) is None

    def test_gives_up_after_the_last_wait(mocker):
        get = mocker.patch.object(nyt.requests, "get", return_value=api_response(mocker, 429))

        with pytest.raises(requests.HTTPError):
            nyt.call_api(nyt.SEARCH_URL, {})
        assert get.call_count == len(nyt.RETRY_WAITS) + 1


def describe_fetch_days():
    """Tests for fetching and caching days"""

    @pytest.fixture
    def search_day(mocker):
        return mocker.patch.object(
            nyt, "search_day", return_value=([article("s", "2026-10-30T10:00:00Z", "Iran")], True)
        )

    def test_searches_for_a_few_days_without_the_archive(mocker, search_day):
        fetch_archive_month_days = mocker.patch.object(nyt, "fetch_archive_month_days")

        list(nyt.fetch_days([date(2026, 10, 30), date(2026, 10, 31)]))

        fetch_archive_month_days.assert_not_called()
        assert nyt.load_day(date(2026, 10, 31))["source"] == "search"

    def test_takes_many_days_from_the_archive_and_searches_for_the_rest(mocker, search_day):
        archived = {
            date(2015, 3, day): [article("a", f"2015-03-0{day}T10:00:00+0000")] for day in (1, 2)
        }
        mocker.patch.object(nyt, "fetch_archive_month_days", return_value=archived)

        list(nyt.fetch_days([date(2015, 3, day) for day in (1, 2, 3)]))

        assert nyt.load_day(date(2015, 3, 2))["source"] == "archive"
        assert nyt.load_day(date(2015, 3, 3))["source"] == "search"
        search_day.assert_called_once_with(date(2015, 3, 3))

    def test_saves_the_archives_days_before_searching_any(mocker, search_day):
        """March's file stops partway through the 31st, as from late 2020 to 2024,
        so that day needs search, which fails. April's days, after it, are saved
        first."""
        march_archived = {
            date(2023, 3, day): [article("a", f"2023-03-{day}T10:00:00Z")] for day in (29, 30)
        }
        april_archived = {
            date(2023, 4, day): [article("a", f"2023-04-0{day}T10:00:00Z")] for day in (1, 2, 3)
        }
        mocker.patch.object(
            nyt,
            "fetch_archive_month_days",
            side_effect=lambda year, month: march_archived if month == 3 else april_archived,
        )
        search_day.side_effect = requests.HTTPError("429")
        days = [*march_archived, date(2023, 3, 31), *april_archived]

        with pytest.raises(requests.HTTPError):
            list(nyt.fetch_days(days))

        search_day.assert_called_once_with(date(2023, 3, 31))
        assert nyt.load_day(date(2023, 4, 3)) is not None

    def test_saves_a_day_search_could_not_read_all_of_as_incomplete(search_day):
        search_day.return_value = ([article("s", "2026-11-03T10:00:00Z", "Iran")], False)

        list(nyt.fetch_days([date(2026, 11, 3)]))

        assert nyt.is_incomplete(nyt.load_day(date(2026, 11, 3)))

    def test_fills_an_incomplete_day_from_the_archive(mocker, search_day):
        nyt.save_day(date(2026, 11, 3), [], "search", Gazetteer(), complete=False)
        archived = {date(2026, 11, 3): [article("a", "2026-11-03T10:00:00Z", "Iran")]}
        mocker.patch.object(nyt, "fetch_archive_month_days", return_value=archived)

        list(nyt.fetch_days([date(2026, 11, 3)]))

        summary = nyt.load_day(date(2026, 11, 3))
        assert summary["source"] == "archive"
        assert not nyt.is_incomplete(summary)
        search_day.assert_not_called()

    def test_leaves_an_incomplete_day_the_archive_does_not_cover_yet(mocker, search_day):
        """Searching again would only reach the same articles"""
        nyt.save_day(date(2026, 11, 3), [], "search", Gazetteer(), complete=False)
        mocker.patch.object(nyt, "fetch_archive_month_days", return_value={})

        assert list(nyt.fetch_days([date(2026, 11, 3)])) == []
        assert nyt.is_incomplete(nyt.load_day(date(2026, 11, 3)))
        search_day.assert_not_called()

    def test_refuses_a_day_that_is_not_over():
        with pytest.raises(ValueError, match="not over yet"):
            list(nyt.fetch_days([date(2999, 1, 1)]))
