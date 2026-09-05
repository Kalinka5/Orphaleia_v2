from sqlalchemy import func, select
from sqlalchemy.orm import Session, selectinload

from .models import Book, Comment, Order, Rating


def author_out(author):
    return {"id": author.id, "name": author.name, "slug": author.slug, "bio": author.bio, "image_url": author.image_url}


def genre_out(genre):
    return {"id": genre.id, "name": genre.name, "slug": genre.slug, "description": genre.description}


def book_out(db: Session, book: Book, detailed: bool = False):
    avg, count = db.execute(
        select(func.avg(Rating.value), func.count(Rating.id)).where(Rating.book_id == book.id)
    ).one()
    data = {
        "id": book.id,
        "title": book.title,
        "slug": book.slug,
        "isbn": book.isbn,
        "description": book.description,
        "publication_year": book.publication_year,
        "price_cents": book.price_cents,
        "currency": book.currency,
        "stock_qty": book.stock_qty,
        "available": book.stock_qty > 0,
        "cover_url": book.cover_url,
        "interior_image_url": book.interior_image_url,
        "interior_image_alt": book.interior_image_alt,
        "pull_quote": book.pull_quote,
        "video_url": book.video_url,
        "featured": book.featured,
        "active": book.active,
        "rating_average": round(float(avg or 0), 2),
        "rating_count": int(count or 0),
        "authors": [author_out(x) for x in book.authors],
        "genres": [genre_out(x) for x in book.genres],
    }
    if detailed:
        comments = db.scalars(
            select(Comment).options(selectinload(Comment.user)).where(Comment.book_id == book.id, Comment.visible.is_(True)).order_by(Comment.created_at.desc())
        ).all()
        data["comments"] = [
            {"id": c.id, "body": c.body, "created_at": c.created_at, "author": c.user.full_name, "author_avatar_url": c.user.avatar_url}
            for c in comments
        ]
    return data


def order_out(order: Order):
    return {
        "id": order.id,
        "number": order.number,
        "status": order.status,
        "subtotal_cents": order.subtotal_cents,
        "shipping_cents": order.shipping_cents,
        "total_cents": order.total_cents,
        "currency": order.currency,
        "tracking_reference": order.tracking_reference,
        "created_at": order.created_at,
        "shipping": {
            "name": order.shipping_name,
            "line1": order.shipping_line1,
            "line2": order.shipping_line2,
            "city": order.shipping_city,
            "postal_code": order.shipping_postal_code,
            "country": order.shipping_country,
        },
        "items": [
            {
                "book_id": item.book_id,
                "title": item.title,
                "isbn": item.isbn,
                "cover_url": item.cover_url,
                "unit_price_cents": item.unit_price_cents,
                "quantity": item.quantity,
            }
            for item in order.items
        ],
    }
