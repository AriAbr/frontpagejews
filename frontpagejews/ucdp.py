"""Deaths in organized violence, from the Uppsala Conflict Data Program (UCDP).

UCDP records each violent event with a date, a country and an estimate of the
deaths. Two kinds of release are used:

- GED (Georeferenced Event Dataset), checked and published once a year,
  covering every year up to the last one. A single zipped CSV.
- Candidate events, published monthly with about a month's lag, unchecked.
  Some files cover one month, some several.

Both are plain downloads, linked from the download center. (UCDP's API needs a
token; the files don't.)

All three of UCDP's types of violence count: between states or between a state
and a rebel group, between non-state groups, and against civilians. Crime and
homicide are not organized violence, so they are not in UCDP at all.
"""

import csv
import io
import re
import zipfile
from collections.abc import Iterator

import requests

DOWNLOAD_CENTER = "https://ucdp.uu.se/downloads/"

# Links on the download center to the files read here, in CSV only (each is
# also offered as Excel, R and Stata). The version digits change with each
# release: ged261-csv.zip, GEDEvent_v26_0_8.csv, GEDEvent_v26_01_26_06.csv.
GED_FILE_LINK = re.compile(re.escape(DOWNLOAD_CENTER) + r"ged/ged\d+-csv\.zip")
CANDIDATE_FILE_LINK = re.compile(re.escape(DOWNLOAD_CENTER) + r"candidateged/GEDEvent_v[\d_]+\.csv")

# The first month whose deaths are kept. GDELT's history starts in February
# 2015, and a period's deaths reach back 12 months before its start.
FIRST_MONTH = "2014-01"

# UCDP numbers countries by the Gleditsch-Ward list, a political science
# standard, not ISO. This covers every country UCDP has recorded an event in
# since 1989; an event elsewhere raises, so a missing code is noticed and added
# here rather than its deaths silently dropped.
GW_TO_ISO3 = {
    "2": "USA",
    "20": "CAN",
    "41": "HTI",
    "42": "DOM",
    "51": "JAM",
    "52": "TTO",
    "70": "MEX",
    "80": "BLZ",
    "90": "GTM",
    "91": "HND",
    "92": "SLV",
    "93": "NIC",
    "94": "CRI",
    "95": "PAN",
    "100": "COL",
    "101": "VEN",
    "110": "GUY",
    "130": "ECU",
    "135": "PER",
    "140": "BRA",
    "145": "BOL",
    "150": "PRY",
    "155": "CHL",
    "160": "ARG",
    "200": "GBR",
    "210": "NLD",
    "211": "BEL",
    "220": "FRA",
    "230": "ESP",
    "260": "DEU",
    "290": "POL",
    "305": "AUT",
    "325": "ITA",
    "338": "MLT",
    "339": "ALB",
    "343": "MKD",
    "344": "HRV",
    "345": "SRB",
    "346": "BIH",
    "352": "CYP",
    "359": "MDA",
    "360": "ROU",
    "365": "RUS",
    "369": "UKR",
    "371": "ARM",
    "372": "GEO",
    "373": "AZE",
    "380": "SWE",
    "404": "GNB",
    "420": "GMB",
    "432": "MLI",
    "433": "SEN",
    "434": "BEN",
    "435": "MRT",
    "436": "NER",
    "437": "CIV",
    "438": "GIN",
    "439": "BFA",
    "450": "LBR",
    "451": "SLE",
    "452": "GHA",
    "461": "TGO",
    "471": "CMR",
    "475": "NGA",
    "482": "CAF",
    "483": "TCD",
    "484": "COG",
    "490": "COD",
    "500": "UGA",
    "501": "KEN",
    "510": "TZA",
    "516": "BDI",
    "517": "RWA",
    "520": "SOM",
    "522": "DJI",
    "530": "ETH",
    "531": "ERI",
    "540": "AGO",
    "541": "MOZ",
    "551": "ZMB",
    "552": "ZWE",
    "560": "ZAF",
    "565": "NAM",
    "570": "LSO",
    "571": "BWA",
    "572": "SWZ",
    "580": "MDG",
    "581": "COM",
    "600": "MAR",
    "615": "DZA",
    "616": "TUN",
    "620": "LBY",
    "625": "SDN",
    "626": "SSD",
    "630": "IRN",
    "640": "TUR",
    "645": "IRQ",
    "651": "EGY",
    "652": "SYR",
    "660": "LBN",
    "663": "JOR",
    # UCDP files events in Gaza and the West Bank under Israel, which is how the
    # dashboard counts them anyway.
    "666": "ISR",
    "670": "SAU",
    "678": "YEM",
    "690": "KWT",
    "692": "BHR",
    "694": "QAT",
    "696": "ARE",
    "698": "OMN",
    "700": "AFG",
    "702": "TJK",
    "703": "KGZ",
    "704": "UZB",
    "710": "CHN",
    "750": "IND",
    "760": "BTN",
    "770": "PAK",
    "771": "BGD",
    "775": "MMR",
    "780": "LKA",
    "790": "NPL",
    "800": "THA",
    "811": "KHM",
    "812": "LAO",
    "820": "MYS",
    "840": "PHL",
    "850": "IDN",
    "900": "AUS",
    "910": "PNG",
    "940": "SLB",
}


