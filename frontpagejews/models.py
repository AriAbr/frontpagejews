from django.db import models


class Outlet(models.Model):
    name = models.CharField(max_length=100)
    slug = models.SlugField(unique=True, help_text="Used on the command line, e.g. `scrape nyt`.")

    class Meta:
        ordering = ["name"]

    def __str__(self):
        return self.name


class DailyCount(models.Model):
    """How often one outlet mentioned one country on one day.

    Only non-zero counts are stored, so an absent row means no mentions.
    """

    date = models.DateField(help_text="The day the scrape ran, not the article publication date.")
    outlet = models.ForeignKey(Outlet, on_delete=models.PROTECT, related_name="daily_counts")
    country_code = models.CharField(
        max_length=3,
        db_index=True,
        help_text="ISO 3166-1 alpha-3.",
    )
    mention_count = models.PositiveIntegerField(help_text="Total matches across all articles.")
    article_count = models.PositiveIntegerField(
        help_text="Articles mentioning the country at least once."
    )

    class Meta:
        ordering = ["-date", "outlet__name", "country_code"]
        constraints = [
            models.UniqueConstraint(
                fields=["date", "outlet", "country_code"],
                name="unique_daily_count_per_outlet_country",
            ),
        ]

    def __str__(self):
        return f"{self.date} {self.outlet.slug} {self.country_code}: {self.mention_count}"
