"""Finds the country an NYT place tag lies in.

The NYT tags articles with places in a fixed style: a country on its own
("Iran"), or a place followed by where it is, in parentheses ("Kyiv
(Ukraine)", "Las Vegas (Nev)", "West Village (Manhattan, NY)"). A tag is
matched in these steps, the first that gives a country winning:
1. The tag is a country's name, as `countries.py` or the NYT writes it.
2. Its parentheses name a country or a US state: as one name, then part by part
   from the right ("West Village (Manhattan, NY)" -> "NY").
3. Otherwise GeoNames says, for the tag ("England", "Golan Heights") or its
   parentheses as one name ("Toronto (Ontario)" -> "Ontario"); see `gazetteer.py`.
Steps 1 and 2, the tag's own words, settle about 90% of tags, so the NYT's
labels stand as written when it published them. Step 3 settles the rest by
GeoNames' calls, not ours, the way GDELT's geocoder settles the other
outlets'. Only names whose meaning can't be argued are written here.

Names are matched whole, never searched for inside a tag: "New Mexico" is not
Mexico, and "Lebanon (NH)" is in New Hampshire.
"""

from frontpagejews.countries import ISO3_TO_COUNTRY_NAME

# The NYT's names for countries, where they differ from the name in
# `countries.py`.
NYT_COUNTRY_CODES = {
    "Bahama Islands": "BHS",
    "Cape Verde": "CPV",
    "Congo, Democratic Republic of": "COD",
    "Congo, Democratic Republic of (Congo-Kinshasa)": "COD",
    "Democratic Republic of Congo": "COD",
    "Congo, Republic of (Congo-Brazzaville)": "COG",
    "Curacao": "CUW",
    "Czech Republic": "CZE",
    "East Timor": "TLS",
    "Falkland Islands": "FLK",
    "Gaza Strip": "XGZ",
    "Georgia (Georgian Republic)": "GEO",
    "Georgian Republic": "GEO",
    "Great Britain": "GBR",
    "Ivory Coast": "CIV",
    "Jamaica (West Indies)": "JAM",
    "Mex": "MEX",
    "Macau": "MAC",
    "Macedonia": "MKD",
    "Republic of North Macedonia": "MKD",
    "Reunion Island": "REU",
    "San Marino, Republic of": "SMR",
    "Seychelles Islands": "SYC",
    "St Kitts": "KNA",
    "St. Kitts and Nevis": "KNA",
    "St Lucia": "LCA",
    "St Vincent and the Grenadines": "VCT",
    "Swaziland": "SWZ",
    "Turkey": "TUR",
}

# US states, by name and by the NYT's abbreviation.
US_STATES = {
    "Alabama": "Ala",
    "Alaska": "Alaska",
    "Arizona": "Ariz",
    "Arkansas": "Ark",
    "California": "Calif",
    "Colorado": "Colo",
    "Connecticut": "Conn",
    "Delaware": "Del",
    "Florida": "Fla",
    "Georgia": "Ga",
    "Hawaii": "Hawaii",
    "Idaho": "Idaho",
    "Illinois": "Ill",
    "Indiana": "Ind",
    "Iowa": "Iowa",
    "Kansas": "Kan",
    "Kentucky": "Ky",
    "Louisiana": "La",
    "Maine": "Me",
    "Maryland": "Md",
    "Massachusetts": "Mass",
    "Michigan": "Mich",
    "Minnesota": "Minn",
    "Mississippi": "Miss",
    "Missouri": "Mo",
    "Montana": "Mont",
    "Nebraska": "Neb",
    "Nevada": "Nev",
    "New Hampshire": "NH",
    "New Jersey": "NJ",
    "New Mexico": "NM",
    "New York State": "NY",
    "North Carolina": "NC",
    "North Dakota": "ND",
    "Ohio": "Ohio",
    "Oklahoma": "Okla",
    "Oregon": "Ore",
    "Pennsylvania": "Pa",
    "Rhode Island": "RI",
    "South Carolina": "SC",
    "South Dakota": "SD",
    "Tennessee": "Tenn",
    "Texas": "Tex",
    "Utah": "Utah",
    "Vermont": "Vt",
    "Virginia": "Va",
    "Washington (State)": "Wash",
    "West Virginia": "W Va",
    "Wisconsin": "Wis",
    "Wyoming": "Wyo",
}
# The NYT's other names for the US and places in it, alone ("New York City") or
# in parentheses ("Southern States (US)", "Harlem (NYC)").
US_OTHER_NAMES = ["US", "DC", "New York City", "NYC", "NYS", "NYS Area"]

# The names a whole tag, or a part of its parentheses, can be matched against,
# each with its country's code. Keyed in lowercase, as older tags are
# sometimes in capitals ("AFGHANISTAN").
COUNTRIES_BY_NYT_TAG = {
    name.lower(): code
    for name, code in [
        *[(name, code) for code, name in ISO3_TO_COUNTRY_NAME.items()],
        *NYT_COUNTRY_CODES.items(),
        *[(name, "USA") for name in [*US_STATES, *US_STATES.values(), *US_OTHER_NAMES]],
    ]
}


def country_named(name):
    """Steps 1 and 2 for one name: the country the name itself says, by being
    the country or a US state, rather than one GeoNames gives; or None.
    "Lake Powell (Utah-Ariz)" lies across two states of one country."""
    name = name.strip().lower()
    if name in COUNTRIES_BY_NYT_TAG:
        return COUNTRIES_BY_NYT_TAG[name]
    name_parts = name.split("-")
    name_part_countries = [COUNTRIES_BY_NYT_TAG.get(part.strip()) for part in name_parts]
    if len(name_parts) > 1 and all(country == name_part_countries[0] for country in name_part_countries):
        return name_part_countries[0]
    return None


def place_country(tag, gazetteer):
    """The ISO3 code of the country an NYT place tag lies in, or None for a
    place in no single country ("Europe", "Red Sea"). Step 3 asks this run's
    `Gazetteer`."""
    tag = tag.strip()
    if country_named(tag):
        return country_named(tag)
    if not (tag.endswith(")") and "(" in tag):
        return gazetteer.fetch_place_country(tag)
    # "Goma (Congo, Democratic Republic of)" -> "Congo, Democratic Republic of",
    # then "Democratic Republic of", "Congo".
    qualifier = tag[tag.rindex("(") + 1 : -1].strip()
    names = [qualifier, *(part.strip() for part in reversed(qualifier.split(",")) if part.strip())]
    for name in names:
        if country_named(name):
            return country_named(name)
    return gazetteer.fetch_place_country(qualifier)
