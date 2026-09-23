from django.contrib import admin
from django.db.models import Count

from frontpagejews.models import DailyCount, Feed, Outlet


class FeedInline(admin.TabularInline):
    model = Feed
    extra = 1


@admin.register(Outlet)
class OutletAdmin(admin.ModelAdmin):
    list_display = ("name", "slug", "feed_count")
    search_fields = ("name", "slug")
    prepopulated_fields = {"slug": ("name",)}
    inlines = [FeedInline]

    def get_queryset(self, request):
        return super().get_queryset(request).annotate(feed_count=Count("feeds"))

    @admin.display(description="Feeds", ordering="feed_count")
    def feed_count(self, obj):
        return obj.feed_count


@admin.register(Feed)
class FeedAdmin(admin.ModelAdmin):
    list_display = ("outlet", "name", "url")
    list_filter = ("outlet",)
    list_select_related = ("outlet",)
    search_fields = ("name", "url", "outlet__name")


@admin.register(DailyCount)
class DailyCountAdmin(admin.ModelAdmin):
    list_display = ("date", "outlet", "country_code", "mention_count", "article_count")
    list_filter = ("outlet",)
    list_select_related = ("outlet",)
    search_fields = ("country_code",)
    date_hierarchy = "date"
