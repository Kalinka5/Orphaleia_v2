from __future__ import annotations

import uuid
from datetime import UTC, datetime

from sqlalchemy import Boolean, Column, DateTime, ForeignKey, Integer, String, Table, Text, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from .database import Base


def uid() -> str:
    return str(uuid.uuid4())


def now() -> datetime:
    return datetime.now(UTC)


book_authors = Table(
    "book_authors",
    Base.metadata,
    Column("book_id", ForeignKey("books.id", ondelete="CASCADE"), primary_key=True),
    Column("author_id", ForeignKey("authors.id", ondelete="CASCADE"), primary_key=True),
)
book_genres = Table(
    "book_genres",
    Base.metadata,
    Column("book_id", ForeignKey("books.id", ondelete="CASCADE"), primary_key=True),
    Column("genre_id", ForeignKey("genres.id", ondelete="CASCADE"), primary_key=True),
)


class User(Base):
    __tablename__ = "users"
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=uid)
    email: Mapped[str] = mapped_column(String(320), unique=True, index=True)
    pending_email: Mapped[str | None] = mapped_column(String(320), nullable=True)
    full_name: Mapped[str] = mapped_column(String(120))
    avatar_url: Mapped[str | None] = mapped_column(String(500), nullable=True)
    password_hash: Mapped[str] = mapped_column(String(255))
    auth_version: Mapped[int] = mapped_column(Integer, default=0)
    role: Mapped[str] = mapped_column(String(20), default="customer")
    is_verified: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now)
    default_shipping_address: Mapped[SavedAddress | None] = relationship(
        back_populates="user", cascade="all, delete-orphan", uselist=False
    )


class SavedAddress(Base):
    __tablename__ = "saved_addresses"
    user_id: Mapped[str] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), primary_key=True)
    name: Mapped[str] = mapped_column(String(160))
    line1: Mapped[str] = mapped_column(String(240))
    line2: Mapped[str] = mapped_column(String(240), default="")
    city: Mapped[str] = mapped_column(String(120))
    postal_code: Mapped[str] = mapped_column(String(24))
    country: Mapped[str] = mapped_column(String(2))
    user: Mapped[User] = relationship(back_populates="default_shipping_address")


class RefreshSession(Base):
    __tablename__ = "refresh_sessions"
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=uid)
    user_id: Mapped[str] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    token_hash: Mapped[str] = mapped_column(String(64), unique=True)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    revoked_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))


class ActionToken(Base):
    __tablename__ = "action_tokens"
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=uid)
    user_id: Mapped[str] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    kind: Mapped[str] = mapped_column(String(30))
    token_hash: Mapped[str] = mapped_column(String(64), unique=True)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    used_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))


class Author(Base):
    __tablename__ = "authors"
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=uid)
    name: Mapped[str] = mapped_column(String(160), index=True)
    slug: Mapped[str] = mapped_column(String(180), unique=True, index=True)
    bio: Mapped[str] = mapped_column(Text, default="")
    image_url: Mapped[str | None] = mapped_column(String(500))
    books: Mapped[list[Book]] = relationship(secondary=book_authors, back_populates="authors")


class Genre(Base):
    __tablename__ = "genres"
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=uid)
    name: Mapped[str] = mapped_column(String(100), unique=True)
    slug: Mapped[str] = mapped_column(String(120), unique=True, index=True)
    description: Mapped[str] = mapped_column(Text, default="")
    books: Mapped[list[Book]] = relationship(secondary=book_genres, back_populates="genres")


class Book(Base):
    __tablename__ = "books"
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=uid)
    title: Mapped[str] = mapped_column(String(240), index=True)
    slug: Mapped[str] = mapped_column(String(260), unique=True, index=True)
    isbn: Mapped[str] = mapped_column(String(20), unique=True)
    description: Mapped[str] = mapped_column(Text)
    publication_year: Mapped[int] = mapped_column(Integer, index=True)
    price_cents: Mapped[int] = mapped_column(Integer)
    currency: Mapped[str] = mapped_column(String(3), default="EUR")
    stock_qty: Mapped[int] = mapped_column(Integer, default=0)
    cover_url: Mapped[str] = mapped_column(String(500))
    interior_image_url: Mapped[str | None] = mapped_column(String(500), nullable=True)
    interior_image_alt: Mapped[str | None] = mapped_column(String(300), nullable=True)
    pull_quote: Mapped[str | None] = mapped_column(String(280), nullable=True)
    video_url: Mapped[str | None] = mapped_column(String(500))
    featured: Mapped[bool] = mapped_column(Boolean, default=False)
    active: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now)
    authors: Mapped[list[Author]] = relationship(secondary=book_authors, back_populates="books")
    genres: Mapped[list[Genre]] = relationship(secondary=book_genres, back_populates="books")
    ratings: Mapped[list[Rating]] = relationship(back_populates="book", cascade="all, delete-orphan")
    comments: Mapped[list[Comment]] = relationship(back_populates="book", cascade="all, delete-orphan")


