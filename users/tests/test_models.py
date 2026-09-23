import pytest
from django.db.utils import IntegrityError

from users.models import User


def describe_user():
    """Tests for the custom User model"""

    def test_email_uniqueness_ignores_case(db):
        """The unique_user_email_ci constraint compares Lower(email)"""
        User.objects.create_user(username="ari", email="Ari@Example.com", password="pw")

        with pytest.raises(IntegrityError):
            User.objects.create_user(username="ari2", email="ari@example.com", password="pw")

    def test_blank_emails_may_repeat(db):
        """AbstractUser allows a blank email, so the constraint excludes them"""
        User.objects.create_user(username="ari", email="", password="pw")
        User.objects.create_user(username="ari2", email="", password="pw")

        assert User.objects.filter(email="").count() == 2

    def test_str_prefers_email_over_username(db):
        user = User.objects.create_user(username="ari", email="ari@example.com", password="pw")

        assert str(user) == "ari@example.com"

    def test_str_falls_back_to_username_when_email_is_blank(db):
        user = User.objects.create_user(username="ari", email="", password="pw")

        assert str(user) == "ari"
