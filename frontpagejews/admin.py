from django.contrib import admin

from frontpagejews.models import DailyCount, Outlet


@admin.register(Outlet)
class OutletAdmin(admin.ModelAdmin):
    list_display = ("name", "slug")
    search_fields = ("name", "slug")
    prepopulated_fields = {"slug": ("name",)}


@admin.register(DailyCount)
class DailyCountAdmin(admin.ModelAdmin):
    list_display = ("date", "outlet", "country_code", "mention_count", "article_count")
    list_filter = ("outlet",)
    list_select_related = ("outlet",)
    search_fields = ("country_code",)
    date_hierarchy = "date"
