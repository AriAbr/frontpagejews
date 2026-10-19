from datetime import UTC, date, datetime, timedelta

from django.core.management.base import BaseCommand, CommandError

from frontpagejews import gdelt
from frontpagejews.news_coverage import DAYS_SHOWN


class Command(BaseCommand):
    help = "Download GDELT's GKG files for a range of days and cache per-day country counts."

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
        yesterday = datetime.now(UTC).date() - timedelta(days=1)
        end = end or yesterday
        start = start or end - timedelta(days=days - 1)
        if end > yesterday:
            raise CommandError(f"--end {end} is not over yet; the last finished day is {yesterday}")
        if start > end:
            raise CommandError(f"--start {start} is after --end {end}")

        for offset in range((end - start).days + 1):
            day = start + timedelta(days=offset)
            if not refresh and gdelt.load_day(day) is not None:
                self.stdout.write(f"{day}: cached")
                continue
            summary = gdelt.fetch_day(day, refresh=refresh)
            articles = sum(d["articles"] for d in summary["domains"].values())
            self.stdout.write(
                f"{day}: {articles} articles from {len(summary['domains'])} domains "
                f"({summary['files']}/{summary['files_expected']} files)"
            )
