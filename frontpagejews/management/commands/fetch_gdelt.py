from datetime import UTC, datetime, timedelta

from django.core.management.base import BaseCommand

from frontpagejews import gdelt


class Command(BaseCommand):
    help = "Download GDELT's GKG files for recent days and cache per-day country counts."

    def add_arguments(self, parser):
        parser.add_argument("--days", type=int, default=7, help="How many finished days back to fetch")
        parser.add_argument(
            "--refresh", action="store_true", help="Rebuild days that are already cached"
        )

    def handle(self, *args, days, refresh, **options):
        today = datetime.now(UTC).date()
        for offset in range(days, 0, -1):
            day = today - timedelta(days=offset)
            if not refresh and gdelt.load_day(day) is not None:
                self.stdout.write(f"{day}: cached")
                continue
            summary = gdelt.fetch_day(day, refresh=refresh)
            articles = sum(d["articles"] for d in summary["domains"].values())
            self.stdout.write(
                f"{day}: {articles} articles from {len(summary['domains'])} domains "
                f"({summary['files']}/{summary['files_expected']} files)"
            )
