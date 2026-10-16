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
from datetime import date

import requests

DOWNLOAD_CENTER = "https://ucdp.uu.se/downloads/"

# Links on the download center to the files read here, in CSV only (each is
# also offered as Excel, R and Stata). The version digits change with each
# release: ged261-csv.zip, GEDEvent_v26_0_8.csv, GEDEvent_v26_01_26_06.csv.
GED_FILE_LINK = re.compile(re.escape(DOWNLOAD_CENTER) + r"ged/ged\d+-csv\.zip")
CANDIDATE_FILE_LINK = re.compile(re.escape(DOWNLOAD_CENTER) + r"candidateged/GEDEvent_v[\d_]+\.csv")

# Deaths are summed over the 12 months up to the newest month UCDP has data for.
MONTHS_SUMMED = 12

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


def months_back(month, count):
    """The `count` months up to and including `month`, oldest first:
    months_back("2026-02", 3) == ["2025-12", "2026-01", "2026-02"]."""
    year, month_number = map(int, month.split("-"))
    months = []
    for _ in range(count):
        zero_padded_month = f"{month_number:02}"  # 8 -> "08"
        months.append(f"{year}-{zero_padded_month}")
        month_number -= 1
        if month_number == 0:
            year, month_number = year - 1, 12
    return list(reversed(months))


def fetch_deaths(today=None):
    """The last `MONTHS_SUMMED` months UCDP has data for, oldest first, and a map
    of ISO3 -> deaths over them.

    An event revised in a later release appears in more than one file; the
    first file listed (the checked GED, else the newest candidate file) wins.
    Events are dated by the day they started: a handful span weeks, and their
    deaths all land in that first month.
    """
    # Anything older can't fall within 12 months of the newest data, and
    # skipping it keeps the GED's 35 years of events out of memory.
    earliest_year = str((today or date.today()).year - 2)
    events = {}
    for url in file_urls():
        for event in read_events(url):
            if event["date_start"][:4] >= earliest_year and event["id"] not in events:
                events[event["id"]] = (event["date_start"][:7], event["country_id"], int(event["best"]))

    months_summed = months_back(max(month for month, _, _ in events.values()), MONTHS_SUMMED)
    # UCDP drops files from its page as newer releases replace them, so check
    # none of the 12 months went missing. Summing fewer months wouldn't fail,
    # it would just quietly give wrong figures.
    missing = set(months_summed) - {month for month, _, _ in events.values()}
    if missing:
        raise ValueError(f"UCDP's files have no events for {', '.join(sorted(missing))}")

    deaths = {}
    for month, country_id, best in events.values():
        if month not in months_summed:
            continue
        if country_id not in GW_TO_ISO3:
            raise ValueError(f"No ISO code for UCDP country {country_id}; add it to GW_TO_ISO3")
        code = GW_TO_ISO3[country_id]
        deaths[code] = deaths.get(code, 0) + best
    return months_summed, deaths