class RankingDataset(Base):
    __tablename__ = "ranking_datasets"
    __table_args__ = (UniqueConstraint("source_name", "year", "scope_code", name="uq_ranking_dataset_source_year_scope"),)
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=uid)
    source_name: Mapped[str] = mapped_column(String(160))
    source_url: Mapped[str] = mapped_column(String(500))
    year: Mapped[int] = mapped_column(Integer, index=True)
    scope_code: Mapped[str] = mapped_column(String(80), index=True)
    scope_label: Mapped[str] = mapped_column(String(160))
    coverage_note: Mapped[str] = mapped_column(Text)
    methodology_note: Mapped[str] = mapped_column(Text)
    exact_units_public: Mapped[bool] = mapped_column(Boolean, default=False)
    checksum: Mapped[str] = mapped_column(String(64))
    imported_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now)
    published_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), index=True)
    entries: Mapped[list[RankingEntry]] = relationship(back_populates="dataset", cascade="all, delete-orphan")


class RankingEntry(Base):
    __tablename__ = "ranking_entries"
    __table_args__ = (UniqueConstraint("dataset_id", "provider_work_key", name="uq_ranking_entry_dataset_work"),)
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=uid)
    dataset_id: Mapped[str] = mapped_column(ForeignKey("ranking_datasets.id", ondelete="CASCADE"), index=True)
    provider_work_key: Mapped[str] = mapped_column(String(180))
    isbn13: Mapped[str | None] = mapped_column(String(13), index=True)
    title: Mapped[str] = mapped_column(String(240))
    authors_json: Mapped[str] = mapped_column(Text)
    genre: Mapped[str] = mapped_column(String(120), index=True)
    units_sold: Mapped[int] = mapped_column(Integer)
    catalog_book_id: Mapped[str | None] = mapped_column(ForeignKey("books.id", ondelete="SET NULL"), index=True)
    dataset: Mapped[RankingDataset] = relationship(back_populates="entries")
    catalog_book: Mapped[Book | None] = relationship()


class Rating(Base):
    __tablename__ = "ratings"
    __table_args__ = (UniqueConstraint("user_id", "book_id", name="uq_rating_user_book"),)
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=uid)
    user_id: Mapped[str] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    book_id: Mapped[str] = mapped_column(ForeignKey("books.id", ondelete="CASCADE"), index=True)
    value: Mapped[int] = mapped_column(Integer)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now, onupdate=now)
    book: Mapped[Book] = relationship(back_populates="ratings")


class RatingEvent(Base):
    __tablename__ = "rating_events"
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=uid)
    user_id: Mapped[str] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    book_id: Mapped[str] = mapped_column(ForeignKey("books.id", ondelete="CASCADE"), index=True)
    value: Mapped[int] = mapped_column(Integer)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now, index=True)


class Comment(Base):
    __tablename__ = "comments"
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=uid)
    user_id: Mapped[str] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    book_id: Mapped[str] = mapped_column(ForeignKey("books.id", ondelete="CASCADE"), index=True)
    body: Mapped[str] = mapped_column(Text)
    visible: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now)
    book: Mapped[Book] = relationship(back_populates="comments")
    user: Mapped[User] = relationship()


class Cart(Base):
    __tablename__ = "carts"
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=uid)
    user_id: Mapped[str] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), unique=True)
    items: Mapped[list[CartItem]] = relationship(cascade="all, delete-orphan", back_populates="cart")


class CartItem(Base):
    __tablename__ = "cart_items"
    __table_args__ = (UniqueConstraint("cart_id", "book_id", name="uq_cart_book"),)
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=uid)
    cart_id: Mapped[str] = mapped_column(ForeignKey("carts.id", ondelete="CASCADE"))
    book_id: Mapped[str] = mapped_column(ForeignKey("books.id", ondelete="CASCADE"))
    quantity: Mapped[int] = mapped_column(Integer, default=1)
    cart: Mapped[Cart] = relationship(back_populates="items")
    book: Mapped[Book] = relationship()


class ShippingZone(Base):
    __tablename__ = "shipping_zones"
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=uid)
    name: Mapped[str] = mapped_column(String(100))
    country_codes: Mapped[str] = mapped_column(Text)
    rate_cents: Mapped[int] = mapped_column(Integer)
    free_over_cents: Mapped[int | None] = mapped_column(Integer)
    active: Mapped[bool] = mapped_column(Boolean, default=True)


