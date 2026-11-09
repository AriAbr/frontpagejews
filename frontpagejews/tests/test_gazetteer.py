from frontpagejews.gazetteer import FORMER_COUNTRY, WATER, Gazetteer


def wikidata_properties(geonames_id=None, has_coordinates=True):
    """A Wikidata entry's properties as Wikidata's API returns them."""
    entry_properties = {}
    if has_coordinates:
        entry_properties["P625"] = [{"mainsnak": {"datavalue": {"value": {"latitude": 0}}}}]
    if geonames_id:
        entry_properties["P1566"] = [{"mainsnak": {"datavalue": {"value": str(geonames_id)}}}]
    return entry_properties


def geonames_place(name, country_code, feature_class="P", feature_code="X"):
    """A place as GeoNames' API returns it."""
    return {
        "geonameId": 1,
        "name": name,
        "countryCode": country_code,
        "fcl": feature_class,
        "fcode": feature_code,
    }


def mock_wikidata_entry(mocker, entry_properties):
    """Have Wikidata find an entry with these properties."""
    fetch_wikidata_id = mocker.patch.object(Gazetteer, "_fetch_wikidata_id", return_value="Q1")
    mocker.patch.object(Gazetteer, "_fetch_wikidata_properties", return_value=entry_properties)
    return fetch_wikidata_id


def describe_fetch_place_country():
    """Tests for the country GeoNames puts a place name in"""

    def test_uses_the_geonames_id_wikidata_records(mocker):
        mock_wikidata_entry(mocker, wikidata_properties(geonames_id=6269131))
        fetch_geonames_by_id = mocker.patch.object(
            Gazetteer, "_fetch_geonames_by_id", return_value=geonames_place("England", "GB", "A")
        )

        assert Gazetteer().fetch_place_country("England") == "GBR"
        fetch_geonames_by_id.assert_called_once_with(6269131)

    def test_searches_geonames_where_wikidata_records_no_geonames_place(mocker):
        mock_wikidata_entry(mocker, wikidata_properties())
        fetch_geonames_by_name = mocker.patch.object(
            Gazetteer,
            "_fetch_geonames_by_name",
            return_value=geonames_place("Jammu and Kashmir", "IN", "A"),
        )

        assert Gazetteer().fetch_place_country("Kashmir") == "IND"
        fetch_geonames_by_name.assert_called_once_with("Kashmir")

    def test_searches_geonames_where_geonames_has_removed_the_recorded_place(mocker):
        mock_wikidata_entry(mocker, wikidata_properties(geonames_id=235620))
        mocker.patch.object(Gazetteer, "_fetch_geonames_by_id", return_value=None)
        mocker.patch.object(
            Gazetteer, "_fetch_geonames_by_name", return_value=geonames_place("Somewhere", "FR", "L")
        )

        assert Gazetteer().fetch_place_country("Somewhere") == "FRA"

    def test_returns_None_when_wikidata_has_no_exact_match(mocker):
        """GeoNames' search would only be guessing"""
        mocker.patch.object(Gazetteer, "_fetch_wikidata_id", return_value=None)
        fetch_geonames_by_name = mocker.patch.object(Gazetteer, "_fetch_geonames_by_name")

        assert Gazetteer().fetch_place_country("Caribbean Area") is None
        fetch_geonames_by_name.assert_not_called()

    def test_returns_None_when_the_wikidata_match_isnt_a_place(mocker):
        """ "East Asia", the region: it has no coordinates"""
        mock_wikidata_entry(mocker, wikidata_properties(has_coordinates=False))
        fetch_geonames_by_name = mocker.patch.object(Gazetteer, "_fetch_geonames_by_name")

        assert Gazetteer().fetch_place_country("East Asia") is None
        fetch_geonames_by_name.assert_not_called()

    def test_returns_None_for_water(mocker):
        """GeoNames files a sea under one of its shores"""
        mock_wikidata_entry(mocker, wikidata_properties(geonames_id=1821073))
        mocker.patch.object(
            Gazetteer,
            "_fetch_geonames_by_id",
            return_value=geonames_place("South China Sea", "TH", WATER),
        )

        assert Gazetteer().fetch_place_country("South China Sea") is None

    def test_returns_None_for_a_former_country(mocker):
        """GeoNames files East Germany under Germany"""
        mock_wikidata_entry(mocker, wikidata_properties(geonames_id=2921044))
        mocker.patch.object(
            Gazetteer,
            "_fetch_geonames_by_id",
            return_value=geonames_place("East Germany", "DE", "A", FORMER_COUNTRY),
        )

        assert Gazetteer().fetch_place_country("East Germany") is None

    def test_looks_up_each_name_once_a_run(mocker):
        fetch_wikidata_id = mock_wikidata_entry(mocker, wikidata_properties(geonames_id=6269131))
        mocker.patch.object(
            Gazetteer, "_fetch_geonames_by_id", return_value=geonames_place("England", "GB", "A")
        )
        one_run = Gazetteer()
        one_run.fetch_place_country("England")

        assert one_run.fetch_place_country("ENGLAND") == "GBR"
        assert fetch_wikidata_id.call_count == 1

    def test_looks_up_names_again_in_a_new_run(mocker):
        fetch_wikidata_id = mock_wikidata_entry(mocker, wikidata_properties(geonames_id=6269131))
        mocker.patch.object(
            Gazetteer, "_fetch_geonames_by_id", return_value=geonames_place("England", "GB", "A")
        )
        Gazetteer().fetch_place_country("England")
        Gazetteer().fetch_place_country("England")

        assert fetch_wikidata_id.call_count == 2


def describe_fetch_wikidata_id():
    """Tests for finding which Wikidata entry a name means"""

    def test_takes_only_the_first_exact_match(mocker):
        """Not Kashmar, which has "Kashmir" as an alias"""
        wikidata_response = {
            "search": [
                {"id": "Q1", "match": {"text": "Kashmir valley"}},
                {"id": "Q43100", "match": {"text": "Kashmir"}},
                {"id": "Q2", "match": {"text": "Kashmir"}},
            ]
        }
        mocker.patch.object(Gazetteer, "_call", return_value=wikidata_response)

        assert Gazetteer()._fetch_wikidata_id("Kashmir") == "Q43100"

    def test_returns_None_without_an_exact_match(mocker):
        mocker.patch.object(
            Gazetteer, "_call", return_value={"search": [{"id": "Q1", "match": {"text": "Kashmar"}}]}
        )

        assert Gazetteer()._fetch_wikidata_id("Kashmir") is None


def describe_geonames_id():
    """Tests for reading the GeoNames ID a Wikidata entry records"""

    def test_reads_the_id():
        assert Gazetteer()._geonames_id(wikidata_properties(geonames_id=6269131)) == 6269131

    def test_returns_None_when_the_first_id_is_recorded_as_unknown():
        entry_properties = {
            "P1566": [{"mainsnak": {}}, {"mainsnak": {"datavalue": {"value": "6269131"}}}]
        }

        assert Gazetteer()._geonames_id(entry_properties) is None

    def test_returns_None_without_an_id():
        assert Gazetteer()._geonames_id(wikidata_properties()) is None
