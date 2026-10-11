from datetime import date

import pytest

from frontpagejews import gdelt


def gkg_line(domain, url, locations, collection="1"):
    columns = [""] * 27
    columns[gdelt.GkgColumn.SOURCE_COLLECTION] = collection
    columns[gdelt.GkgColumn.SOURCE_DOMAIN] = domain
    columns[gdelt.GkgColumn.DOCUMENT_URL] = url
    columns[gdelt.GkgColumn.V2_LOCATIONS] = locations
    return "\t".join(columns)


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

    def test_maps_gaza_and_the_west_bank_to_palestine():
        assert gdelt.parse_locations(f"{GAZA};{WEST_BANK}") == {"PSE"}

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

    def test_counts_an_article_about_gaza_and_the_west_bank_once_for_palestine():
        raw_file = gkg_line("bbc.co.uk", "https://bbc.co.uk/1", f"{GAZA};{WEST_BANK}")

        assert gdelt.summarize([raw_file])["domains"]["bbc.co.uk"]["countries"] == {"PSE": 1}

    def test_counts_a_recrawled_url_once():
        """GDELT can see the same page in two 15-minute files"""
        line = gkg_line("bbc.co.uk", "https://bbc.co.uk/1", TEL_AVIV)

        summary = gdelt.summarize([line, line])

        assert summary["domains"]["bbc.co.uk"] == {"articles": 1, "countries": {"ISR": 1}}

    def test_skips_non_web_sources():
        raw_file = gkg_line("bbc.co.uk", "https://bbc.co.uk/1", TEL_AVIV, collection="2")

        assert gdelt.summarize([raw_file])["domains"] == {}


def describe_fetch_day():
    """Tests for building and caching one day"""

    @pytest.fixture(autouse=True)
    def _cache_dir(settings, tmp_path):
        settings.GDELT_CACHE_DIR = tmp_path

    def test_caches_the_summary_and_reuses_it(mocker):
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

    def test_tolerates_missing_files(mocker):
        mocker.patch.object(gdelt, "fetch_gkg", return_value=None)

        summary = gdelt.fetch_day(date(2026, 9, 22))

        assert summary["files"] == 0
        assert summary["domains"] == {}

    def test_refuses_a_day_that_is_not_over():
        with pytest.raises(ValueError, match="not over"):
            gdelt.fetch_day(date(2999, 1, 1))
