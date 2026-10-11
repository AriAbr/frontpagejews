from django.core.management.base import BaseCommand

from frontpagejews import benchmarks


class Command(BaseCommand):
    help = "Refetch the real-world benchmark data and replace the cache."

    def handle(self, *args, **options):
        data = benchmarks.refresh_population()
        self.stdout.write(f"population: {len(data)} countries")
