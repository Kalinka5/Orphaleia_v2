import json
import os
import sys
from pathlib import Path

os.environ.setdefault("APP_ENV", "test")
os.environ.setdefault("DATABASE_URL", "sqlite://")
os.environ.setdefault("SECRET_KEY", "openapi-generation-only-test-secret")
os.environ.setdefault("COOKIE_SECURE", "false")
os.environ.setdefault("PAYMENTS_MOCK", "true")

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.main import app

target = Path(sys.argv[1] if len(sys.argv) > 1 else "/tmp/orphaleia-openapi.json")
target.write_text(json.dumps(app.openapi(), indent=2), encoding="utf-8")
print(target)
