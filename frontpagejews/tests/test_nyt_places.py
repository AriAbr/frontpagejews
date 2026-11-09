import pytest

from frontpagejews.gazetteer import Gazetteer
from frontpagejews.nyt_places import place_country


@pytest.fixture
def gazetteer():
    return Gazetteer()


def describe_place_country():
    """Tests for finding the country an NYT place tag lies in"""

    def test_finds_a_country_by_name(gazetteer):
        assert place_country("Iran", gazetteer) == "IRN"

    def test_finds_a_country_by_the_nyts_name_for_it(gazetteer):
        assert place_country("Great Britain", gazetteer) == "GBR"

    def test_ignores_capitals(gazetteer):
        """Older tags are sometimes in capitals"""
        assert place_country("AFGHANISTAN", gazetteer) == "AFG"
        assert place_country("AMSTERDAM (NETHERLANDS)", gazetteer) == "NLD"

    def test_finds_a_place_by_the_country_in_its_parentheses(gazetteer):
        assert place_country("Kyiv (Ukraine)", gazetteer) == "UKR"

    def test_finds_a_us_place_by_its_states_abbreviation(gazetteer):
        assert place_country("Las Vegas (Nev)", gazetteer) == "USA"
        assert place_country("West Village (Manhattan, NY)", gazetteer) == "USA"

    def test_finds_new_york_city_without_a_lookup(gazetteer):
        assert place_country("New York City", gazetteer) == "USA"

    def test_finds_a_place_across_two_states(gazetteer):
        assert place_country("Lake Powell (Utah-Ariz)", gazetteer) == "USA"

    def test_matches_names_whole(gazetteer):
        """Not Mexico, and not Lebanon"""
        assert place_country("New Mexico", gazetteer) == "USA"
        assert place_country("Lebanon (NH)", gazetteer) == "USA"

    def test_looks_up_a_tag_that_names_no_country(mocker, gazetteer):
        place_country_by_geonames = mocker.patch.object(
            gazetteer, "fetch_place_country", return_value="JPN"
        )

        assert place_country("Tokyo", gazetteer) == "JPN"
        place_country_by_geonames.assert_called_once_with("Tokyo")

    def test_looks_up_the_parts_of_its_parentheses_until_one_gives_a_country(mocker, gazetteer):
        """The last part may not be a place"""
        lookups = {"Gloucestershire, England, Air Base": None, "Air Base": None, "England": "GBR"}
        mocker.patch.object(gazetteer, "fetch_place_country", side_effect=lookups.get)

        assert (
            place_country("Royal Air Force Fairford (Gloucestershire, England, Air Base)", gazetteer)
            == "GBR"
        )

    def test_needs_no_lookup_for_a_place_its_parentheses_name_a_country_for(gazetteer):
        """The autouse fixture fails any lookup"""
        assert place_country("Imperial Marhaba Hotel (Sousse, Tunisia, Hotel)", gazetteer) == "TUN"
