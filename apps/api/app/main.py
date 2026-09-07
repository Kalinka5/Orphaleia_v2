import json
import logging
import re
import secrets
import unicodedata
import uuid
from collections import defaultdict
from contextlib import asynccontextmanager
from datetime import UTC, datetime, timedelta
from pathlib import Path

import httpx
import stripe
from fastapi import Depends, FastAPI, File, HTTPException, Query, Request, Response, UploadFile
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from fastapi.staticfiles import StaticFiles
from sqlalchemy import func, or_, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session, selectinload

from .config import settings
from .database import Base, engine, get_db
from .email_templates import verification_email
from .models import (
    ActionToken,
    Author,
    Book,
    Cart,
    CartItem,
    Comment,
    Genre,
    InventoryReservation,
    MediaAsset,
    Order,
    OrderItem,
    PaymentAttempt,
    RankingDataset,
    RankingEntry,
    Rating,
    RatingEvent,
    RefreshSession,
    SavedAddress,
    ShippingZone,
    User,
)
from .schemas import (
    AddressInput,
    AuthorInput,
    BookInput,
    CartItemInput,
    CheckoutInput,
    CommentInput,
    CommentVisibilityInput,
    EmailChangeInput,
    EmailInput,
    GenreInput,
    LoginInput,
    OrderStatusInput,
    PasswordChangeInput,
    ProfileInput,
    RatingInput,
    RegisterInput,
    ResetInput,
    RoleInput,
    SalesRankingResponse,
    ShippingZoneInput,
    TokenInput,
)
from .security import (
    admin_user,
    clear_auth_cookies,
    create_session,
    current_user,
    hash_password,
    require_csrf,
    set_auth_cookies,
    token_hash,
    verified_user,
    verify_password,
)
from .serializers import author_out, book_out, genre_out, order_out
from .services import (
    PAID_ORDER_STATUSES,
    PROVIDERS,
    add_order_status_event,
    finalize_payment,
    queue_email,
    queue_order_status_email,
    reserved_quantity,
    shipping_quote,
)
from .storage import delete_avatar, save_avatar, save_image
from .throttle import throttle

logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(_: FastAPI):
    if settings.app_env in {"development", "test"}:
        Base.metadata.create_all(engine)
    yield


app = FastAPI(title="Orphaleia Book Shop API", version="1.0.0", lifespan=lifespan)
app.add_middleware(
    CORSMiddleware,
    allow_origins=[settings.frontend_url],
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allow_headers=["Content-Type", "X-CSRF-Token"],
)
Path(settings.media_dir).mkdir(parents=True, exist_ok=True)
app.mount("/media", StaticFiles(directory=settings.media_dir), name="media")


@app.middleware("http")
async def request_id_middleware(request: Request, call_next):
    request.state.request_id = request.headers.get("X-Request-ID", str(uuid.uuid4()))
    response = await call_next(request)
    response.headers["X-Request-ID"] = request.state.request_id
    return response


@app.exception_handler(HTTPException)
async def http_error(request: Request, exc: HTTPException):
    return JSONResponse(
        status_code=exc.status_code,
        content={"code": f"http_{exc.status_code}", "message": str(exc.detail), "request_id": request.state.request_id},
    )


@app.exception_handler(RequestValidationError)
async def validation_error(request: Request, exc: RequestValidationError):
    fields = {".".join(str(x) for x in err["loc"][1:]): err["msg"] for err in exc.errors()}
    return JSONResponse(
        status_code=422,
        content={"code": "validation_error", "message": "Check the highlighted fields", "field_errors": fields, "request_id": request.state.request_id},
    )


@app.get("/health")
def health(db: Session = Depends(get_db)):
    db.execute(select(1))
    return {"status": "ok", "service": "orphaleia-api"}


def user_out(user: User):
    address = user.default_shipping_address
    return {
        "id": user.id,
        "email": user.email,
        "pending_email": user.pending_email,
        "full_name": user.full_name,
        "avatar_url": user.avatar_url,
        "role": user.role,
        "is_verified": user.is_verified,
        "default_shipping_address": {
            "name": address.name,
            "line1": address.line1,
            "line2": address.line2,
            "city": address.city,
            "postal_code": address.postal_code,
            "country": address.country,
        }
        if address
        else None,
    }


def issue_action_token(db: Session, user: User, kind: str, hours: int) -> str:
    raw = secrets.token_urlsafe(36)
    db.add(ActionToken(user_id=user.id, kind=kind, token_hash=token_hash(raw), expires_at=datetime.now(UTC) + timedelta(hours=hours)))
    return raw


def invalidate_action_tokens(db: Session, user: User, kind: str) -> None:
    timestamp = datetime.now(UTC)
    for record in db.scalars(select(ActionToken).where(ActionToken.user_id == user.id, ActionToken.kind == kind, ActionToken.used_at.is_(None))):
        record.used_at = timestamp


def revoke_user_sessions(db: Session, user: User) -> None:
    timestamp = datetime.now(UTC)
    for session in db.scalars(select(RefreshSession).where(RefreshSession.user_id == user.id, RefreshSession.revoked_at.is_(None))):
        session.revoked_at = timestamp


def cleanup_avatar(db: Session, url: str | None) -> None:
    if not url:
        return
    try:
        delete_avatar(url)
        asset = db.scalar(select(MediaAsset).where(MediaAsset.url == url))
        if asset:
            db.delete(asset)
            db.commit()
    except Exception:
        db.rollback()
        logger.exception("Could not clean up replaced avatar")


def clear_user_avatar(db: Session, user: User):
    previous = user.avatar_url
    user.avatar_url = None
    db.commit()
    cleanup_avatar(db, previous)
    return user_out(user)


