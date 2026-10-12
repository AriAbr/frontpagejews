from django.core.management.base import BaseCommand

from frontpagejews import benchmarks


class Command(BaseCommand):
    help = "Refetch the real-world benchmark data and replace the cache."

    def handle(self, *args, **options):
        for benchmark, figures in benchmarks.refresh().items():
            self.stdout.write(f"{benchmark}: {len(figures)} countries")
