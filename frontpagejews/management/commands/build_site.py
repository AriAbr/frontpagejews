import json
import shutil
from pathlib import Path

from django.conf import settings
from django.contrib.staticfiles import finders
from django.core.management.base import BaseCommand
from django.template.loader import render_to_string

from frontpagejews.site_data import month_site_data, site_data
from frontpagejews.views import page_context


class Command(BaseCommand):
    help = (
        "Write the dashboard out as a static site: index.html, data.json, a file per "
        "month, the static files, and the files crawlers look for at the root."
    )

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
        (out / "months").mkdir()
        for month in data["months"]:
            month_json = json.dumps(month_site_data(month), separators=(",", ":"))
            (out / "months" / f"{month}.json").write_text(month_json)
        static = out / settings.STATIC_URL.strip("/")
        for finder in finders.get_finders():
            for path, storage in finder.list(ignore_patterns=[]):
                # Only the site's own files, not the admin's.
                if not path.startswith("frontpagejews/"):
                    continue
                target = static / path
                target.parent.mkdir(parents=True, exist_ok=True)
                shutil.copyfile(storage.path(path), target)
        self.write_crawler_files(out, data)
        self.stdout.write(f"Built {out}: {len(data['days'])} days, {len(data['months'])} months")

    def write_crawler_files(self, out, data):
        """The files search engines ask for by fixed address. The sitemap's lastmod is
        the newest day shown, so each day's deploy tells them the page has changed."""
        url = page_context()["url"]
        shutil.copyfile(finders.find("frontpagejews/favicon.ico"), out / "favicon.ico")
        (out / "robots.txt").write_text(f"User-agent: *\nAllow: /\n\nSitemap: {url}sitemap.xml\n")
        lastmod = f"<lastmod>{data['days'][-1]['date']}</lastmod>" if data["days"] else ""
        (out / "sitemap.xml").write_text(
            '<?xml version="1.0" encoding="UTF-8"?>\n'
            '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n'
            f"  <url><loc>{url}</loc>{lastmod}</url>\n"
            "</urlset>\n"
        )