@app.post("/api/v1/auth/register", dependencies=[Depends(throttle(5, 60))])
def register(data: RegisterInput, db: Session = Depends(get_db)):
    if db.scalar(select(User).where(func.lower(User.email) == data.email.lower())):
        raise HTTPException(409, "An account already uses this email")
    user = User(email=data.email.lower(), full_name=data.full_name.strip(), password_hash=hash_password(data.password))
    db.add(user)
    db.flush()
    raw = issue_action_token(db, user, "verify", 24)
    url = f"{settings.frontend_url}/verify?token={raw}"
    queue_email(
        db,
        user.email,
        "Verify your Orphaleia account",
        verification_email(full_name=user.full_name, verification_url=url, frontend_url=settings.frontend_url),
    )
    db.commit()
    result = {"message": "Check your email to verify your account"}
    if settings.app_env == "development" and settings.mail_preview_url:
        result["email_preview_url"] = settings.mail_preview_url
    return result


@app.post("/api/v1/auth/verify")
def verify_email(data: TokenInput, db: Session = Depends(get_db)):
    record = db.scalar(select(ActionToken).where(ActionToken.kind == "verify", ActionToken.token_hash == token_hash(data.token)))
    if not record or record.used_at or record.expires_at.replace(tzinfo=UTC) < datetime.now(UTC):
        raise HTTPException(400, "Verification link is invalid or expired")
    user = db.get(User, record.user_id)
    user.is_verified = True
    record.used_at = datetime.now(UTC)
    db.commit()
    return {"message": "Email verified. You can now sign in."}


@app.post("/api/v1/auth/login", dependencies=[Depends(throttle(10, 60))])
def login(data: LoginInput, response: Response, db: Session = Depends(get_db)):
    user = db.scalar(select(User).where(func.lower(User.email) == data.email.lower()))
    if not user or not verify_password(data.password, user.password_hash):
        raise HTTPException(401, "Email or password is incorrect")
    access, refresh, csrf = create_session(db, user)
    set_auth_cookies(response, access, refresh, csrf)
    return {"user": user_out(user)}


@app.post("/api/v1/auth/refresh")
def refresh(request: Request, response: Response, db: Session = Depends(get_db)):
    raw = request.cookies.get("refresh_token")
    if not raw:
        raise HTTPException(401, "Refresh session not found")
    session = db.scalar(select(RefreshSession).where(RefreshSession.token_hash == token_hash(raw)))
    if not session or session.revoked_at or session.expires_at.replace(tzinfo=UTC) < datetime.now(UTC):
        raise HTTPException(401, "Refresh session expired")
    session.revoked_at = datetime.now(UTC)
    user = db.get(User, session.user_id)
    db.commit()
    access, next_refresh, csrf = create_session(db, user)
    set_auth_cookies(response, access, next_refresh, csrf)
    return {"user": user_out(user)}


@app.post("/api/v1/auth/logout", dependencies=[Depends(require_csrf)])
def logout(request: Request, response: Response, db: Session = Depends(get_db)):
    raw = request.cookies.get("refresh_token")
    if raw:
        session = db.scalar(select(RefreshSession).where(RefreshSession.token_hash == token_hash(raw)))
        if session:
            session.revoked_at = datetime.now(UTC)
            db.commit()
    clear_auth_cookies(response)
    return {"message": "Signed out"}


@app.post("/api/v1/auth/request-reset", dependencies=[Depends(throttle(5, 300))])
def request_reset(data: EmailInput, db: Session = Depends(get_db)):
    user = db.scalar(select(User).where(func.lower(User.email) == data.email.lower()))
    if user:
        raw = issue_action_token(db, user, "reset", 2)
        url = f"{settings.frontend_url}/reset-password?token={raw}"
        queue_email(db, user.email, "Reset your Orphaleia password", f"<p><a href=\"{url}\">Choose a new password</a>. This link expires in two hours.</p>")
        db.commit()
    return {"message": "If that account exists, a reset email is on its way"}


@app.post("/api/v1/auth/reset")
def reset_password(data: ResetInput, db: Session = Depends(get_db)):
    record = db.scalar(select(ActionToken).where(ActionToken.kind == "reset", ActionToken.token_hash == token_hash(data.token)))
    if not record or record.used_at or record.expires_at.replace(tzinfo=UTC) < datetime.now(UTC):
        raise HTTPException(400, "Reset link is invalid or expired")
    user = db.get(User, record.user_id)
    user.password_hash = hash_password(data.password)
    user.auth_version += 1
    record.used_at = datetime.now(UTC)
    revoke_user_sessions(db, user)
    queue_email(db, user.email, "Your Orphaleia password was changed", "<p>Your password was changed and all signed-in devices were logged out. If this was not you, request another password reset immediately.</p>")
    db.commit()
    return {"message": "Password updated"}


@app.get("/api/v1/users/me")
def me(user: User = Depends(current_user)):
    return user_out(user)


@app.patch("/api/v1/users/me/profile", dependencies=[Depends(require_csrf)])
def update_profile(data: ProfileInput, user: User = Depends(current_user), db: Session = Depends(get_db)):
    user.full_name = data.full_name
    db.commit()
    return user_out(user)


@app.put("/api/v1/users/me/delivery-address", dependencies=[Depends(require_csrf)])
def update_delivery_address(data: AddressInput, user: User = Depends(current_user), db: Session = Depends(get_db)):
    address = user.default_shipping_address
    if address is None:
        address = SavedAddress(user_id=user.id)
        user.default_shipping_address = address
    for field, value in data.model_dump().items():
        setattr(address, field, value)
    db.commit()
    return user_out(user)


@app.delete("/api/v1/users/me/delivery-address", dependencies=[Depends(require_csrf)])
def remove_delivery_address(user: User = Depends(current_user), db: Session = Depends(get_db)):
    if user.default_shipping_address is not None:
        user.default_shipping_address = None
        db.commit()
    return user_out(user)


@app.put("/api/v1/users/me/avatar", dependencies=[Depends(require_csrf), Depends(throttle(10, 600))])
async def update_avatar(file: UploadFile = File(...), user: User = Depends(current_user), db: Session = Depends(get_db)):
    content = await file.read()
    try:
        url, size = save_avatar(content, file.content_type or "", user.id)
    except ValueError as exc:
        raise HTTPException(422, str(exc)) from exc
    previous = user.avatar_url
    asset = MediaAsset(url=url, content_type="image/webp", size_bytes=size)
    db.add(asset)
    user.avatar_url = url
    try:
        db.commit()
    except Exception:
        db.rollback()
        try:
            delete_avatar(url)
        except Exception:
            logger.exception("Could not delete avatar after a failed profile update")
        raise
    cleanup_avatar(db, previous)
    return user_out(user)


