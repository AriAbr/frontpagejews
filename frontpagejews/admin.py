from django.contrib import admin

from frontpagejews.models import DailyCountryCount, DailyScrape, Outlet


class CountryCountInline(admin.TabularInline):
    model = DailyCountryCount
    extra = 0


@admin.register(Outlet)
class OutletAdmin(admin.ModelAdmin):
    list_display = ("name", "slug")
    search_fields = ("name", "slug")
    prepopulated_fields = {"slug": ("name",)}


@admin.register(DailyScrape)
class DailyScrapeAdmin(admin.ModelAdmin):
    list_display = ("date", "outlet", "article_count", "country_count", "scraped_at")
    list_filter = ("outlet",)
    list_select_related = ("outlet",)
    date_hierarchy = "date"
    inlines = [CountryCountInline]

    @admin.display(description="Countries")
    def country_count(self, obj):
        return obj.country_counts.count()


@admin.register(DailyCountryCount)
class DailyCountryCountAdmin(admin.ModelAdmin):
    list_display = ("date", "outlet", "country_code", "count", "share_of_articles")
    list_filter = ("daily_scrape__outlet",)
    list_select_related = ("daily_scrape", "daily_scrape__outlet")
    search_fields = ("country_code",)

    @admin.display(description="Date", ordering="daily_scrape__date")
    def date(self, obj):
        return obj.daily_scrape.date

    @admin.display(description="Outlet", ordering="daily_scrape__outlet__name")
    def outlet(self, obj):
        return obj.daily_scrape.outlet

    @admin.display(description="Share")
    def share_of_articles(self, obj):
        total = obj.daily_scrape.article_count
        return f"{obj.count / total:.1%}" if total else "--"
