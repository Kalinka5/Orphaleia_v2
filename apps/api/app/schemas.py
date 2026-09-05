from datetime import datetime
from typing import Literal
from urllib.parse import urlsplit

from pydantic import BaseModel, EmailStr, Field, HttpUrl, field_validator, model_validator


class RegisterInput(BaseModel):
    email: EmailStr
    full_name: str = Field(min_length=2, max_length=120)
    password: str = Field(min_length=10, max_length=128)


class LoginInput(BaseModel):
    # Login must accept already-provisioned accounts that use an internal
    # address such as the seeded admin@orphaleia.local account. Registration
    # still uses EmailStr and therefore keeps strict public-email validation.
    email: str = Field(min_length=3, max_length=320)
    password: str

    @field_validator("email")
    @classmethod
    def normalize_email(cls, value: str) -> str:
        return value.strip()


class EmailInput(BaseModel):
    email: EmailStr


class TokenInput(BaseModel):
    token: str


class ResetInput(TokenInput):
    password: str = Field(min_length=10, max_length=128)


class ProfileInput(BaseModel):
    full_name: str = Field(min_length=2, max_length=120)

    @field_validator("full_name")
    @classmethod
    def normalize_full_name(cls, value: str) -> str:
        normalized = " ".join(value.split())
        if len(normalized) < 2:
            raise ValueError("Display name must contain at least 2 characters")
        return normalized


class EmailChangeInput(BaseModel):
    email: EmailStr
    current_password: str


class PasswordChangeInput(BaseModel):
    current_password: str
    new_password: str = Field(min_length=10, max_length=128)


class RatingInput(BaseModel):
    value: int = Field(ge=1, le=5)


class CommentInput(BaseModel):
    body: str = Field(min_length=2, max_length=2000)


class CartItemInput(BaseModel):
    book_id: str
    quantity: int = Field(ge=1, le=20)


class AddressInput(BaseModel):
    name: str = Field(min_length=2, max_length=160)
    line1: str = Field(min_length=3, max_length=240)
    line2: str = Field(default="", max_length=240)
    city: str = Field(min_length=2, max_length=120)
    postal_code: str = Field(min_length=3, max_length=24)
    country: str = Field(min_length=2, max_length=2)

    @field_validator("country")
    @classmethod
    def uppercase_country(cls, value: str) -> str:
        return value.upper()


class CheckoutInput(BaseModel):
    address: AddressInput


class BookInput(BaseModel):
    title: str = Field(min_length=1, max_length=240)
    slug: str = Field(pattern=r"^[a-z0-9]+(?:-[a-z0-9]+)*$")
    isbn: str = Field(min_length=10, max_length=20)
    description: str = Field(min_length=20)
    publication_year: int = Field(ge=1450, le=2100)
    price_cents: int = Field(ge=0)
    stock_qty: int = Field(ge=0)
    cover_url: str
    interior_image_url: str | None = Field(default=None, max_length=500)
    interior_image_alt: str | None = Field(default=None, max_length=300)
    pull_quote: str | None = Field(default=None, max_length=280)
    video_url: HttpUrl | None = None
    featured: bool = False
    active: bool = True
    author_ids: list[str] = []
    genre_ids: list[str] = []

    @field_validator("video_url")
    @classmethod
    def validate_video(cls, value: HttpUrl | None):
        if value and value.host not in {"youtube.com", "www.youtube.com", "youtu.be", "vimeo.com", "www.vimeo.com"}:
            raise ValueError("Only YouTube and Vimeo links are supported")
        return value

    @model_validator(mode="after")
    def validate_editorial_image(self):
        self.interior_image_url = self.interior_image_url.strip() if self.interior_image_url else None
        self.interior_image_alt = self.interior_image_alt.strip() if self.interior_image_alt else None
        self.pull_quote = self.pull_quote.strip() if self.pull_quote else None
        if self.interior_image_url and not self.interior_image_alt:
            raise ValueError("Interior image alt text is required when an interior image is provided")
        if not self.interior_image_url:
            self.interior_image_alt = None
        return self


class OrderStatusInput(BaseModel):
    status: str
    tracking_reference: str | None = None


class ShippingZoneInput(BaseModel):
    name: str
    country_codes: list[str]
    rate_cents: int = Field(ge=0)
    free_over_cents: int | None = Field(default=None, ge=0)
    active: bool = True


class AuthorInput(BaseModel):
    name: str = Field(min_length=2, max_length=160)
    slug: str = Field(pattern=r"^[a-z0-9]+(?:-[a-z0-9]+)*$")
    bio: str = Field(default="", max_length=5000)
    image_url: str = Field(min_length=1, max_length=500)

    @field_validator("image_url")
    @classmethod
    def validate_image_url(cls, value: str) -> str:
        cleaned = value.strip()
        parsed = urlsplit(cleaned)
        if cleaned.startswith("/") and not cleaned.startswith("//"):
            return cleaned
        if parsed.scheme in {"http", "https"} and parsed.netloc:
            return cleaned
        raise ValueError("Portrait must use a root-relative path or an HTTP(S) URL")


class GenreInput(BaseModel):
    name: str = Field(min_length=2, max_length=100)
    slug: str = Field(pattern=r"^[a-z0-9]+(?:-[a-z0-9]+)*$")
    description: str = Field(default="", max_length=2000)


class RoleInput(BaseModel):
    role: str = Field(pattern="^(customer|admin)$")


class CommentVisibilityInput(BaseModel):
    visible: bool


class APIError(BaseModel):
    code: str
    message: str
    field_errors: dict[str, str] | None = None
    request_id: str | None = None


class YearPoint(BaseModel):
    year: int
    average: float
    count: int


class RankingFilterOption(BaseModel):
    value: str
    label: str


class SalesRankingSource(BaseModel):
    name: str
    url: str
    coverage_note: str
    methodology_note: str


class SalesRankingItem(BaseModel):
    rank: int
    title: str
    authors: list[str]
    genre: str
    units_sold: int
    isbn13: str | None = None
    catalog_slug: str | None = None


class SalesRankingResponse(BaseModel):
    status: Literal["published", "unavailable"]
    year: int | None = None
    market: str | None = None
    genre: str | None = None
    scope_label: str | None = None
    source: SalesRankingSource | None = None
    available_years: list[int] = Field(default_factory=list)
    available_markets: list[RankingFilterOption] = Field(default_factory=list)
    available_genres: list[RankingFilterOption] = Field(default_factory=list)
    items: list[SalesRankingItem] = Field(default_factory=list)


class OrderSummary(BaseModel):
    id: str
    number: str
    status: str
    total_cents: int
    currency: str
    created_at: datetime