def file_urls():
    """The GED zip and candidate CSVs the download center links to: GED first,
    then the candidate files in the page's order, newest first."""
    page = requests.get(DOWNLOAD_CENTER, timeout=60)
    page.raise_for_status()
    return GED_FILE_LINK.findall(page.text) + CANDIDATE_FILE_LINK.findall(page.text)


def read_events(url) -> Iterator[dict[str, str]]:
    """Each event row in one of UCDP's files, as a dict of its CSV columns."""
    response = requests.get(url, timeout=300)
    response.raise_for_status()
    if url.endswith(".zip"):
        with zipfile.ZipFile(io.BytesIO(response.content)) as archive:
            (csv_name,) = (name for name in archive.namelist() if name.endswith(".csv"))
            with archive.open(csv_name) as csv_file:
                yield from csv.DictReader(io.TextIOWrapper(csv_file, encoding="utf-8"))
    else:
        yield from csv.DictReader(io.StringIO(response.content.decode("utf-8")))


def months_between(start_month, end_month):
    """Every month from `start_month` to `end_month`, both included:
    months_between("2025-11", "2026-02") == ["2025-11", "2025-12", "2026-01", "2026-02"]."""
    year, month_number = map(int, start_month.split("-"))
    months = []
    month = start_month
    while month <= end_month:
        months.append(month)
        month_number += 1
        if month_number == 13:
            year, month_number = year + 1, 1
        zero_padded_month = f"{month_number:02}"  # 8 -> "08"
        month = f"{year}-{zero_padded_month}"
    return months


def fetch_deaths():
    """Map month ("YYYY-MM") -> ISO3 -> deaths that month, for every month from
    `FIRST_MONTH` to the newest UCDP has data for. A country with no deaths in a
    month is left out of it.

    An event revised in a later release appears in more than one file; the
    first file listed (the checked GED, else the newest candidate file) wins.
    Events are dated by the day they started: a handful span weeks, and their
    deaths all land in that first month.
    """
    # Older events are skipped as they're read, keeping the GED's 35 years of
    # events out of memory.
    events = {}
    for url in file_urls():
        for event in read_events(url):
            month = event["date_start"][:7]
            if month >= FIRST_MONTH and event["id"] not in events:
                events[event["id"]] = (month, event["country_id"], int(event["best"]))

    latest_month_with_data = max(month for month, _, _ in events.values())
    deaths_by_month_by_country = {
        month: {} for month in months_between(FIRST_MONTH, latest_month_with_data)
    }
    for month, country_id, best in events.values():
        if country_id not in GW_TO_ISO3:
            raise ValueError(f"No ISO code for UCDP country {country_id}; add it to GW_TO_ISO3")
        code = GW_TO_ISO3[country_id]
        deaths_by_month_by_country[month][code] = deaths_by_month_by_country[month].get(code, 0) + best
    # UCDP drops files from its page as newer releases replace them, so check
    # no month went missing. Summing over a missing month wouldn't fail, it
    # would just quietly give wrong figures. (Every month has deaths somewhere.)
    missing = [
        month for month, deaths_by_country in deaths_by_month_by_country.items() if not deaths_by_country
    ]
    if missing:
        raise ValueError(f"UCDP's files have no events for {', '.join(missing)}")
    return deaths_by_month_by_country
