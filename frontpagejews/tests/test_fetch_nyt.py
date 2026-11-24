import io
from datetime import date

import pytest
from django.core.management import call_command
from django.core.management.base import CommandError

from frontpagejews import nyt
from frontpagejews.gazetteer import Gazetteer


def describe_fetch_nyt_command():
    """Tests for `manage.py fetch_nyt`"""

    def test_needs_an_api_key(settings):
        settings.NYT_API_KEY = ""

        with pytest.raises(CommandError, match="NYT_API_KEY"):
            call_command("fetch_nyt", stdout=io.StringIO())

    def test_needs_a_geonames_username(settings):
        settings.NYT_API_KEY = "key"
        settings.GEONAMES_USERNAME = ""

        with pytest.raises(CommandError, match="GEONAMES_USERNAME"):
            call_command("fetch_nyt", stdout=io.StringIO())

    def test_fetches_only_days_not_cached(mocker, settings):
        settings.NYT_API_KEY = "key"
        settings.GEONAMES_USERNAME = "user"
        mocker.patch.object(nyt, "load_day", side_effect=lambda day: {} if day.day < 3 else None)
        fetch_days = mocker.patch.object(nyt, "fetch_days", return_value=[])

        out = io.StringIO()
        call_command("fetch_nyt", "--start", "2026-10-01", "--end", "2026-10-04", stdout=out)

        assert fetch_days.call_args.args[0] == [date(2026, 10, 3), date(2026, 10, 4)]
        assert "2 days already cached" in out.getvalue()

    def test_tries_an_incomplete_day_again(mocker, settings):
        settings.NYT_API_KEY = "key"
        settings.GEONAMES_USERNAME = "user"
        nyt.save_day(date(2026, 10, 1), [], "search", Gazetteer(), complete=False)
        fetch_days = mocker.patch.object(nyt, "fetch_days", return_value=[])

        out = io.StringIO()
        call_command("fetch_nyt", "--start", "2026-10-01", "--end", "2026-10-01", stdout=out)

        assert fetch_days.call_args.args[0] == [date(2026, 10, 1)]
        assert "waiting for the archive: 2026-10-01" in out.getvalue()
