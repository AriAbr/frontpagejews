from django.contrib import admin
from django.urls import path

from frontpagejews import views

urlpatterns = [
    path("", views.Dashboard.as_view(), name="dashboard"),
    path("admin/", admin.site.urls),
]
