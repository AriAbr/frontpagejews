"""Per-day country counts for the New York Times, from its own place tags.

GDELT barely crawls the NYT (it's paywalled), so its articles come from the
NYT's APIs instead. Every article carries `Location` tags assigned by the NYT,
such as "Iran", "Kyiv (Ukraine)" or "Las Vegas
(Nev)". Each tag is converted to a country (see `nyt_places.py`),
and the day is reduced to the same shape as a GDELT day (see `gdelt.py`): the
article count, and how many articles named each set of countries. So the
browser can treat the NYT as one more outlet.

The tags record what an article is about, while GDELT records every place an
article mentions, so the NYT names fewer countries per article than the GDELT
outlets do.

Two APIs, both keyed with `NYT_API_KEY` and limited to 5 calls a minute and
500 a day:
- The Archive API returns a whole month in one call, so it fills in history.
  NYT exports it in occasional batches, though, so a month's file can stop days
  or weeks short, and the current month's isn't there at all.
- The Article Search API is live, but returns 10 articles a call, so it is used
  for the few days the archive doesn't cover yet. It reads at most 1,010
  results a query, so a day it can't read all of is marked incomplete and
  waits for the archive (see `search_day`).
For a day both have, they return the same articles with the same tags.

Only the counts are kept, in `NYT_CACHE_DIR`, which is pushed to the data
branch. The NYT's terms don't allow keeping its articles, so nothing the APIs
return is saved.
"""

import json
import logging
import time
from collections import Counter, defaultdict
from datetime import UTC, date, datetime, timedelta

import requests
from django.conf import settings

from frontpagejews.gazetteer import Gazetteer
from frontpagejews.gdelt import country_set_key
from frontpagejews.nyt_places import place_country
from frontpagejews.pacing import Pacer

ARCHIVE_URL = "https://api.nytimes.com/svc/archive/v1/{year}/{month}.json"
SEARCH_URL = "https://api.nytimes.com/svc/search/v2/articlesearch.json"
SEARCH_PAGE_SIZE = 10
# Search's last page for a query: pages go from 0 to 100, so 1,010 results
# (the docs say 1,000, but page 100 works).
LAST_SEARCH_PAGE = 100
# The NYT's domain, so a day file looks like a GDELT one.
DOMAIN = "nytimes.com"
# 5 calls a minute, so at least 12 seconds apart; one more to be safe.
SECONDS_BETWEEN_CALLS = 13
# Seconds to wait before each new try at a call that failed for a reason that
# may pass. The per-minute limit (429) clears within a minute.
RETRY_WAITS = [15, 60, 120, 300]
# A month with more days missing than this is fetched from the archive: one
# call, against about 15 a day from search.
MOST_DAYS_TO_SEARCH = 2
# How close to a month's end its archive file's last article must be for the
# file to count as reaching it.
MONTH_END_MARGIN = timedelta(hours=3)
# The keyword type of place tags: "glocations" in older articles.
LOCATION_KEYWORD_NAMES = {"Location", "glocations"}

logger = logging.getLogger(__name__)

_pacer = Pacer(SECONDS_BETWEEN_CALLS)


def fetch_days(days: list[date]):
    """Fetch and cache each of these days, from the archive where it covers a
    month with many of them, else from search. Yields (day, summary) as each
    is saved.

    The archive's days are saved first. Search takes about 15 calls a day, so
    catching up on weeks the archive doesn't cover yet can use up the NYT's 500
    calls a day, and the run stops with the archive's days already saved.

    A day already saved incomplete (it has more articles than search can
    return) is only ever filled from the archive, as searching again would
    reach the same articles. Until the archive covers it, it's left as it is.
    """
    yesterday = datetime.now(UTC).date() - timedelta(days=1)
    days_by_month = defaultdict(list)
    for day in days:
        if day > yesterday:
            raise ValueError(f"{day} is not over yet")
        days_by_month[(day.year, day.month)].append(day)

    # One for the whole run, so each place name is looked up once.
    gazetteer = Gazetteer()
    days_to_search = []
    for (year, month), month_days in sorted(days_by_month.items()):
        incomplete_days = [day for day in month_days if is_incomplete(load_day(day))]
        if incomplete_days or len(month_days) > MOST_DAYS_TO_SEARCH:
            archived = fetch_archive_month_days(year, month)
        else:
            archived = {}
        for day in sorted(month_days):
            if day in archived:
                yield day, save_day(day, archived[day], "archive", gazetteer)
            elif day not in incomplete_days:
                days_to_search.append(day)
    for day in days_to_search:
        articles, complete = search_day(day)
        yield day, save_day(day, articles, "search", gazetteer, complete)


def load_day(day):
    """The cached summary for one day, or None if it has not been fetched."""
    path = cache_path(day)
    if not path.exists():
        return None
    return json.loads(path.read_text())


def is_incomplete(summary):
    """Whether a cached day is missing articles Search couldn't read."""
    return summary is not None and summary.get("complete") is False


def cache_path(day):
    """A folder per year, like GDELT's: var/data/nyt/2024/2024-03-01.json."""
    return settings.NYT_CACHE_DIR / str(day.year) / f"{day.isoformat()}.json"


