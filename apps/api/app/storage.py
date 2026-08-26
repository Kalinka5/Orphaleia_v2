import io
import uuid
from pathlib import Path

import boto3
from PIL import Image

from .config import settings

ALLOWED = {"image/jpeg": "jpg", "image/png": "png", "image/webp": "webp"}
MAX_BYTES = 8 * 1024 * 1024


def save_image(content: bytes, content_type: str) -> tuple[str, int]:
    if content_type not in ALLOWED:
        raise ValueError("Upload a JPEG, PNG, or WebP image")
    if len(content) > MAX_BYTES:
        raise ValueError("Image must be smaller than 8 MB")
    image = Image.open(io.BytesIO(content))
    image.verify()
    image = Image.open(io.BytesIO(content)).convert("RGB")
    image.thumbnail((1200, 1600))
    output = io.BytesIO()
    image.save(output, format="WEBP", quality=88, method=6)
    data = output.getvalue()
    key = f"covers/{uuid.uuid4()}.webp"
    if settings.s3_bucket:
        client = boto3.client(
            "s3",
            endpoint_url=settings.s3_endpoint_url or None,
            aws_access_key_id=settings.s3_access_key or None,
            aws_secret_access_key=settings.s3_secret_key or None,
        )
        client.put_object(Bucket=settings.s3_bucket, Key=key, Body=data, ContentType="image/webp")
        base = settings.s3_public_url.rstrip("/")
        return f"{base}/{key}", len(data)
    path = Path(settings.media_dir) / key
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes(data)
    return f"/media/{key}", len(data)
