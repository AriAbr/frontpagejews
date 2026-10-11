import json
import shutil
from pathlib import Path

from django.conf import settings
from django.contrib.staticfiles import finders
from django.core.management.base import BaseCommand
from django.template.loader import render_to_string

from frontpagejews.site_data import site_data
from frontpagejews.views import page_context


class Command(BaseCommand):
    help = "Write the dashboard out as a static site: index.html, data.json and the static files."

    def add_arguments(self, parser):
        parser.add_argument(
            "--out", type=Path, default=settings.BASE_DIR / "build", help="Output directory"
        )

    def handle(self, *args, out, **options):
        if out.exists():
            shutil.rmtree(out)
        out.mkdir(parents=True)
        (out / "index.html").write_text(render_to_string("frontpagejews/dashboard.html", page_context()))
        data = site_data()
        (out / "data.json").write_text(json.dumps(data, separators=(",", ":")))
        static = out / settings.STATIC_URL.strip("/")
        for finder in finders.get_finders():
            for path, storage in finder.list(ignore_patterns=[]):
                # Only the site's own files, not the admin's.
                if not path.startswith("frontpagejews/"):
                    continue
                target = static / path
                target.parent.mkdir(parents=True, exist_ok=True)
                shutil.copyfile(storage.path(path), target)
        self.stdout.write(f"Built {out}: {len(data['days'])} days")
