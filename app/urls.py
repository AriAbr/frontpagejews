from django.contrib import admin
from django.urls import path

from frontpagejews import views

urlpatterns = [
    path("", views.Dashboard.as_view(), name="dashboard"),
    # Served as a file by the static site; this route is for local development.
    path("data.json", views.data, name="data"),
    path("months/<str:month>.json", views.month, name="month"),
    path("admin/", admin.site.urls),
]
