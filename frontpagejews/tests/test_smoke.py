def describe_project_setup():
    """Smoke tests that the project boots and serves a request end to end"""

    def test_admin_redirects_anonymous_users_to_login(client):
        """Exercises settings, middleware and the root URLconf in one request"""
        response = client.get("/admin/")

        assert response.status_code == 302
        assert response.url.startswith("/admin/login/")