@app.delete("/api/v1/users/me/avatar", dependencies=[Depends(require_csrf)])
def remove_avatar(user: User = Depends(current_user), db: Session = Depends(get_db)):
    return clear_user_avatar(db, user)


@app.post("/api/v1/users/me/email-change", status_code=202, dependencies=[Depends(require_csrf), Depends(throttle(5, 300))])
def request_email_change(data: EmailChangeInput, user: User = Depends(current_user), db: Session = Depends(get_db)):
    if not verify_password(data.current_password, user.password_hash):
        raise HTTPException(401, "Current password is incorrect")
    next_email = str(data.email).lower()
    if next_email == user.email:
        raise HTTPException(409, "Choose a different email address")
    existing = db.scalar(select(User).where(func.lower(User.email) == next_email, User.id != user.id))
    if existing:
        raise HTTPException(409, "An account already uses this email")
    invalidate_action_tokens(db, user, "email_change")
    user.pending_email = next_email
    raw = issue_action_token(db, user, "email_change", 2)
    url = f"{settings.frontend_url}/confirm-email-change?token={raw}"
    queue_email(db, next_email, "Confirm your new Orphaleia email", f'<p><a href="{url}">Confirm this email address</a>. This link expires in two hours.</p>')
    queue_email(db, user.email, "An email change was requested", "<p>A change to your Orphaleia sign-in email was requested. Your current address remains active until the new address is confirmed. If this was not you, change your password immediately.</p>")
    db.commit()
    result = {"message": "Check the new address to confirm the change"}
    if settings.app_env == "development" and settings.mail_preview_url:
        result["email_preview_url"] = settings.mail_preview_url
    return result


@app.delete("/api/v1/users/me/email-change", dependencies=[Depends(require_csrf)])
def cancel_email_change(user: User = Depends(current_user), db: Session = Depends(get_db)):
    invalidate_action_tokens(db, user, "email_change")
    user.pending_email = None
    db.commit()
    return user_out(user)


@app.post("/api/v1/auth/confirm-email-change")
def confirm_email_change(data: TokenInput, response: Response, db: Session = Depends(get_db)):
    record = db.scalar(select(ActionToken).where(ActionToken.kind == "email_change", ActionToken.token_hash == token_hash(data.token)))
    if not record or record.used_at or record.expires_at.replace(tzinfo=UTC) < datetime.now(UTC):
        raise HTTPException(400, "Email change link is invalid or expired")
    user = db.get(User, record.user_id)
    if not user or not user.pending_email:
        raise HTTPException(400, "Email change is no longer pending")
    existing = db.scalar(select(User).where(func.lower(User.email) == user.pending_email, User.id != user.id))
    if existing:
        raise HTTPException(409, "An account already uses this email")
    user.email = user.pending_email
    user.pending_email = None
    user.is_verified = True
    user.auth_version += 1
    record.used_at = datetime.now(UTC)
    revoke_user_sessions(db, user)
    try:
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        raise HTTPException(409, "An account already uses this email") from exc
    clear_auth_cookies(response)
    return {"message": "Email updated. Sign in again with your new address."}


@app.post("/api/v1/users/me/password", dependencies=[Depends(require_csrf), Depends(throttle(5, 300))])
def change_password(data: PasswordChangeInput, response: Response, user: User = Depends(current_user), db: Session = Depends(get_db)):
    if not verify_password(data.current_password, user.password_hash):
        raise HTTPException(401, "Current password is incorrect")
    user.password_hash = hash_password(data.new_password)
    user.auth_version += 1
    revoke_user_sessions(db, user)
    queue_email(db, user.email, "Your Orphaleia password was changed", "<p>Your password was changed and other signed-in devices were logged out. If this was not you, request a password reset immediately.</p>")
    db.commit()
    access, refresh_token, csrf = create_session(db, user)
    set_auth_cookies(response, access, refresh_token, csrf)
    return {"message": "Password updated. Other devices were signed out."}


def get_book_or_404(db: Session, identifier: str) -> Book:
    book = db.scalar(
        select(Book)
        .options(selectinload(Book.authors), selectinload(Book.genres))
        .where(or_(Book.id == identifier, Book.slug == identifier))
    )
    if not book:
        raise HTTPException(404, "Book not found")
    return book


@app.get("/api/v1/books")
def books(
    q: str | None = None,
    author: str | None = None,
    genre: str | None = None,
    year: int | None = None,
    available: bool | None = None,
    featured: bool | None = None,
    sort: str = "title",
    page: int = Query(1, ge=1),
    page_size: int = Query(12, ge=1, le=60),
    db: Session = Depends(get_db),
):
    stmt = select(Book).options(selectinload(Book.authors), selectinload(Book.genres)).where(Book.active.is_(True))
    if q:
        term = f"%{q.lower()}%"
        stmt = stmt.where(or_(func.lower(Book.title).like(term), func.lower(Book.description).like(term)))
    if author:
        stmt = stmt.join(Book.authors).where(or_(Author.slug == author, Author.id == author))
    if genre:
        stmt = stmt.join(Book.genres).where(or_(Genre.slug == genre, Genre.id == genre))
    if year:
        stmt = stmt.where(Book.publication_year == year)
    if available is True:
        stmt = stmt.where(Book.stock_qty > 0)
    if featured is not None:
        stmt = stmt.where(Book.featured == featured)
    rows = list(db.scalars(stmt.distinct()).all())
    data = [book_out(db, row) for row in rows]
    if sort == "rating":
        data.sort(key=lambda x: (-x["rating_average"], -x["rating_count"], x["title"]))
    elif sort == "price_low":
        data.sort(key=lambda x: (x["price_cents"], x["title"]))
    elif sort == "newest":
        data.sort(key=lambda x: (-x["publication_year"], x["title"]))
    else:
        data.sort(key=lambda x: x["title"])
    start = (page - 1) * page_size
    return {"items": data[start : start + page_size], "page": page, "page_size": page_size, "total": len(data)}


