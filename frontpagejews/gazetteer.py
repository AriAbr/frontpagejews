"""Looks up the country a place is in, for NYT tags that don't name one.

- Wikidata ranks well-known places first, so we search there first. E.g.
  GeoNames' first result for "Ontario" is a town in California, but Wikidata
  gives the Canadian province.
- If Wikidata returns an exact match (tag = place name, or one of its
  aliases), then follow Wikidata's GeoNames ID, which links the place to a
  country.
- If Wikidata has no exact match, or the exact match has no coordinates and
  no GeoNames ID (treating this as "not a specific place", like the entry for
  "Air Base"), return `None` as the country.
- If Wikidata returns an exact match with no GeoNames ID, or one GeoNames has
  since removed, search GeoNames for the name. Wikidata has confirmed the
  place exists, so the search only has to find it ("Kashmir" gives Jammu and
  Kashmir).
- Water is in no country. GeoNames chooses an arbitrary nearby country (the
  South China Sea is Thailand's), so it isn't used. Water inside one country
  is usually tagged with it ("Great Salt Lake (Utah)"), and settled before
  GeoNames is asked.

Each name is looked up once a run and not kept after, so a day's counts use
GeoNames' answers from when the day was fetched. GeoNames keeps no history, so
older days can't use the answers from when they were published.
"""

import logging
import time

import requests
from django.conf import settings

from frontpagejews.countries import ISO2_TO_ISO3
from frontpagejews.pacing import Pacer

WIKIDATA_URL = "https://www.wikidata.org/w/api.php"
GEONAMES_URL = "https://secure.geonames.org/"
# Wikidata asks for a user agent that says who's calling.
HEADERS = {"User-Agent": "frontpagejews (https://github.com/AriAbr/frontpagejews)"}
# Wikidata asks for one call at a time, not too fast.
SECONDS_BETWEEN_CALLS = 1
# Seconds to wait before each new try at a call that failed.
RETRY_WAITS = [5, 30, 120]
# How many of Wikidata's search results to look through for an exact match.
SEARCH_RESULTS = 10
# The Wikidata properties read: an entry's coordinates, and its GeoNames ID.
COORDINATES = "P625"
GEONAMES_ID = "P1566"
# GeoNames' feature class for water.
WATER = "H"

logger = logging.getLogger(__name__)

# Shared by every Gazetteer, as the APIs' limits are.
_pacer = Pacer(SECONDS_BETWEEN_CALLS)


class Gazetteer:
    """Looks up the country a place is in, with a cache to prevent repeated fetching."""

    def __init__(self):
        # By name in lowercase.
        self._countries_by_place_name = {}

    def fetch_place_country(self, name):
        """The ISO3 code of the country GeoNames puts a place name in, or None."""
        key = name.strip().lower()
        if key not in self._countries_by_place_name:
            country = self._look_up(name.strip())
            self._countries_by_place_name[key] = country
        return self._countries_by_place_name[key]

    def _look_up(self, name):
        """The ISO3 code of the country a place is in, or None."""
        wikidata_id = self._fetch_wikidata_id(name)
        if wikidata_id is None:
            return None
        wikidata_properties = self._fetch_wikidata_properties(wikidata_id)
        geonames_id = self._geonames_id(wikidata_properties)
        # Wikidata may still record a GeoNames place that GeoNames has since removed.
        geonames_place = self._fetch_geonames_by_id(geonames_id) if geonames_id else None
        has_coordinates = bool(wikidata_properties.get(COORDINATES))
        if geonames_place is None and has_coordinates:
            geonames_place = self._fetch_geonames_by_name(name)
        return self._country_of(geonames_place) if geonames_place else None

    def _fetch_wikidata_id(self, name):
        """The ID of the Wikidata entry with exactly this name, or None."""
        search_results = self._call(
            WIKIDATA_URL,
            {
                "action": "wbsearchentities",
                "search": name,
                "language": "en",
                "type": "item",
                "limit": SEARCH_RESULTS,
                "format": "json",
            },
        ).get("search", [])
        # "match" is the label or alias the search matched.
        exact_matches = [
            result
            for result in search_results
            if result.get("match", {}).get("text", "").lower() == name.lower()
        ]
        if not exact_matches:
            return None
        # Only the first exact match: when it has no GeoNames place, a later one
        # with the name as an alias is usually another place ("Kashmir" is also
        # an alias of Kashmar, in Iran).
        return exact_matches[0]["id"]

    def _fetch_wikidata_properties(self, wikidata_id):
        """A Wikidata entry's properties, by ID: {"P625": [its coordinates], ...}.
        The search doesn't return them. Wikidata calls them claims."""
        return self._call(
            WIKIDATA_URL,
            {
                "action": "wbgetclaims",
                "entity": wikidata_id,
                "format": "json",
            },
        ).get("claims", {})

    def _geonames_id(self, wikidata_properties):
        """The GeoNames ID a Wikidata entry records, or None."""
        statements = wikidata_properties.get(GEONAMES_ID, [])
        if not statements:
            return None
        # A statement whose value is unknown has no "datavalue".
        value = statements[0]["mainsnak"].get("datavalue", {}).get("value")
        return int(value) if value else None

    def _fetch_geonames_by_id(self, geonames_id):
        """GeoNames' place with this ID, or None if GeoNames has removed it."""
        return self._call(
            f"{GEONAMES_URL}getJSON",
            {
                "geonameId": geonames_id,
                "username": settings.GEONAMES_USERNAME,
            },
        )

    def _fetch_geonames_by_name(self, name):
        """GeoNames' top place for a name, or None."""
        places = self._call(
            f"{GEONAMES_URL}searchJSON",
            {
                "q": name,
                "isNameRequired": "true",
                "maxRows": 1,
                "username": settings.GEONAMES_USERNAME,
            },
        ).get("geonames", [])
        return places[0] if places else None

    def _country_of(self, place):
        """The ISO3 code of the country a GeoNames place is in, or None for water
        or a place in no country."""
        feature_class = place.get("fcl")
        country_code = place.get("countryCode")
        if feature_class == WATER or not country_code:
            return None
        return ISO2_TO_ISO3.get(country_code)

    def _call(self, url, params):
        """The JSON a Wikidata or GeoNames API returns, trying again if it fails,
        or None if there's nothing at that URL (a GeoNames place since removed)."""
        for wait in [*RETRY_WAITS, None]:
            _pacer.wait()
            try:
                response = requests.get(url, params=params, headers=HEADERS, timeout=60)
                if response.status_code == 404:
                    return None
                response.raise_for_status()
                return response.json()
            except requests.RequestException as error:
                if wait is None:
                    raise
                logger.warning("%s failed (%s); trying again in %ss", url, error, wait)
                time.sleep(wait)
