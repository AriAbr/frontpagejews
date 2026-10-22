import io
import zipfile
from datetime import UTC, date, datetime, timedelta

import pytest
import requests
from django.core.management import call_command
from django.core.management.base import CommandError

from frontpagejews import gdelt
from frontpagejews.news_coverage import DAYS_SHOWN


def gkg_line(domain, url, locations, collection="1"):
    columns = [""] * 27
    columns[gdelt.GkgColumn.SOURCE_COLLECTION] = collection
    columns[gdelt.GkgColumn.SOURCE_DOMAIN] = domain
    columns[gdelt.GkgColumn.DOCUMENT_URL] = url
    columns[gdelt.GkgColumn.V2_LOCATIONS] = locations
    return "\t".join(columns)


def gdelt_response(mocker, status_code, contents=""):
    """A response to a GKG file's download: a zip of one CSV with these contents."""
    zip_buffer = io.BytesIO()
    with zipfile.ZipFile(zip_buffer, "w") as archive:
        archive.writestr("20150721110000.gkg.csv", contents)
    fake = mocker.Mock(status_code=status_code, content=zip_buffer.getvalue())
    if status_code >= 400:
        fake.raise_for_status.side_effect = requests.HTTPError(response=fake)
    return fake


TEL_AVIV = "4#Tel Aviv, Tel Aviv, Israel#IS#IS05##32.06#34.76#-781545#120"
GEORGIA_STATE = "2#Georgia, United States#US#USGA##32.98#-83.64#GA#108"
GAZA = "1#Gaza Strip#GZ#GZ##31.42#34.33#GZ#88"
WEST_BANK = "1#West Bank#WE#WE##32#35.25#WE#40"
INDIAN_OCEAN = "1#Indian Ocean#OC#OC##-10#70#OC#12"


def describe_parse_locations():
    """Tests for reading one article's V2Locations field"""

    def test_maps_each_location_to_its_country_by_iso3():
        """GDELT's FIPS `IS` is Israel, not Iceland as in ISO2"""
        assert gdelt.parse_locations(f"{TEL_AVIV};{GEORGIA_STATE}") == {"ISR", "USA"}

    def test_maps_gaza_and_the_west_bank_to_israel():
        """The dashboard shows the three as one unit"""
        assert gdelt.parse_locations(f"{GAZA};{WEST_BANK}") == {"ISR"}

    def test_drops_locations_that_are_not_countries():
        assert gdelt.parse_locations(INDIAN_OCEAN) == set()

    def test_returns_nothing_for_an_empty_field():
        assert gdelt.parse_locations("") == set()


def describe_summarize():
    """Tests for reducing GKG files to per-domain counts"""

    def test_counts_articles_and_country_mentions_per_domain():
        raw_file = "\n".join(
            [
                gkg_line("bbc.co.uk", "https://bbc.co.uk/1", TEL_AVIV),
                gkg_line("bbc.co.uk", "https://bbc.co.uk/2", GEORGIA_STATE),
                gkg_line("bbc.co.uk", "https://bbc.co.uk/3", ""),
            ]
        )

        summary = gdelt.summarize([raw_file])

        assert summary["domains"] == {"bbc.co.uk": {"articles": 3, "countries": {"ISR": 1, "USA": 1}}}

    def test_counts_an_article_once_however_many_places_it_mentions():
        raw_file = gkg_line("bbc.co.uk", "https://bbc.co.uk/1", f"{TEL_AVIV};{TEL_AVIV}")

        assert gdelt.summarize([raw_file])["domains"]["bbc.co.uk"]["countries"] == {"ISR": 1}

    def test_counts_an_article_about_israel_and_gaza_once():
        raw_file = gkg_line("bbc.co.uk", "https://bbc.co.uk/1", f"{TEL_AVIV};{GAZA};{WEST_BANK}")

        assert gdelt.summarize([raw_file])["domains"]["bbc.co.uk"]["countries"] == {"ISR": 1}

    def test_counts_a_recrawled_url_once():
        """GDELT can see the same page in two 15-minute files"""
        line = gkg_line("bbc.co.uk", "https://bbc.co.uk/1", TEL_AVIV)

        summary = gdelt.summarize([line, line])

        assert summary["domains"]["bbc.co.uk"] == {"articles": 1, "countries": {"ISR": 1}}

    def test_keeps_only_the_outlets_domains():
        raw_file = "\n".join(
            [
                gkg_line("bbc.co.uk", "https://bbc.co.uk/1", TEL_AVIV),
                gkg_line("example.com", "https://example.com/1", TEL_AVIV),
            ]
        )

        assert list(gdelt.summarize([raw_file])["domains"]) == ["bbc.co.uk"]

    def test_matches_abcs_old_address_by_its_url():
        """GDELT files abcnews.go.com under go.com, which other Disney sites share"""
        raw_file = "\n".join(
            [
                gkg_line("go.com", "https://abcnews.go.com/International/1", TEL_AVIV),
                gkg_line("go.com", "https://espn.go.com/1", GEORGIA_STATE),
            ]
        )

        assert gdelt.summarize([raw_file])["domains"] == {
            "abcnews.go.com": {"articles": 1, "countries": {"ISR": 1}}
        }

    def test_skips_non_web_sources():
        raw_file = gkg_line("bbc.co.uk", "https://bbc.co.uk/1", TEL_AVIV, collection="2")

        assert gdelt.summarize([raw_file])["domains"] == {}