@app.get("/api/v1/books/{identifier}")
def book_detail(identifier: str, db: Session = Depends(get_db)):
    book = get_book_or_404(db, identifier)
    result = book_out(db, book, detailed=True)
    related = db.scalars(
        select(Book).join(Book.genres).where(Genre.id.in_([x.id for x in book.genres]), Book.id != book.id, Book.active.is_(True)).distinct().limit(4)
    ).all()
    result["related"] = [book_out(db, x) for x in related]
    return result


@app.get("/api/v1/authors")
def authors(db: Session = Depends(get_db)):
    stmt = select(Author).join(Author.books).where(Book.active.is_(True)).distinct().order_by(Author.name)
    return {"items": [author_out(x) for x in db.scalars(stmt).all()]}


@app.get("/api/v1/authors/{slug}")
def author_detail(slug: str, db: Session = Depends(get_db)):
    author = db.scalar(select(Author).options(selectinload(Author.books)).where(Author.slug == slug))
    if not author:
        raise HTTPException(404, "Author not found")
    return {**author_out(author), "books": [book_out(db, x) for x in author.books if x.active]}


@app.get("/api/v1/genres")
def genres(db: Session = Depends(get_db)):
    stmt = select(Genre).join(Genre.books).where(Book.active.is_(True)).distinct().order_by(Genre.name)
    return {"items": [genre_out(x) for x in db.scalars(stmt).all()]}


@app.get("/api/v1/genres/{slug}")
def genre_detail(slug: str, db: Session = Depends(get_db)):
    genre = db.scalar(select(Genre).options(selectinload(Genre.books)).where(Genre.slug == slug))
    if not genre:
        raise HTTPException(404, "Genre not found")
    return {**genre_out(genre), "books": [book_out(db, x) for x in genre.books if x.active]}


@app.get("/api/v1/rankings")
def rankings(publication_year: int, genre: str | None = None, author: str | None = None, db: Session = Depends(get_db)):
    payload = books(year=publication_year, genre=genre, author=author, sort="rating", page=1, page_size=60, db=db)
    return {"publication_year": publication_year, **payload}


def ranking_filter_value(value: str) -> str:
    normalized = unicodedata.normalize("NFKD", value).encode("ascii", "ignore").decode().lower()
    return re.sub(r"[^a-z0-9]+", "-", normalized).strip("-")


@app.get("/api/v1/rankings/sales", response_model=SalesRankingResponse)
def sales_rankings(
    year: int | None = Query(default=None, ge=1900, le=2100),
    market: str | None = None,
    genre: str | None = None,
    db: Session = Depends(get_db),
):
    published = list(
        db.scalars(
            select(RankingDataset)
            .where(RankingDataset.published_at.is_not(None), RankingDataset.exact_units_public.is_(True))
            .order_by(RankingDataset.year.desc(), RankingDataset.scope_label)
        ).all()
    )
    available_years = sorted({dataset.year for dataset in published}, reverse=True)
    selected_year = year if year is not None else (available_years[0] if available_years else None)
    year_datasets = [dataset for dataset in published if dataset.year == selected_year]
    available_markets = [{"value": dataset.scope_code, "label": dataset.scope_label} for dataset in year_datasets]
    selected_market = market
    if selected_market is None and year_datasets:
        selected_market = next(
            (dataset.scope_code for dataset in year_datasets if dataset.scope_code == "all-covered"),
            year_datasets[0].scope_code,
        )
    dataset = next((item for item in year_datasets if item.scope_code == selected_market), None)
    if dataset is None:
        return {
            "status": "unavailable",
            "year": selected_year,
            "market": selected_market,
            "genre": genre,
            "available_years": available_years,
            "available_markets": available_markets,
        }

    entries = list(
        db.scalars(
            select(RankingEntry)
            .options(selectinload(RankingEntry.catalog_book))
            .where(RankingEntry.dataset_id == dataset.id)
            .order_by(RankingEntry.units_sold.desc(), RankingEntry.title)
        ).all()
    )
    genre_names = sorted({entry.genre for entry in entries}, key=str.casefold)
    available_genres = [{"value": ranking_filter_value(name), "label": name} for name in genre_names]
    if genre:
        entries = [entry for entry in entries if ranking_filter_value(entry.genre) == genre]

    return {
        "status": "published",
        "year": dataset.year,
        "market": dataset.scope_code,
        "genre": genre,
        "scope_label": dataset.scope_label,
        "source": {
            "name": dataset.source_name,
            "url": dataset.source_url,
            "coverage_note": dataset.coverage_note,
            "methodology_note": dataset.methodology_note,
        },
        "available_years": available_years,
        "available_markets": available_markets,
        "available_genres": available_genres,
        "items": [
            {
                "rank": rank,
                "title": entry.title,
                "authors": json.loads(entry.authors_json),
                "genre": entry.genre,
                "units_sold": entry.units_sold,
                "isbn13": entry.isbn13,
                "catalog_slug": entry.catalog_book.slug if entry.catalog_book and entry.catalog_book.active else None,
            }
            for rank, entry in enumerate(entries, start=1)
        ],
    }


@app.put("/api/v1/books/{book_id}/ratings", dependencies=[Depends(require_csrf), Depends(throttle(20, 60))])
def rate_book(book_id: str, data: RatingInput, user: User = Depends(verified_user), db: Session = Depends(get_db)):
    get_book_or_404(db, book_id)
    rating = db.scalar(select(Rating).where(Rating.book_id == book_id, Rating.user_id == user.id))
    if rating:
        rating.value = data.value
        rating.updated_at = datetime.now(UTC)
    else:
        rating = Rating(book_id=book_id, user_id=user.id, value=data.value)
        db.add(rating)
    db.add(RatingEvent(book_id=book_id, user_id=user.id, value=data.value))
    db.commit()
    return {"value": data.value, "book": book_out(db, get_book_or_404(db, book_id))}


