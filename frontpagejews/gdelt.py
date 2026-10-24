"""Per-domain, per-day country mention counts from GDELT's GKG bulk files.

GDELT publishes a GKG file every 15 minutes, one row per article it crawled,
each tagged with the locations the article mentions. A day is 96 files of a
few MB each. That is too slow to read on every page load, so each finished day
is reduced to counts and written to a JSON file in `GDELT_CACHE_DIR`. The cache
is disposable: deleting it only means re-downloading.

An article "mentions" a country if any location GDELT found in it lies in that
country, so "Tel Aviv" counts for Israel. GDELT tags with FIPS 10-4 codes;
they are converted to ISO3 per article (see `country_codes.py`), so an article that
mentions both Tel Aviv and Gaza counts once for the combined Israel, West Bank,
and Gaza.

Only the outlets' domains are kept, so adding an outlet means re-fetching past
days with `--refresh`.
"""

import io
import json
import logging
import time
import zipfile
from collections import Counter, defaultdict
from concurrent.futures import ThreadPoolExecutor
from datetime import UTC, date, datetime, timedelta
from enum import IntEnum
from urllib.parse import urlparse

import requests
from django.conf import settings

from frontpagejews.country_codes import FIPS_TO_ISO3
from frontpagejews.news_coverage import OUTLET_DOMAINS

BASE_URL = "https://data.gdeltproject.org/gdeltv2/"
RAW_GDELT_FILES_PER_DAY = 24 * 4  # one every 15 minutes
# Seconds to wait before each new try at a download that failed, about 8
# minutes in all, so a dropped Wi-Fi connection or a moment without DNS doesn't
# end a backfill.
RETRY_WAITS = [5, 30, 60, 120, 300]

logger = logging.getLogger(__name__)


class GkgColumn(IntEnum):
    """Positions of the columns we read in GDELT's tab-separated GKG 2.1 row."""

    SOURCE_COLLECTION = 2
    SOURCE_DOMAIN = 3
    DOCUMENT_URL = 4
    V2_LOCATIONS = 10


def file_url(moment):
    return f"{BASE_URL}{moment:%Y%m%d%H%M%S}.gkg.csv.zip"


def file_urls(day):
    start = datetime(day.year, day.month, day.day, tzinfo=UTC)
    return [file_url(start + timedelta(minutes=15 * i)) for i in range(RAW_GDELT_FILES_PER_DAY)]


def parse_locations(field):
    """The ISO3 codes of the countries in one article's V2Locations field.

    Each location is `type#full name#FIPS code#...`. Codes with no ISO3
    equivalent (oceans, uninhabited islands) are dropped.
    """
    countries = set()
    for location in filter(None, field.split(";")):
        parts = location.split("#")
        if len(parts) > 2 and parts[2] in FIPS_TO_ISO3:
            countries.add(FIPS_TO_ISO3[parts[2]])
    return countries


def parse_gkg(raw_file):
    """Yield (domain, url, {iso3, ...}) for each web article in one raw GDELT file.

    `raw_file` is the file's decoded contents: tab-separated rows, one per article.
    """
    for line in raw_file.splitlines():
        columns = line.split("\t")
        if len(columns) <= GkgColumn.V2_LOCATIONS:
            continue
        # The other collections are mostly academic and archival, with no news domain.
        is_web_source = columns[GkgColumn.SOURCE_COLLECTION] == "1"
        if not is_web_source:
            continue
        yield (
            columns[GkgColumn.SOURCE_DOMAIN],
            columns[GkgColumn.DOCUMENT_URL],
            parse_locations(columns[GkgColumn.V2_LOCATIONS]),
        )


def fetch_gkg(url):
    """The decoded contents of one GKG file, or None if GDELT never published it.

    GDELT skips the occasional 15-minute slot, so a missing file is expected.
    A download that fails for a reason that may pass (no connection, one that
    breaks partway, a timeout, an error on GDELT's side) is tried again after
    each of `RETRY_WAITS`.
    """
    for wait in RETRY_WAITS:
        try:
            return download_gkg(url)
        except requests.RequestException as error:
            if not is_temporary(error):
                raise
            logger.warning("%s failed (%s); trying again in %ss", url, error, wait)
            time.sleep(wait)
    return download_gkg(url)


