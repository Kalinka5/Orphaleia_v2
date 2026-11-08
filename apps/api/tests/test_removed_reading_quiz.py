from app.main import app


def test_reading_quiz_routes_are_removed():
    assert not any("reading-current" in route.path for route in app.routes)
    assert not any("reading-current" in path for path in app.openapi()["paths"])