@app.get("/api/v1/books/{book_id}/rating-trend")
def rating_trend(book_id: str, db: Session = Depends(get_db)):
    get_book_or_404(db, book_id)
    events = db.scalars(select(RatingEvent).where(RatingEvent.book_id == book_id).order_by(RatingEvent.created_at)).all()
    if not events:
        return {"book_id": book_id, "points": []}
    latest: dict[str, int] = {}
    by_year: dict[int, list[RatingEvent]] = defaultdict(list)
    for event in events:
        by_year[event.created_at.year].append(event)
    points = []
    for year in range(min(by_year), datetime.now(UTC).year + 1):
        for event in by_year.get(year, []):
            latest[event.user_id] = event.value
        if latest:
            points.append({"year": year, "average": round(sum(latest.values()) / len(latest), 2), "count": len(latest)})
    return {"book_id": book_id, "points": points}


@app.post("/api/v1/books/{book_id}/comments", dependencies=[Depends(require_csrf), Depends(throttle(8, 60))])
def comment(book_id: str, data: CommentInput, user: User = Depends(verified_user), db: Session = Depends(get_db)):
    get_book_or_404(db, book_id)
    item = Comment(book_id=book_id, user_id=user.id, body=data.body.strip())
    db.add(item)
    db.commit()
    db.refresh(item)
    return {"id": item.id, "body": item.body, "created_at": item.created_at, "author": user.full_name, "author_avatar_url": user.avatar_url}


def get_cart(db: Session, user: User) -> Cart:
    cart = db.scalar(select(Cart).options(selectinload(Cart.items).selectinload(CartItem.book)).where(Cart.user_id == user.id))
    if not cart:
        cart = Cart(user_id=user.id)
        db.add(cart)
        db.commit()
        db.refresh(cart)
    return cart


def cart_out(cart: Cart):
    items = [
        {"id": x.id, "book_id": x.book_id, "quantity": x.quantity, "book": {"title": x.book.title, "slug": x.book.slug, "cover_url": x.book.cover_url, "price_cents": x.book.price_cents, "stock_qty": x.book.stock_qty}}
        for x in cart.items
    ]
    return {"id": cart.id, "items": items, "subtotal_cents": sum(x["book"]["price_cents"] * x["quantity"] for x in items), "currency": "EUR"}


@app.get("/api/v1/cart")
def read_cart(user: User = Depends(current_user), db: Session = Depends(get_db)):
    return cart_out(get_cart(db, user))


@app.post("/api/v1/cart/items", dependencies=[Depends(require_csrf)])
def add_cart_item(data: CartItemInput, user: User = Depends(verified_user), db: Session = Depends(get_db)):
    book = get_book_or_404(db, data.book_id)
    if book.stock_qty < data.quantity:
        raise HTTPException(409, "Requested quantity is not available")
    cart = get_cart(db, user)
    item = db.scalar(select(CartItem).where(CartItem.cart_id == cart.id, CartItem.book_id == book.id))
    if item:
        item.quantity = min(item.quantity + data.quantity, 20)
    else:
        db.add(CartItem(cart_id=cart.id, book_id=book.id, quantity=data.quantity))
    db.commit()
    return cart_out(get_cart(db, user))


@app.put("/api/v1/cart/items/{item_id}", dependencies=[Depends(require_csrf)])
def update_cart_item(item_id: str, data: CartItemInput, user: User = Depends(verified_user), db: Session = Depends(get_db)):
    cart = get_cart(db, user)
    item = db.scalar(select(CartItem).where(CartItem.id == item_id, CartItem.cart_id == cart.id))
    if not item:
        raise HTTPException(404, "Cart item not found")
    item.quantity = data.quantity
    db.commit()
    return cart_out(get_cart(db, user))


@app.delete("/api/v1/cart/items/{item_id}", dependencies=[Depends(require_csrf)])
def delete_cart_item(item_id: str, user: User = Depends(verified_user), db: Session = Depends(get_db)):
    cart = get_cart(db, user)
    item = db.scalar(select(CartItem).where(CartItem.id == item_id, CartItem.cart_id == cart.id))
    if item:
        db.delete(item)
        db.commit()
    return cart_out(get_cart(db, user))


@app.post("/api/v1/checkout/quote")
def checkout_quote(data: CheckoutInput, user: User = Depends(verified_user), db: Session = Depends(get_db)):
    cart = get_cart(db, user)
    if not cart.items:
        raise HTTPException(422, "Your cart is empty")
    return shipping_quote(db, cart, data.address.country)


@app.post("/api/v1/orders", dependencies=[Depends(require_csrf)])
def create_order(data: CheckoutInput, user: User = Depends(verified_user), db: Session = Depends(get_db)):
    cart = get_cart(db, user)
    if not cart.items:
        raise HTTPException(422, "Your cart is empty")
    quote = shipping_quote(db, cart, data.address.country)
    for item in cart.items:
        available = item.book.stock_qty - reserved_quantity(db, item.book_id)
        if available < item.quantity:
            raise HTTPException(409, f"Only {max(available, 0)} copies of {item.book.title} remain")
    number = f"ORP-{datetime.now(UTC):%y%m%d}-{secrets.token_hex(2).upper()}"
    address = data.address
    order = Order(
        number=number,
        user_id=user.id,
        subtotal_cents=quote["subtotal_cents"],
        shipping_cents=quote["shipping_cents"],
        total_cents=quote["total_cents"],
        shipping_name=address.name,
        shipping_line1=address.line1,
        shipping_line2=address.line2,
        shipping_city=address.city,
        shipping_postal_code=address.postal_code,
        shipping_country=address.country,
    )
    db.add(order)
    db.flush()
    expires = datetime.now(UTC) + timedelta(minutes=settings.reservation_minutes)
    for item in cart.items:
        db.add(OrderItem(order_id=order.id, book_id=item.book_id, title=item.book.title, isbn=item.book.isbn, cover_url=item.book.cover_url, unit_price_cents=item.book.price_cents, quantity=item.quantity))
        db.add(InventoryReservation(order_id=order.id, book_id=item.book_id, quantity=item.quantity, expires_at=expires))
    db.commit()
    return order_out(
        db.scalar(
            select(Order)
            .options(selectinload(Order.items), selectinload(Order.status_events))
            .where(Order.id == order.id)
        )
    )


