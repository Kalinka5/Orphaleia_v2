import io
import uuid
from pathlib import Path

import boto3
from PIL import Image, ImageOps, UnidentifiedImageError

from .config import settings

ALLOWED = {"image/jpeg": "jpg", "image/png": "png", "image/webp": "webp"}
MAX_BYTES = 8 * 1024 * 1024
MAX_AVATAR_BYTES = 5 * 1024 * 1024
MAX_AVATAR_PIXELS = 20_000_000
AVATAR_SIZE = (256, 256)


def _store_image(data: bytes, key: str) -> tuple[str, int]:
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
    return _store_image(data, key)


def save_avatar(content: bytes, content_type: str, user_id: str) -> tuple[str, int]:
    if content_type not in ALLOWED:
        raise ValueError("Upload a JPEG, PNG, or WebP image")
    if not content or len(content) > MAX_AVATAR_BYTES:
        raise ValueError("Avatar must be smaller than 5 MB")
    try:
        probe = Image.open(io.BytesIO(content))
        detected_format = probe.format
        width, height = probe.size
        probe.verify()
        if detected_format not in {"JPEG", "PNG", "WEBP"}:
            raise ValueError("Upload a JPEG, PNG, or WebP image")
        if width * height > MAX_AVATAR_PIXELS:
            raise ValueError("Avatar dimensions are too large")
        image = Image.open(io.BytesIO(content))
        image = ImageOps.exif_transpose(image)
        image.seek(0)
        image = ImageOps.fit(image.convert("RGB"), AVATAR_SIZE, method=Image.Resampling.LANCZOS)
    except (Image.DecompressionBombError, Image.DecompressionBombWarning, UnidentifiedImageError, OSError) as exc:
        raise ValueError("Upload a valid JPEG, PNG, or WebP image") from exc
    output = io.BytesIO()
    image.save(output, format="WEBP", quality=88, method=6)
    key = f"avatars/{user_id}/{uuid.uuid4()}.webp"
    return _store_image(output.getvalue(), key)


def delete_avatar(url: str) -> None:
    if settings.s3_bucket:
        base = f"{settings.s3_public_url.rstrip('/')}/"
        if not url.startswith(base):
            return
        key = url[len(base):]
        if not key.startswith("avatars/"):
            return
        client = boto3.client(
            "s3",
            endpoint_url=settings.s3_endpoint_url or None,
            aws_access_key_id=settings.s3_access_key or None,
            aws_secret_access_key=settings.s3_secret_key or None,
        )
        client.delete_object(Bucket=settings.s3_bucket, Key=key)
        return
    prefix = "/media/"
    if not url.startswith(prefix):
        return
    key = url[len(prefix):]
    if not key.startswith("avatars/"):
        return
    root = Path(settings.media_dir).resolve()
    path = (root / key).resolve()
    if root not in path.parents:
        return
    path.unlink(missing_ok=True)
