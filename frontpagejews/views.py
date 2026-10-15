"""The dashboard as Django serves it locally. The live site is the same page
built to static files by `manage.py build_site`."""

from django.conf import settings
from django.http import JsonResponse
from django.templatetags.static import static
from django.views.generic import TemplateView

from frontpagejews.countries import country_name
from frontpagejews.news_coverage import DAYS_SHOWN, OUTLETS
from frontpagejews.site_data import FOCUS, site_data


def page_context():
    """The page's fixed parts. Everything that depends on the visitor's choices is
    filled in by the scripts from data.json."""
    focus_name = country_name(FOCUS)
    url = "https://frontpagejews.com/"
    return {
        # Two names on purpose. The browser tab and link previews show the
        # domain beside this one, so it reads as a name rather than repeat it.
        "title": "Front Page Jews",
        # The page itself and its preview image carry no address of their own,
        # so this one is the address, and screenshots of the page carry it.
        "site_name": "FrontPageJews.com",
        "url": url,
        # Link previews need the image's full address.
        "preview_image_url": url.rstrip("/") + static("frontpagejews/og-image.png"),
        "subtitle": f"Measuring {focus_name}'s share of the news against real-world data",
        "focus_name": focus_name,
        "outlets": {slug: outlet.name for slug, outlet in OUTLETS.items()},
        "days_shown": DAYS_SHOWN,
        "ga_measurement_id": settings.GA_MEASUREMENT_ID,
    }


class Dashboard(TemplateView):
    template_name = "frontpagejews/dashboard.html"

    def get_context_data(self, **kwargs):
        return super().get_context_data(**kwargs, **page_context())


def data(request):
    return JsonResponse(site_data())
