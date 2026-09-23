from django.contrib.auth.models import AbstractUser
from django.db import models
from django.db.models.functions import Lower


class User(AbstractUser):
    """Custom user model.

    Subclassing AbstractUser from the start costs nothing and is very painful to
    retrofit, since AUTH_USER_MODEL cannot be changed once migrations referencing
    it have been applied.
    """

    class Meta:
        constraints = [
            models.UniqueConstraint(
                Lower("email"),
                condition=~models.Q(email=""),
                name="unique_user_email_ci",
            ),
        ]

    def __str__(self):
        return self.email or self.username
