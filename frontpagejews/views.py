"""The dashboard as Django serves it locally. The live site is the same page
built to static files by `manage.py build_site`."""

from django.http import JsonResponse
from django.views.generic import TemplateView

from frontpagejews.countries import country_name
from frontpagejews.news_coverage import DAYS_SHOWN, OUTLETS
from frontpagejews.site_data import FOCUS, site_data


def page_context():
    """The page's fixed parts. Everything that depends on the visitor's choices is
    filled in by the scripts from data.json."""
    return {
        "focus_name": country_name(FOCUS),
        "outlets": {slug: outlet.name for slug, outlet in OUTLETS.items()},
        "days_shown": DAYS_SHOWN,
    }


class Dashboard(TemplateView):
    template_name = "frontpagejews/dashboard.html"

    def get_context_data(self, **kwargs):
        return super().get_context_data(**kwargs, **page_context())


def data(request):
    return JsonResponse(site_data())
