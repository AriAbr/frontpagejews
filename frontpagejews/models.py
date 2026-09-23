from django.db import models


class Outlet(models.Model):
    name = models.CharField(max_length=100)
    slug = models.SlugField(unique=True, help_text="Used on the command line, e.g. `scrape nyt`.")

    class Meta:
        ordering = ["name"]

    def __str__(self):
        return self.name


class DailyScrape(models.Model):
    """One run over one outlet's feeds on one day.

    `article_count` is the denominator: raw per-country counts are not
    comparable between outlets that publish at different volumes. It also
    distinguishes a scrape that found no countries from one that never ran,
    which are otherwise indistinguishable since only non-zero counts are stored.
    """

    date = models.DateField(help_text="The day the scrape ran, not the article publication date.")
    outlet = models.ForeignKey(Outlet, on_delete=models.PROTECT, related_name="daily_scrapes")
    article_count = models.PositiveIntegerField(
        help_text="Unique articles seen across the outlet's feeds."
    )
    scraped_at = models.DateTimeField(auto_now=True, help_text="Latest run for this outlet and day.")

    class Meta:
        ordering = ["-date", "outlet__name"]
        constraints = [
            models.UniqueConstraint(fields=["date", "outlet"], name="unique_scrape_per_outlet_day"),
        ]

    def __str__(self):
        return f"{self.date} {self.outlet.slug}: {self.article_count} articles"


class DailyCountryCount(models.Model):
    """How many of a scrape's articles mentioned one country.

    Only non-zero counts are stored, so an absent row means no mentions.
    """

    daily_scrape = models.ForeignKey(
        DailyScrape, on_delete=models.CASCADE, related_name="country_counts"
    )
    country_code = models.CharField(max_length=3, db_index=True, help_text="ISO 3166-1 alpha-3.")
    count = models.PositiveIntegerField(help_text="Articles whose title mentioned the country.")

    class Meta:
        ordering = ["daily_scrape", "country_code"]
        constraints = [
            models.UniqueConstraint(
                fields=["daily_scrape", "country_code"],
                name="unique_country_per_scrape",
            ),
        ]

    def __str__(self):
        return f"{self.daily_scrape}: {self.country_code}={self.count}"