@app.get("/api/v1/orders")
def orders_for_user(user: User = Depends(current_user), db: Session = Depends(get_db)):
    rows = db.scalars(
        select(Order)
        .options(selectinload(Order.items), selectinload(Order.status_events))
        .where(Order.user_id == user.id)
        .order_by(Order.created_at.desc())
    ).all()
    return {"items": [order_out(x) for x in rows]}


@app.get("/api/v1/orders/{order_id}")
def order_for_user(order_id: str, user: User = Depends(current_user), db: Session = Depends(get_db)):
    order = db.scalar(
        select(Order)
        .options(selectinload(Order.items), selectinload(Order.status_events))
        .where(Order.id == order_id)
    )
    if not order or (order.user_id != user.id and user.role != "admin"):
        raise HTTPException(404, "Order not found")
    return order_out(order)


@app.post("/api/v1/payments/{provider}/start", dependencies=[Depends(require_csrf)])
async def start_payment(provider: str, order_id: str, user: User = Depends(verified_user), db: Session = Depends(get_db)):
    if provider not in PROVIDERS:
        raise HTTPException(404, "Payment provider not supported")
    order = db.scalar(select(Order).options(selectinload(Order.user)).where(Order.id == order_id, Order.user_id == user.id))
    if not order or order.status != "pending_payment":
        raise HTTPException(409, "This order cannot be paid")
    return await PROVIDERS[provider].start(db, order)


@app.post("/api/v1/payments/{provider}/complete", dependencies=[Depends(require_csrf)])
async def complete_payment(provider: str, order_id: str, reference: str, user: User = Depends(verified_user), db: Session = Depends(get_db)):
    attempt = db.scalar(select(PaymentAttempt).where(PaymentAttempt.provider == provider, PaymentAttempt.provider_reference == reference, PaymentAttempt.order_id == order_id))
    order = db.scalar(select(Order).options(selectinload(Order.user)).where(Order.id == order_id, Order.user_id == user.id))
    if not attempt or not order:
        raise HTTPException(404, "Payment attempt not found")
    if settings.payments_mock:
        event_id = f"mock:{reference}"
        payload = {"reference": reference, "status": "completed"}
    elif provider == "stripe":
        stripe.api_key = settings.stripe_secret_key
        session = stripe.checkout.Session.retrieve(reference)
        if session.payment_status != "paid" or session.client_reference_id != order.id:
            raise HTTPException(409, "Stripe has not confirmed this payment")
        event_id = f"stripe-return:{reference}"
        payload = session.to_dict_recursive()
    elif provider == "paypal":
        paypal = PROVIDERS["paypal"]
        token = await paypal._token()
        async with httpx.AsyncClient() as client:
            response = await client.post(
                f"{settings.paypal_base_url}/v2/checkout/orders/{reference}/capture",
                headers={"Authorization": f"Bearer {token}", "Content-Type": "application/json"},
            )
            if response.status_code >= 400:
                raise HTTPException(409, "PayPal could not capture this payment")
            payload = response.json()
        if payload.get("status") != "COMPLETED":
            raise HTTPException(409, "PayPal has not confirmed this payment")
        event_id = f"paypal-capture:{payload['id']}"
    else:
        raise HTTPException(404, "Payment provider not supported")
    finalize_payment(db, order, provider, event_id, payload)
    cart = get_cart(db, user)
    for item in list(cart.items):
        db.delete(item)
    db.commit()
    return order_out(
        db.scalar(
            select(Order)
            .options(selectinload(Order.items), selectinload(Order.status_events))
            .where(Order.id == order.id)
        )
    )


@app.post("/api/v1/webhooks/stripe")
async def stripe_webhook(request: Request, db: Session = Depends(get_db)):
    raw = await request.body()
    if settings.payments_mock:
        event = json.loads(raw or b"{}")
    else:
        try:
            event = stripe.Webhook.construct_event(raw, request.headers.get("stripe-signature", ""), settings.stripe_webhook_secret)
        except Exception as exc:
            raise HTTPException(400, "Invalid Stripe signature") from exc
    if event.get("type") == "checkout.session.completed":
        obj = event["data"]["object"]
        order = db.scalar(select(Order).options(selectinload(Order.user)).where(Order.id == obj.get("metadata", {}).get("order_id")))
        if order:
            payload = event.to_dict_recursive() if hasattr(event, "to_dict_recursive") else event
            finalize_payment(db, order, "stripe", event["id"], payload)
    return {"received": True}


@app.post("/api/v1/webhooks/paypal")
async def paypal_webhook(request: Request, db: Session = Depends(get_db)):
    event = await request.json()
    if not settings.payments_mock:
        provider = PROVIDERS["paypal"]
        token = await provider._token()
        verify_payload = {
            "auth_algo": request.headers.get("paypal-auth-algo"),
            "cert_url": request.headers.get("paypal-cert-url"),
            "transmission_id": request.headers.get("paypal-transmission-id"),
            "transmission_sig": request.headers.get("paypal-transmission-sig"),
            "transmission_time": request.headers.get("paypal-transmission-time"),
            "webhook_id": settings.paypal_webhook_id,
            "webhook_event": event,
        }
        async with httpx.AsyncClient() as client:
            check = await client.post(f"{settings.paypal_base_url}/v1/notifications/verify-webhook-signature", headers={"Authorization": f"Bearer {token}"}, json=verify_payload)
            if check.status_code >= 400 or check.json().get("verification_status") != "SUCCESS":
                raise HTTPException(400, "Invalid PayPal signature")
    if event.get("event_type") == "PAYMENT.CAPTURE.COMPLETED":
        reference = event["resource"].get("supplementary_data", {}).get("related_ids", {}).get("order_id")
        attempt = db.scalar(select(PaymentAttempt).where(PaymentAttempt.provider_reference == reference))
        if attempt:
            order = db.scalar(select(Order).options(selectinload(Order.user)).where(Order.id == attempt.order_id))
            finalize_payment(db, order, "paypal", event["id"], event)
    return {"received": True}