def fetch_archive_month_days(year, month):
    """Map day -> its articles, for each day of the month the archive fully covers.

    A day is covered if the file reaches the month's end, or reaches past the
    day. Newer files also hold the next month's first hours, which that
    month's own file has too, so they are left out.
    """
    articles = fetch_archive_month(year, month)
    if not articles:
        return {}
    articles_by_day = defaultdict(list)
    for article in articles:
        day = publication_day(article)
        if day.year == year and day.month == month:
            articles_by_day[day].append(article)
    file_reaches_month_end = reaches_month_end(articles, year, month)
    last_day_reached = max(publication_day(article) for article in articles)
    return {
        day: day_articles
        for day, day_articles in articles_by_day.items()
        if file_reaches_month_end or day < last_day_reached
    }


def fetch_archive_month(year, month):
    """Every article in one month's archive file, or None if it isn't exported yet."""
    contents = call_api(ARCHIVE_URL.format(year=year, month=month), {})
    if contents is None:
        return None
    return contents["response"]["docs"]


def reaches_month_end(articles, year, month):
    """Whether a month's file reaches the month's end, give or take a quiet last hour
    or two. Files from late 2020 to 2024 stop in the last day's afternoon, and
    the rest of that day is in no file."""
    if not articles:
        return False
    # Midnight UTC as the next month starts: the 28th plus 4 days is always in
    # the next month.
    month_end = (datetime(year, month, 28, tzinfo=UTC) + timedelta(days=4)).replace(day=1)
    last_published = max(publication_time(article) for article in articles)
    return last_published >= month_end - MONTH_END_MARGIN


def publication_day(article):
    """The day, in UTC like GDELT's, an article was published."""
    return publication_time(article).date()


def publication_time(article):
    """When an article was published. `pub_date` is in UTC, written
    "2026-10-01T00:00:49Z" lately and "2015-03-01T00:05:25+0000" before, and
    sometimes with fractions of a second ("2025-01-05T08:00:11.985+0000")."""
    return datetime.fromisoformat(article["pub_date"])


def save_day(day, articles, source, gazetteer, complete=True):
    """Summarize a day's articles and cache the summary."""
    summary = summarize(articles, gazetteer)
    summary["date"] = day.isoformat()
    # Which API the day came from: "archive" or "search".
    summary["source"] = source
    # Only a day missing articles is marked, so the rest of the files stay as
    # they were.
    if not complete:
        summary["complete"] = False
    summary["fetched_at"] = datetime.now(UTC).isoformat(timespec="seconds")
    path = cache_path(day)
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(summary))
    return summary


def summarize(articles, gazetteer):
    """Reduce a day's articles to the article count and the counts by set of
    countries, like a GDELT day's."""
    country_set_keys = []
    for article in articles:
        countries = set()
        for tag in location_tags(article):
            country = place_country(tag, gazetteer)
            if country:
                countries.add(country)
        if countries:
            country_set_keys.append(country_set_key(countries))
    return {
        "domains": {DOMAIN: {"articles": len(articles), "country_sets": dict(Counter(country_set_keys))}}
    }


def location_tags(article):
    return [
        keyword["value"]
        for keyword in article.get("keywords") or []
        if keyword["name"] in LOCATION_KEYWORD_NAMES
    ]


def search_day(day):
    """The articles published on one day, page by page from Article Search,
    and whether they're all of that day's.

    Search reads at most 1,010 results a query, and a day can have more:
    Election Day's results pages, one per race, came to about 900 in 2022 and
    2024. So a day with more is read again from its newest article, which
    reaches every article on a day with up to 2,020. Past that, the day is
    missing articles in the middle; `fetch_days` fills it from the archive once
    the archive covers it.
    """
    articles = {}
    for page in range(LAST_SEARCH_PAGE + 1):
        page_articles, _ = search_page(day, "oldest", page)
        for article in page_articles:
            articles[article["uri"]] = article
        is_last_page = len(page_articles) < SEARCH_PAGE_SIZE
        if is_last_page:
            return list(articles.values()), True

    # Read the rest from the newest article back, until the two passes meet.
    has_every_article = False
    for page in range(LAST_SEARCH_PAGE + 1):
        page_articles, total_hits = search_page(day, "newest", page)
        for article in page_articles:
            articles[article["uri"]] = article
        has_every_article = len(articles) >= total_hits
        is_last_page = len(page_articles) < SEARCH_PAGE_SIZE
        if has_every_article or is_last_page:
            break
    return list(articles.values()), has_every_article


def search_page(day, sort, page):
    """One page of a day's articles from Article Search, and how many articles
    it has for the day in all."""
    params = {
        "begin_date": f"{day:%Y%m%d}",
        "end_date": f"{day:%Y%m%d}",
        "sort": sort,
        "page": page,
    }
    response = call_api(SEARCH_URL, params)["response"]
    return response["docs"] or [], response["metadata"]["hits"]


def call_api(url, params):
    """The JSON an NYT API returns, or None if it has nothing at that URL.

    Waits as long as the per-minute limit needs since the last call.
    """
    params = {**params, "api-key": settings.NYT_API_KEY}
    for wait in [*RETRY_WAITS, None]:
        _pacer.wait()
        try:
            response = requests.get(url, params=params, timeout=120)
        except (requests.ConnectionError, requests.Timeout) as error:
            if wait is None:
                raise
            logger.warning("%s failed (%s); trying again in %ss", url, error, wait)
            time.sleep(wait)
            continue
        # The archive answers 403 for a month it hasn't exported yet.
        if response.status_code in (403, 404):
            return None
        if wait is not None and (response.status_code == 429 or response.status_code >= 500):
            logger.warning("%s returned %s; trying again in %ss", url, response.status_code, wait)
            time.sleep(wait)
            continue
        response.raise_for_status()
        return response.json()
