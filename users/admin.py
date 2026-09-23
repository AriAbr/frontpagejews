from django.contrib import admin
from django.contrib.auth.admin import UserAdmin as BaseUserAdmin

from users.models import User


@admin.register(User)
class UserAdmin(BaseUserAdmin):
    list_display = [
        "email_display",
        "username",
        "full_name",
        "is_staff",
        "is_superuser",
        "is_active",
        "date_joined",
        "last_login",
    ]
    list_filter = ["is_staff", "is_superuser", "is_active", "date_joined"]
    search_fields = ["email", "username", "first_name", "last_name"]
    ordering = ["-date_joined"]

    @admin.display(description="Email", ordering="email")
    def email_display(self, obj):
        return obj.email or "--"

    @admin.display(description="Name")
    def full_name(self, obj):
        return f"{obj.first_name} {obj.last_name}".strip()