def is_temporary(error):
    """Whether a failed download may work if tried again."""
    if isinstance(error, requests.HTTPError):
        return error.response.status_code >= 500
    # ChunkedEncodingError: the connection broke partway through the file.
    return isinstance(
        error, (requests.ConnectionError, requests.Timeout, requests.exceptions.ChunkedEncodingError)
    )


def download_gkg(url):
    response = requests.get(url, timeout=60)
    if response.status_code == 404:
        return None
    response.raise_for_status()
    with zipfile.ZipFile(io.BytesIO(response.content)) as archive:
        return archive.read(archive.namelist()[0]).decode("utf-8", errors="replace")


def outlet_domain(domain, url):
    """The outlet domain an article is counted under, or None if it isn't an outlet's.

    GDELT files articles under the site's registered domain, so ABC's articles at
    abcnews.go.com (its address until early 2026) come under go.com, which
    other Disney sites share. Those are matched by the URL's host instead.
    """
    if domain in OUTLET_DOMAINS:
        return domain
    host = urlparse(url).hostname
    return host if host in OUTLET_DOMAINS else None


def summarize(raw_files):
    """Reduce a day's raw GDELT files to per-domain article and country counts.

    Only the outlets' domains are kept. Each raw file is its decoded contents, as returned by `fetch_gkg`. Articles
    are counted by URL, so one GDELT re-crawl of the same page is not counted
    twice.
    """
    articles = defaultdict(dict)
    files = 0
    for raw_file in raw_files:
        files += 1
        for gdelt_domain, url, countries in parse_gkg(raw_file):
            domain = outlet_domain(gdelt_domain, url)
            if domain is None:
                continue
            articles[domain].setdefault(url, set()).update(countries)

    domains = {}
    for domain, countries_by_url in articles.items():
        counts = Counter()
        for countries in countries_by_url.values():
            counts.update(countries)  # add 1 to each country
        domains[domain] = {"articles": len(countries_by_url), "countries": dict(counts)}
    return {"domains": domains, "files": files}


def build_day(day, workers=8):
    urls = file_urls(day)
    with ThreadPoolExecutor(max_workers=workers) as pool:
        # Files are summarized and dropped as they arrive, but `pool.map`
        # downloads ahead, so files not yet summarized wait in memory (up to
        # most of a day, ~1GB decoded). Fine on a CI runner; bound the
        # in-flight downloads before running this somewhere small.
        raw_files = (raw_file for raw_file in pool.map(fetch_gkg, urls) if raw_file is not None)
        summary = summarize(raw_files)
    summary["date"] = day.isoformat()
    summary["files_expected"] = len(urls)
    # In the file rather than read from its modification time, which a git
    # checkout of the data branch resets.
    summary["fetched_at"] = datetime.now(UTC).isoformat(timespec="seconds")
    return summary


def cache_path(day):
    """A folder per year, so each stays under the 1,000 files GitHub lists in
    one: var/data/gdelt/2024/2024-03-01.json."""
    return settings.GDELT_CACHE_DIR / str(day.year) / f"{day.isoformat()}.json"


def load_day(day):
    """The cached summary for one day, or None if it has not been fetched."""
    path = cache_path(day)
    if not path.exists():
        return None
    return json.loads(path.read_text())


def fetch_day(day, refresh=False):
    """Build and cache one day's summary, unless it is already cached.

    Only finished days are cached; today is still being published.
    """
    if day >= datetime.now(UTC).date():
        raise ValueError(f"{day} is not over yet")
    if not refresh and (cached := load_day(day)) is not None:
        return cached
    summary = build_day(day)
    path = cache_path(day)
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(summary))
    return summary


def cached_days():
    directory = settings.GDELT_CACHE_DIR
    if not directory.exists():
        return []
    return sorted(date.fromisoformat(path.stem) for path in directory.glob("*/*.json"))


def last_fetched(days):
    """When any of these days was last fetched, or None if none of them says.
    Days fetched before 2026-10-22 don't."""
    fetch_times = []
    for day in days:
        summary = load_day(day)
        if summary and "fetched_at" in summary:
            fetch_times.append(datetime.fromisoformat(summary["fetched_at"]))
    return max(fetch_times, default=None)