class Order(Base):
    __tablename__ = "orders"
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=uid)
    number: Mapped[str] = mapped_column(String(24), unique=True, index=True)
    user_id: Mapped[str] = mapped_column(ForeignKey("users.id"), index=True)
    status: Mapped[str] = mapped_column(String(30), default="pending_payment")
    subtotal_cents: Mapped[int] = mapped_column(Integer)
    shipping_cents: Mapped[int] = mapped_column(Integer)
    total_cents: Mapped[int] = mapped_column(Integer)
    currency: Mapped[str] = mapped_column(String(3), default="EUR")
    shipping_name: Mapped[str] = mapped_column(String(160))
    shipping_line1: Mapped[str] = mapped_column(String(240))
    shipping_line2: Mapped[str] = mapped_column(String(240), default="")
    shipping_city: Mapped[str] = mapped_column(String(120))
    shipping_postal_code: Mapped[str] = mapped_column(String(24))
    shipping_country: Mapped[str] = mapped_column(String(2))
    tracking_reference: Mapped[str | None] = mapped_column(String(120))
    tracking_carrier: Mapped[str | None] = mapped_column(String(120), nullable=True)
    tracking_url: Mapped[str | None] = mapped_column(String(500), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now)
    items: Mapped[list[OrderItem]] = relationship(cascade="all, delete-orphan", back_populates="order")
    status_events: Mapped[list[OrderStatusEvent]] = relationship(
        cascade="all, delete-orphan", back_populates="order", order_by="OrderStatusEvent.occurred_at"
    )
    user: Mapped[User] = relationship()


class OrderStatusEvent(Base):
    __tablename__ = "order_status_events"
    __table_args__ = (UniqueConstraint("order_id", "status", name="uq_order_status_event_order_status"),)
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=uid)
    order_id: Mapped[str] = mapped_column(ForeignKey("orders.id", ondelete="CASCADE"), index=True)
    status: Mapped[str] = mapped_column(String(30))
    source: Mapped[str] = mapped_column(String(20))
    actor_user_id: Mapped[str | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    occurred_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now, index=True)
    order: Mapped[Order] = relationship(back_populates="status_events")
    actor: Mapped[User | None] = relationship(foreign_keys=[actor_user_id])


class OrderItem(Base):
    __tablename__ = "order_items"
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=uid)
    order_id: Mapped[str] = mapped_column(ForeignKey("orders.id", ondelete="CASCADE"))
    book_id: Mapped[str] = mapped_column(ForeignKey("books.id"))
    title: Mapped[str] = mapped_column(String(240))
    isbn: Mapped[str] = mapped_column(String(20))
    cover_url: Mapped[str] = mapped_column(String(500))
    unit_price_cents: Mapped[int] = mapped_column(Integer)
    quantity: Mapped[int] = mapped_column(Integer)
    order: Mapped[Order] = relationship(back_populates="items")


class InventoryReservation(Base):
    __tablename__ = "inventory_reservations"
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=uid)
    order_id: Mapped[str] = mapped_column(ForeignKey("orders.id", ondelete="CASCADE"), index=True)
    book_id: Mapped[str] = mapped_column(ForeignKey("books.id"), index=True)
    quantity: Mapped[int] = mapped_column(Integer)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), index=True)
    consumed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    released_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))


class PaymentAttempt(Base):
    __tablename__ = "payment_attempts"
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=uid)
    order_id: Mapped[str] = mapped_column(ForeignKey("orders.id", ondelete="CASCADE"), index=True)
    provider: Mapped[str] = mapped_column(String(20))
    provider_reference: Mapped[str] = mapped_column(String(160), unique=True)
    status: Mapped[str] = mapped_column(String(30), default="created")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now)


class PaymentEvent(Base):
    __tablename__ = "payment_events"
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=uid)
    provider: Mapped[str] = mapped_column(String(20))
    external_id: Mapped[str] = mapped_column(String(180), unique=True)
    payload: Mapped[str] = mapped_column(Text)
    received_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now)


class OutboxMessage(Base):
    __tablename__ = "outbox_messages"
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=uid)
    to_email: Mapped[str] = mapped_column(String(320))
    subject: Mapped[str] = mapped_column(String(240))
    html_body: Mapped[str] = mapped_column(Text)
    attempts: Mapped[int] = mapped_column(Integer, default=0)
    next_attempt_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now)
    sent_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))


class MediaAsset(Base):
    __tablename__ = "media_assets"
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=uid)
    url: Mapped[str] = mapped_column(String(500))
    content_type: Mapped[str] = mapped_column(String(100))
    size_bytes: Mapped[int] = mapped_column(Integer)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now)