def describe_fetch_gkg():
    """Tests for downloading one GKG file"""

    URL = "https://data.gdeltproject.org/gdeltv2/20150721110000.gkg.csv.zip"

    @pytest.fixture
    def sleep(mocker):
        return mocker.patch.object(gdelt.time, "sleep")

    def test_tries_again_after_a_dropped_connection(mocker, sleep):
        """As when DNS failed for a moment on 2026-10-21, ending a night's backfill"""
        mocker.patch.object(
            gdelt.requests,
            "get",
            side_effect=[
                requests.ConnectionError("Failed to resolve"),
                gdelt_response(mocker, 200, "a row"),
            ],
        )

        assert gdelt.fetch_gkg(URL) == "a row"
        sleep.assert_called_once_with(gdelt.RETRY_WAITS[0])

    def test_tries_again_after_a_connection_breaks_partway(mocker, sleep):
        """As on 2026-10-21, ending two of the backfill's runs"""
        mocker.patch.object(
            gdelt.requests,
            "get",
            side_effect=[
                requests.exceptions.ChunkedEncodingError(
                    "IncompleteRead(7372742 bytes read, 692548 more expected)"
                ),
                gdelt_response(mocker, 200, "a row"),
            ],
        )

        assert gdelt.fetch_gkg(URL) == "a row"

    def test_tries_again_after_an_error_on_gdelts_side(mocker, sleep):
        mocker.patch.object(
            gdelt.requests,
            "get",
            side_effect=[gdelt_response(mocker, 503), gdelt_response(mocker, 200, "a row")],
        )

        assert gdelt.fetch_gkg(URL) == "a row"

    def test_gives_up_after_the_last_wait(mocker, sleep):
        get = mocker.patch.object(gdelt.requests, "get", side_effect=requests.ConnectionError)

        with pytest.raises(requests.ConnectionError):
            gdelt.fetch_gkg(URL)

        assert [call.args[0] for call in sleep.call_args_list] == gdelt.RETRY_WAITS
        assert get.call_count == len(gdelt.RETRY_WAITS) + 1

    def test_does_not_try_again_for_a_file_gdelt_never_published(mocker, sleep):
        get = mocker.patch.object(gdelt.requests, "get", return_value=gdelt_response(mocker, 404))

        assert gdelt.fetch_gkg(URL) is None
        assert get.call_count == 1
        sleep.assert_not_called()


def describe_fetch_day():
    """Tests for building and caching one day"""

    @pytest.fixture(autouse=True)
    def _cache_dir(settings, tmp_path):
        settings.GDELT_CACHE_DIR = tmp_path

    def test_caches_the_summary_and_reuses_it(mocker, settings):
        fetch = mocker.patch.object(
            gdelt, "fetch_gkg", return_value=gkg_line("bbc.co.uk", "https://bbc.co.uk/1", TEL_AVIV)
        )
        day = date(2026, 9, 22)

        first = gdelt.fetch_day(day)
        second = gdelt.fetch_day(day)

        assert first == second
        assert fetch.call_count == gdelt.RAW_GDELT_FILES_PER_DAY
        assert first["files"] == gdelt.RAW_GDELT_FILES_PER_DAY
        assert gdelt.cached_days() == [day]
        assert (
            gdelt.cache_path(day).relative_to(settings.GDELT_CACHE_DIR).as_posix()
            == "2026/2026-09-22.json"
        )

    def test_tolerates_missing_files(mocker):
        mocker.patch.object(gdelt, "fetch_gkg", return_value=None)

        summary = gdelt.fetch_day(date(2026, 9, 22))

        assert summary["files"] == 0
        assert summary["domains"] == {}

    def test_refuses_a_day_that_is_not_over():
        with pytest.raises(ValueError, match="not over"):
            gdelt.fetch_day(date(2999, 1, 1))


def describe_fetch_gdelt_command():
    """Tests for `manage.py fetch_gdelt`"""

    @pytest.fixture
    def fetched_days(mocker):
        """The days the command fetches, in order, without downloading anything."""
        days = []

        def fetch_day(day, refresh=False):
            days.append(day)
            return {"domains": {}, "files": 0, "files_expected": 0}

        mocker.patch.object(gdelt, "load_day", return_value=None)
        mocker.patch.object(gdelt, "fetch_day", side_effect=fetch_day)
        return days

    def fetch(*args):
        call_command("fetch_gdelt", *args, stdout=io.StringIO())

    def test_fetches_the_days_from_start_to_end(fetched_days):
        fetch("--start", "2024-02-28", "--end", "2024-03-01")

        assert fetched_days == [date(2024, 2, 28), date(2024, 2, 29), date(2024, 3, 1)]

    def test_counts_days_back_from_end(fetched_days):
        fetch("--days", "2", "--end", "2024-03-01")

        assert fetched_days == [date(2024, 2, 29), date(2024, 3, 1)]

    def test_defaults_to_the_days_the_site_shows_up_to_yesterday(fetched_days):
        fetch()

        yesterday = datetime.now(UTC).date() - timedelta(days=1)
        assert len(fetched_days) == DAYS_SHOWN
        assert fetched_days[-1] == yesterday

    def test_refuses_an_end_that_is_not_over():
        today = datetime.now(UTC).date()

        with pytest.raises(CommandError, match="not over"):
            fetch("--end", today.isoformat())

    def test_refuses_a_start_after_the_end():
        with pytest.raises(CommandError, match="after"):
            fetch("--start", "2024-03-02", "--end", "2024-03-01")
