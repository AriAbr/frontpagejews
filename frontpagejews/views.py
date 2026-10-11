from functools import cached_property

from django.views.generic import TemplateView

from frontpagejews import benchmarks, gdelt
from frontpagejews.countries import country_name
from frontpagejews.news_coverage import (
    HOME_COUNTRIES,
    OUTLETS,
    coverage_shares,
    last_days,
    mention_counts,
)

FOCUS = "ISR"


class Dashboard(TemplateView):
    """Israel's coverage against reality, beside one comparison country, and every country's mentions."""

    template_name = "frontpagejews/dashboard.html"
    default_comparison = "CHN"
    # The scatterplot totals mentions over this many of the most recent cached days.
    scatter_days = 30

    # What the visitor picked, from the query string.

    @cached_property
    def outlets(self):
        """The selected outlets' slugs; all of them when none valid is given."""
        return [slug for slug in self.request.GET.getlist("outlet") if slug in OUTLETS] or list(OUTLETS)

    @cached_property
    def comparison(self):
        return self.request.GET.get("vs", self.default_comparison)

    # The cached data.

    @cached_property
    def day_summaries(self):
        return [gdelt.load_day(day) for day in gdelt.cached_days()]

    @cached_property
    def population(self):
        return benchmarks.population()

    @cached_property
    def reality(self):
        return benchmarks.population_shares()

    # The page's pieces.

    def comparison_choices(self):
        """(code, name) for countries with both mentions and a reality score, most mentioned first."""
        mentions = mention_counts(self.day_summaries, self.outlets)
        most_mentioned_first = sorted(mentions, key=mentions.get, reverse=True)
        codes = [c for c in most_mentioned_first if c in self.reality and c != FOCUS]
        return [(code, country_name(code)) for code in codes]

    def line_chart_data(self):
        """One row per cached day: both countries' coverage and population shares."""
        rows = []
        for day_summary in self.day_summaries:
            coverage = coverage_shares([day_summary], self.outlets)
            rows.append(
                {
                    "date": day_summary["date"],
                    "focus_coverage": coverage.get(FOCUS, 0),
                    "focus_reality": self.reality.get(FOCUS),
                    "comparison_coverage": coverage.get(self.comparison, 0),
                    "comparison_reality": self.reality.get(self.comparison),
                }
            )
        return rows

    @cached_property
    def recent_mentions_by_country(self):
        """Each country's mentions over the `scatter_days` most recent cached days."""
        return mention_counts(last_days(self.day_summaries, self.scatter_days), self.outlets)

    def scatter_points(self):
        """One point per country: its mentions over the scatter window, beside its population.

        Countries with no population figure are left out, since they have no place
        on the population axis, and so are the outlets' home countries. So are
        countries never mentioned in the window, for now.
        """
        return [
            {
                "code": code,
                "name": country_name(code),
                "mentions": self.recent_mentions_by_country[code],
                "population": self.population[code],
            }
            for code in sorted(self.recent_mentions_by_country.keys() & self.population.keys())
            if code not in HOME_COUNTRIES
        ]

    def average_mentions_per_person(self):
        """Mentions over the scatter window per person, leaving out the outlets' home countries.

        The slope of the line a country would sit on if mentions followed population.
        Those countries are left out of both sides, so the line is where the
        countries actually shown would balance. Provisional: the line chart's shares
        still count their mentions.
        """
        mentions = self.recent_mentions_by_country
        total_mentions = sum(n for code, n in mentions.items() if code not in HOME_COUNTRIES)
        total_people = sum(n for code, n in self.population.items() if code not in HOME_COUNTRIES)
        return total_mentions / total_people if total_people else 0

    def get_context_data(self, **kwargs):
        return super().get_context_data(
            **kwargs,
            # The countries, the line chart and the scatter each go to the page
            # as one JSON blob for the scripts.
            countries={
                "focus": {"code": FOCUS, "name": country_name(FOCUS)},
                "comparison": {"code": self.comparison, "name": country_name(self.comparison)},
            },
            choices=self.comparison_choices(),
            outlets=[(slug, outlet.name, slug in self.outlets) for slug, outlet in OUTLETS.items()],
            selected_outlets=self.outlets,
            line_chart_data=self.line_chart_data(),
            scatter_data={
                "points": self.scatter_points(),
                "slope": self.average_mentions_per_person(),
                "days": self.scatter_days,
            },
        )