@app.get("/api/v1/admin/overview")
def admin_overview(_: User = Depends(admin_user), db: Session = Depends(get_db)):
    return {
        "books": db.scalar(select(func.count(Book.id))),
        "customers": db.scalar(select(func.count(User.id)).where(User.role == "customer")),
        "open_orders": db.scalar(
            select(func.count(Order.id)).where(
                Order.status.in_(["paid", "processing", "shipped", "out_for_delivery"])
            )
        ),
        "hidden_comments": db.scalar(select(func.count(Comment.id)).where(Comment.visible.is_(False))),
    }


@app.get("/api/v1/admin/books")
def admin_books(_: User = Depends(admin_user), db: Session = Depends(get_db)):
    rows = db.scalars(select(Book).options(selectinload(Book.authors), selectinload(Book.genres)).order_by(Book.title)).all()
    return {"items": [book_out(db, x) for x in rows]}


@app.post("/api/v1/admin/authors", dependencies=[Depends(require_csrf)])
def create_author(data: AuthorInput, _: User = Depends(admin_user), db: Session = Depends(get_db)):
    author = Author(name=data.name, slug=data.slug, bio=data.bio, image_url=data.image_url)
    db.add(author)
    try:
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        raise HTTPException(409, "Author slug already exists") from exc
    return author_out(author)


@app.put("/api/v1/admin/authors/{author_id}", dependencies=[Depends(require_csrf)])
def update_author(author_id: str, data: AuthorInput, _: User = Depends(admin_user), db: Session = Depends(get_db)):
    author = db.get(Author, author_id)
    if not author:
        raise HTTPException(404, "Author not found")
    author.name, author.slug, author.bio, author.image_url = data.name, data.slug, data.bio, data.image_url
    db.commit()
    return author_out(author)


@app.delete("/api/v1/admin/authors/{author_id}", dependencies=[Depends(require_csrf)])
def delete_author(author_id: str, _: User = Depends(admin_user), db: Session = Depends(get_db)):
    author = db.get(Author, author_id)
    if not author:
        raise HTTPException(404, "Author not found")
    if author.books:
        raise HTTPException(409, "Move this author's books before deleting the author")
    db.delete(author)
    db.commit()
    return {"message": "Author deleted"}


@app.post("/api/v1/admin/genres", dependencies=[Depends(require_csrf)])
def create_genre(data: GenreInput, _: User = Depends(admin_user), db: Session = Depends(get_db)):
    genre = Genre(name=data.name, slug=data.slug, description=data.description)
    db.add(genre)
    try:
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        raise HTTPException(409, "Genre name or slug already exists") from exc
    return genre_out(genre)


@app.put("/api/v1/admin/genres/{genre_id}", dependencies=[Depends(require_csrf)])
def update_genre(genre_id: str, data: GenreInput, _: User = Depends(admin_user), db: Session = Depends(get_db)):
    genre = db.get(Genre, genre_id)
    if not genre:
        raise HTTPException(404, "Genre not found")
    genre.name, genre.slug, genre.description = data.name, data.slug, data.description
    db.commit()
    return genre_out(genre)


@app.delete("/api/v1/admin/genres/{genre_id}", dependencies=[Depends(require_csrf)])
def delete_genre(genre_id: str, _: User = Depends(admin_user), db: Session = Depends(get_db)):
    genre = db.get(Genre, genre_id)
    if not genre:
        raise HTTPException(404, "Genre not found")
    if genre.books:
        raise HTTPException(409, "Move books off this shelf before deleting the genre")
    db.delete(genre)
    db.commit()
    return {"message": "Genre deleted"}


def apply_book_input(db: Session, book: Book, data: BookInput):
    for field in ("title", "slug", "isbn", "description", "publication_year", "price_cents", "stock_qty", "cover_url", "interior_image_url", "interior_image_alt", "pull_quote", "featured", "active"):
        setattr(book, field, getattr(data, field))
    book.video_url = str(data.video_url) if data.video_url else None
    book.authors = list(db.scalars(select(Author).where(Author.id.in_(data.author_ids))).all()) if data.author_ids else []
    book.genres = list(db.scalars(select(Genre).where(Genre.id.in_(data.genre_ids))).all()) if data.genre_ids else []


@app.post("/api/v1/admin/books", dependencies=[Depends(require_csrf)])
def create_book(data: BookInput, _: User = Depends(admin_user), db: Session = Depends(get_db)):
    book = Book(title=data.title, slug=data.slug, isbn=data.isbn, description=data.description, publication_year=data.publication_year, price_cents=data.price_cents, stock_qty=data.stock_qty, cover_url=data.cover_url)
    db.add(book)
    apply_book_input(db, book, data)
    try:
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        raise HTTPException(409, "Slug or ISBN already exists") from exc
    return book_out(db, get_book_or_404(db, book.id))


@app.put("/api/v1/admin/books/{book_id}", dependencies=[Depends(require_csrf)])
def update_book(book_id: str, data: BookInput, _: User = Depends(admin_user), db: Session = Depends(get_db)):
    book = get_book_or_404(db, book_id)
    apply_book_input(db, book, data)
    db.commit()
    return book_out(db, book)


@app.get("/api/v1/admin/orders")
def admin_orders(_: User = Depends(admin_user), db: Session = Depends(get_db)):
    rows = db.scalars(
        select(Order)
        .options(selectinload(Order.items), selectinload(Order.status_events))
        .order_by(Order.created_at.desc())
    ).all()
    return {"items": [order_out(x) for x in rows]}


