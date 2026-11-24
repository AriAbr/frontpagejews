from datetime import UTC, date, datetime, timedelta

from django.conf import settings
from django.core.management.base import BaseCommand, CommandError

from frontpagejews import nyt
from frontpagejews.news_coverage import DAYS_SHOWN


class Command(BaseCommand):
    help = "Download the NYT's articles for a range of days and cache per-day country counts."

    def add_arguments(self, parser):
        parser.add_argument(
            "--days",
            type=int,
            default=DAYS_SHOWN,
            help="How many days back from --end to fetch (default: as many as the site shows)",
        )
        parser.add_argument(
            "--start",
            type=date.fromisoformat,
            help="First day to fetch, as YYYY-MM-DD; overrides --days",
        )
        parser.add_argument(
            "--end",
            type=date.fromisoformat,
            help="Last day to fetch, as YYYY-MM-DD (default: yesterday, the last finished day)",
        )
        parser.add_argument(
            "--refresh", action="store_true", help="Rebuild days that are already cached"
        )

    def handle(self, *args, days, start, end, refresh, **options):
        if not settings.NYT_API_KEY:
            raise CommandError("NYT_API_KEY isn't set; see .env.example")
        if not settings.GEONAMES_USERNAME:
            raise CommandError("GEONAMES_USERNAME isn't set; see .env.example")
        yesterday = datetime.now(UTC).date() - timedelta(days=1)
        end = end or yesterday
        start = start or end - timedelta(days=days - 1)
        if end > yesterday:
            raise CommandError(f"--end {end} is not over yet; the last finished day is {yesterday}")
        if start > end:
            raise CommandError(f"--start {start} is after --end {end}")

        days_to_fetch = []
        # Counted rather than listed: the deploy checks every day since 2015.
        days_already_cached = 0
        for offset in range((end - start).days + 1):
            day = start + timedelta(days=offset)
            summary = nyt.load_day(day)
            # An incomplete day is tried again, from the archive.
            if not refresh and summary is not None and not nyt.is_incomplete(summary):
                days_already_cached += 1
            else:
                days_to_fetch.append(day)

        for day, summary in nyt.fetch_days(days_to_fetch):
            domain_summary = summary["domains"][nyt.DOMAIN]
            articles_with_countries = sum(domain_summary["country_sets"].values())
            incomplete = ", incomplete" if nyt.is_incomplete(summary) else ""
            self.stdout.write(
                f"{day}: {domain_summary['articles']} articles, {articles_with_countries} "
                f"naming a country (from {summary['source']}{incomplete})"
            )
        days_incomplete = [day for day in days_to_fetch if nyt.is_incomplete(nyt.load_day(day))]
        self.stdout.write(f"{days_already_cached} days already cached")
        if days_incomplete:
            self.stdout.write(
                f"Incomplete, waiting for the archive: {', '.join(map(str, days_incomplete))}"
            )
