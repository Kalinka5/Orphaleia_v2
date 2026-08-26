from datetime import datetime

from pydantic import BaseModel, EmailStr, Field, HttpUrl, field_validator


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
    image_url: str | None = None


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


class OrderSummary(BaseModel):
    id: str
    number: str
    status: str
    total_cents: int
    currency: str
    created_at: datetime