@app.patch("/api/v1/admin/orders/{order_id}", dependencies=[Depends(require_csrf)])
def admin_order_status(
    order_id: str,
    data: OrderStatusInput,
    staff: User = Depends(admin_user),
    db: Session = Depends(get_db),
):
    order = db.scalar(
        select(Order)
        .options(selectinload(Order.items), selectinload(Order.user), selectinload(Order.status_events))
        .where(Order.id == order_id)
        .with_for_update()
    )
    if not order:
        raise HTTPException(404, "Order not found")

    target = data.status
    if target == order.status:
        raise HTTPException(409, "Order is already in this status")
    if order.status in {"cancelled", "refunded", "delivered"}:
        raise HTTPException(409, "This order is in a terminal status")

    normal_next = {
        "paid": "processing",
        "processing": "shipped",
        "shipped": "out_for_delivery",
        "out_for_delivery": "delivered",
    }
    allowed = target == normal_next.get(order.status)
    if order.status == "pending_payment" and target == "cancelled":
        allowed = True
    if order.status in PAID_ORDER_STATUSES - {"refunded", "delivered"} and target == "refunded":
        allowed = True
    if not allowed:
        raise HTTPException(409, "This status is not the next valid step for the order")

    if target == "shipped":
        order.tracking_reference = data.tracking_reference
        order.tracking_carrier = data.tracking_carrier
        order.tracking_url = str(data.tracking_url) if data.tracking_url else None
    elif target == "cancelled":
        reservations = db.scalars(
            select(InventoryReservation).where(
                InventoryReservation.order_id == order.id,
                InventoryReservation.consumed_at.is_(None),
                InventoryReservation.released_at.is_(None),
            )
        ).all()
        for reservation in reservations:
            reservation.released_at = datetime.now(UTC)

    order.status = target
    add_order_status_event(db, order, target, "admin", staff.id)
    queue_order_status_email(db, order, target)
    db.commit()
    return order_out(order)


@app.get("/api/v1/admin/comments")
def admin_comments(_: User = Depends(admin_user), db: Session = Depends(get_db)):
    rows = db.scalars(select(Comment).options(selectinload(Comment.user), selectinload(Comment.book)).order_by(Comment.created_at.desc())).all()
    return {"items": [{"id": x.id, "body": x.body, "visible": x.visible, "created_at": x.created_at, "author": x.user.full_name, "book": x.book.title} for x in rows]}


@app.patch("/api/v1/admin/comments/{comment_id}", dependencies=[Depends(require_csrf)])
def moderate_comment(comment_id: str, data: CommentVisibilityInput, _: User = Depends(admin_user), db: Session = Depends(get_db)):
    item = db.get(Comment, comment_id)
    if not item:
        raise HTTPException(404, "Comment not found")
    item.visible = data.visible
    db.commit()
    return {"id": item.id, "visible": item.visible}


@app.get("/api/v1/admin/shipping-zones")
def admin_shipping_zones(_: User = Depends(admin_user), db: Session = Depends(get_db)):
    return {"items": [{"id": x.id, "name": x.name, "country_codes": x.country_codes.split(","), "rate_cents": x.rate_cents, "free_over_cents": x.free_over_cents, "active": x.active} for x in db.scalars(select(ShippingZone)).all()]}


@app.post("/api/v1/admin/shipping-zones", dependencies=[Depends(require_csrf)])
def create_shipping_zone(data: ShippingZoneInput, _: User = Depends(admin_user), db: Session = Depends(get_db)):
    zone = ShippingZone(name=data.name, country_codes=",".join(x.upper() for x in data.country_codes), rate_cents=data.rate_cents, free_over_cents=data.free_over_cents, active=data.active)
    db.add(zone)
    db.commit()
    return {"id": zone.id, "name": zone.name}


@app.put("/api/v1/admin/shipping-zones/{zone_id}", dependencies=[Depends(require_csrf)])
def update_shipping_zone(zone_id: str, data: ShippingZoneInput, _: User = Depends(admin_user), db: Session = Depends(get_db)):
    zone = db.get(ShippingZone, zone_id)
    if not zone:
        raise HTTPException(404, "Shipping zone not found")
    zone.name = data.name
    zone.country_codes = ",".join(x.upper() for x in data.country_codes)
    zone.rate_cents = data.rate_cents
    zone.free_over_cents = data.free_over_cents
    zone.active = data.active
    db.commit()
    return {"id": zone.id, "name": zone.name}


@app.get("/api/v1/admin/users")
def admin_users(_: User = Depends(admin_user), db: Session = Depends(get_db)):
    return {"items": [user_out(x) for x in db.scalars(select(User).order_by(User.created_at.desc())).all()]}


@app.patch("/api/v1/admin/users/{user_id}", dependencies=[Depends(require_csrf)])
def admin_role(user_id: str, data: RoleInput, current: User = Depends(admin_user), db: Session = Depends(get_db)):
    user = db.get(User, user_id)
    if not user:
        raise HTTPException(404, "User not found")
    if user.id == current.id and data.role != "admin":
        raise HTTPException(409, "You cannot remove your own admin access")
    user.role = data.role
    db.commit()
    return user_out(user)


@app.delete("/api/v1/admin/users/{user_id}/avatar", dependencies=[Depends(require_csrf)])
def admin_remove_avatar(user_id: str, _: User = Depends(admin_user), db: Session = Depends(get_db)):
    user = db.get(User, user_id)
    if not user:
        raise HTTPException(404, "User not found")
    return clear_user_avatar(db, user)


@app.post("/api/v1/admin/media", dependencies=[Depends(require_csrf)])
async def upload_media(file: UploadFile = File(...), _: User = Depends(admin_user), db: Session = Depends(get_db)):
    content = await file.read()
    try:
        url, size = save_image(content, file.content_type or "")
    except ValueError as exc:
        raise HTTPException(422, str(exc)) from exc
    asset = MediaAsset(url=url, content_type="image/webp", size_bytes=size)
    db.add(asset)
    db.commit()
    return {"id": asset.id, "url": url, "content_type": asset.content_type, "size_bytes": size}
