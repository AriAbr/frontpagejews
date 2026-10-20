import io
import zipfile

import pytest

from frontpagejews import ucdp

GED_URL = "https://ucdp.uu.se/downloads/ged/ged261-csv.zip"
NEWEST_URL = "https://ucdp.uu.se/downloads/candidateged/GEDEvent_v26_0_8.csv"
OLDER_URL = "https://ucdp.uu.se/downloads/candidateged/GEDEvent_v26_01_26_07.csv"

DOWNLOAD_CENTER = f"""
<a href="{GED_URL}">CSV</a> <a href="https://ucdp.uu.se/downloads/ged/ged261-xlsx.zip">Excel</a>
<a href="{NEWEST_URL}">CSV</a> <a href="https://ucdp.uu.se/downloads/candidateged/GEDevent_v26_0_8.xlsx">Excel</a>
<a href="{OLDER_URL}">CSV</a>
"""

# Countries by UCDP's (Gleditsch-Ward) numbers.
ISRAEL = "666"
UKRAINE = "369"
# Holds the filler events, so no test checks it.
SWEDEN = "380"


def events_csv(events):
    """A UCDP file's CSV, from (id, date_start, country_id, best) tuples. Real
    files have a time after the date too, which is never read."""
    lines = ["id,date_start,country_id,best"]
    lines += [",".join(map(str, event)) for event in events]
    return "\n".join(lines)


def zipped(csv_text):
    buffer = io.BytesIO()
    with zipfile.ZipFile(buffer, "w") as archive:
        archive.writestr("GEDEvent_v26_1.csv", csv_text)
    return buffer.getvalue()


def filler_events(skip_month=None):
    """A death in Sweden each month from `FIRST_MONTH` to August 2026, so no
    month is empty and fetch_deaths doesn't refuse them."""
    months = ucdp.months_between(ucdp.FIRST_MONTH, "2026-08")
    return [(f"ID-{month}", f"{month}-15", SWEDEN, 1) for month in months if month != skip_month]


@pytest.fixture
def mock_ucdp_files(mocker):
    """Serve the download center, and each file with the given events (none if
    not given)."""

    def serve(ged=(), newest=(), older=()):
        pages = {
            ucdp.DOWNLOAD_CENTER: DOWNLOAD_CENTER.encode(),
            GED_URL: zipped(events_csv(ged)),
            NEWEST_URL: events_csv(newest).encode(),
            OLDER_URL: events_csv(older).encode(),
        }

        def get(url, timeout):
            response = mocker.Mock()
            response.content = pages[url]
            response.text = pages[url].decode() if url == ucdp.DOWNLOAD_CENTER else None
            return response

        mocker.patch.object(ucdp.requests, "get", side_effect=get)

    return serve


def describe_file_urls():
    """Tests for finding UCDP's files on its download center"""

    def test_lists_the_ged_zip_and_candidate_csvs_in_page_order(mock_ucdp_files):
        """The Excel copies are skipped"""
        mock_ucdp_files()

        assert ucdp.file_urls() == [GED_URL, NEWEST_URL, OLDER_URL]


def describe_months_between():
    def test_counts_across_a_new_year():
        assert ucdp.months_between("2025-11", "2026-02") == ["2025-11", "2025-12", "2026-01", "2026-02"]


def describe_fetch_deaths():
    """Tests for summing UCDP's events into deaths per country per month"""

    def test_sums_deaths_per_country_per_month(mock_ucdp_files):
        mock_ucdp_files(
            newest=[
                *filler_events(),
                ("ID-1", "2026-03-01", ISRAEL, 2),
                ("ID-2", "2026-03-31", ISRAEL, 3),
                ("ID-3", "2026-05-01", ISRAEL, 4),
                ("ID-4", "2026-05-01", UKRAINE, 9),
            ]
        )

        deaths = ucdp.fetch_deaths()

        assert deaths["2026-03"]["ISR"] == 5
        assert deaths["2026-05"]["ISR"] == 4
        assert deaths["2026-05"]["UKR"] == 9

    def test_leaves_a_country_out_of_months_it_had_no_deaths_in(mock_ucdp_files):
        mock_ucdp_files(newest=[*filler_events(), ("ID-1", "2026-03-01", ISRAEL, 2)])

        assert "ISR" not in ucdp.fetch_deaths()["2026-04"]

    def test_reads_the_ged_zip_and_the_candidate_csvs(mock_ucdp_files):
        mock_ucdp_files(
            ged=[("ID-1", "2025-10-01", ISRAEL, 1)],
            newest=[*filler_events(), ("ID-2", "2026-08-01", ISRAEL, 10)],
            older=[("ID-3", "2026-03-01", ISRAEL, 100)],
        )

        deaths = ucdp.fetch_deaths()

        assert deaths["2025-10"]["ISR"] == 1
        assert deaths["2026-03"]["ISR"] == 100
        assert deaths["2026-08"]["ISR"] == 10

    def test_gives_every_month_from_the_first_to_the_newest(mock_ucdp_files):
        """December 2013 is before the first month, so it's left out"""
        mock_ucdp_files(ged=[("ID-1", "2013-12-31", ISRAEL, 100)], newest=filler_events())

        months = list(ucdp.fetch_deaths())

        assert months == ucdp.months_between("2014-01", "2026-08")

    def test_counts_a_revised_event_once_from_the_newest_file(mock_ucdp_files):
        mock_ucdp_files(
            newest=[*filler_events(), ("ID-1", "2026-03-02", ISRAEL, 2236)],
            older=[("ID-1", "2026-03-02", ISRAEL, 2283)],
        )

        assert ucdp.fetch_deaths()["2026-03"]["ISR"] == 2236

    def test_refuses_a_month_missing(mock_ucdp_files):
        """Without this, a missing file would quietly shrink everyone's deaths"""
        mock_ucdp_files(newest=filler_events(skip_month="2019-07"))

        with pytest.raises(ValueError, match="2019-07"):
            ucdp.fetch_deaths()

    def test_refuses_a_country_it_has_no_iso_code_for(mock_ucdp_files):
        """Rather than silently dropping its deaths"""
        mock_ucdp_files(newest=[*filler_events(), ("ID-1", "2026-05-01", "9999", 1)])

        with pytest.raises(ValueError, match="9999"):
            ucdp.fetch_deaths()
