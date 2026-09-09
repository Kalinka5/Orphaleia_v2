from datetime import UTC, datetime

from sqlalchemy import select, update
from sqlalchemy.orm import Session

from .config import settings
from .database import Base, SessionLocal, engine
from .models import (
    ActionToken,
    Author,
    Book,
    Comment,
    Genre,
    Rating,
    RatingEvent,
    RefreshSession,
    ShippingZone,
    User,
)
from .security import hash_password, verify_password

LEGACY_CATALOG_SLUGS = {
    "the-cartographer-of-ithaca",
    "salt-in-the-oracle",
    "a-house-for-the-north-wind",
    "the-bronze-swallow",
    "olivewood-astronomy",
    "letters-from-the-wine-dark-sea",
}

FEATURED_SLUGS = (
    "romeo-and-juliet",
    "the-adventures-of-sherlock-holmes",
    "the-little-prince",
    "twenty-thousand-leagues-under-the-sea",
)

AUTHORS = {
    "william-shakespeare": {
        "name": "William Shakespeare",
        "bio": "English playwright and poet whose tragedies, comedies, and histories shaped literature in English.",
    },
    "f-scott-fitzgerald": {
        "name": "F. Scott Fitzgerald",
        "bio": "American novelist and short-story writer known for chronicling ambition and excess during the Jazz Age.",
    },
    "emily-bronte": {
        "name": "Emily Brontë",
        "bio": "English novelist and poet whose only novel became a landmark of Gothic and Romantic fiction.",
    },
    "arthur-conan-doyle": {
        "name": "Arthur Conan Doyle",
        "bio": "Scottish writer and physician who created Sherlock Holmes and helped define modern detective fiction.",
    },
    "antoine-de-saint-exupery": {
        "name": "Antoine de Saint-Exupéry",
        "bio": "French writer and aviator whose fiction joins adventure, friendship, responsibility, and wonder.",
    },
    "lewis-carroll": {
        "name": "Lewis Carroll",
        "bio": "English author, poet, and mathematician celebrated for playful logic and imaginative nonsense.",
    },
    "jm-barrie": {
        "name": "J. M. Barrie",
        "bio": "Scottish novelist and playwright best known for creating Peter Pan and the world of Neverland.",
    },
    "oscar-wilde": {
        "name": "Oscar Wilde",
        "bio": "Irish playwright, poet, and novelist renowned for wit, social observation, and aesthetic philosophy.",
    },
    "jules-verne": {
        "name": "Jules Verne",
        "bio": "French novelist whose voyages of scientific imagination helped establish modern science fiction.",
    },
    "jrr-tolkien": {
        "name": "J. R. R. Tolkien",
        "bio": "English writer and scholar whose Middle-earth stories transformed modern fantasy literature.",
    },
    "george-orwell": {
        "name": "George Orwell",
        "bio": "English novelist and essayist whose work examines power, language, class, and political control.",
    },
    "jk-rowling": {
        "name": "J. K. Rowling",
        "bio": "British author best known for the Harry Potter novels about friendship, courage, and a hidden magical world.",
    },
    "l-frank-baum": {
        "name": "L. Frank Baum",
        "bio": "American author whose Oz stories joined homespun adventure, inventive fantasy, and an enduring belief in found courage.",
    },
}

GENRES = {
    "romance": ("Romance", "Stories centered on love, longing, intimacy, and the choices relationships demand."),
    "tragedy": ("Tragedy", "Dramatic stories in which desire, fate, and human error carry lasting consequences."),
    "literary-fiction": ("Literary Fiction", "Character-rich fiction attentive to language, memory, society, and inner life."),
    "gothic-fiction": ("Gothic Fiction", "Haunted places, turbulent emotions, and secrets that refuse to remain buried."),
    "mystery-crime": ("Mystery & Crime", "Investigations, hidden motives, and puzzles solved through observation and reason."),
    "childrens-literature": ("Children’s Literature", "Imaginative stories written for young readers and loved across generations."),
    "philosophical-fiction": ("Philosophical Fiction", "Fiction that explores meaning, morality, identity, and what makes a life matter."),
    "fantasy": ("Fantasy", "Journeys through invented worlds where wonder, danger, and myth reshape the possible."),
    "psychological-thriller": ("Psychological Thriller", "Tense explorations of obsession, identity, fear, and unreliable perception."),
    "dark-fantasy": ("Dark Fantasy", "Supernatural stories where beauty, corruption, and dread share the same shadow."),
    "science-fiction": ("Science Fiction", "Speculative voyages shaped by invention, discovery, and unfamiliar futures."),
    "adventure": ("Adventure", "Bold journeys into the unknown, driven by danger, discovery, and transformation."),
    "dystopian-fiction": ("Dystopian Fiction", "Imagined societies that expose the costs of control, conformity, and lost freedom."),
    "young-adult": ("Young Adult", "Coming-of-age stories about identity, belonging, courage, and first independence."),
}

CATALOG = [
    {
        "title": "Romeo and Juliet", "slug": "romeo-and-juliet", "isbn": "9780000002001",
        "year": 1597, "price": 1490, "stock": 24, "cover": "/covers/romeo-and-juliet.webp",
        "author": "william-shakespeare", "genres": ["romance", "tragedy"],
        "description": "Two young people from rival Verona families fall in love and risk everything for a future beyond an inherited feud. Shakespeare's tragedy made the star-crossed lovers story immortal.",
    },
    {
        "title": "The Great Gatsby", "slug": "the-great-gatsby", "isbn": "9780000002002",
        "year": 1925, "price": 1690, "stock": 18, "cover": "/covers/the-great-gatsby.webp",
        "author": "f-scott-fitzgerald", "genres": ["literary-fiction", "romance"],
        "description": "On Long Island during the glittering 1920s, a mysterious millionaire pursues an old love across a gulf of wealth, reinvention, and illusion.",
    },
    {
        "title": "Wuthering Heights", "slug": "wuthering-heights", "isbn": "9780000002003",
        "year": 1847, "price": 1590, "stock": 16, "cover": "/covers/wuthering-heights.webp",
        "author": "emily-bronte", "genres": ["gothic-fiction", "romance"],
        "description": "Across the Yorkshire moors, the fierce bond between Catherine Earnshaw and Heathcliff becomes a legacy of passion, revenge, and grief.",
    },
    {
        "title": "The Adventures of Sherlock Holmes", "slug": "the-adventures-of-sherlock-holmes",
        "isbn": "9780000002004", "year": 1892, "price": 1790, "stock": 22,
        "cover": "/covers/the-adventures-of-sherlock-holmes.webp", "author": "arthur-conan-doyle",
        "genres": ["mystery-crime"],
        "description": "Sherlock Holmes and Dr. Watson confront twelve baffling cases in a collection that established the brilliant detective and loyal companion as enduring literary archetypes.",
    },
    {
        "title": "The Little Prince", "slug": "the-little-prince", "isbn": "9780000002005",
        "year": 1943, "price": 1390, "stock": 30, "cover": "/covers/the-little-prince.webp",
        "author": "antoine-de-saint-exupery", "genres": ["childrens-literature", "philosophical-fiction"],
        "description": "A stranded pilot meets a young traveler from a tiny asteroid and hears a gentle, searching story about friendship, responsibility, love, and seeing clearly.",
    },
    {
        "title": "Alice’s Adventures in Wonderland", "slug": "alices-adventures-in-wonderland",
        "isbn": "9780000002006", "year": 1865, "price": 1490, "stock": 20,
        "cover": "/covers/alices-adventures-in-wonderland.webp", "author": "lewis-carroll",
        "genres": ["childrens-literature", "fantasy"],
        "description": "Alice follows a hurried white rabbit into a world where logic bends, language plays tricks, and every encounter grows curiouser than the last.",
    },
    {
        "title": "Peter Pan", "slug": "peter-pan", "isbn": "9780000002007",
        "year": 1911, "price": 1450, "stock": 17, "cover": "/covers/peter-pan.webp",
        "author": "jm-barrie", "genres": ["childrens-literature", "fantasy"],
        "description": "Wendy Darling and her brothers fly to Neverland with the boy who refuses to grow up, entering a world of wonder, rivalry, and difficult goodbyes.",
    },
    {
        "title": "The Picture of Dorian Gray", "slug": "the-picture-of-dorian-gray",
        "isbn": "9780000002008", "year": 1890, "price": 1590, "stock": 19,
        "cover": "/covers/the-picture-of-dorian-gray.webp", "author": "oscar-wilde",
        "genres": ["psychological-thriller", "dark-fantasy"],
        "description": "A beautiful young man remains outwardly untouched while a hidden portrait records the cost of vanity, influence, and every corrupted desire.",
    },
    {
        "title": "Twenty Thousand Leagues Under the Sea", "slug": "twenty-thousand-leagues-under-the-sea",
        "isbn": "9780000002009", "year": 1870, "price": 1790, "stock": 21,
        "cover": "/covers/twenty-thousand-leagues-under-the-sea.webp", "author": "jules-verne",
        "genres": ["science-fiction", "adventure"],
        "description": "Professor Aronnax is taken aboard Captain Nemo's astonishing submarine, the Nautilus, for a voyage through shipwrecks, polar seas, and the mysteries of the deep.",
    },
    {
        "title": "The Hobbit", "slug": "the-hobbit", "isbn": "9780000002010",
        "year": 1937, "price": 1890, "stock": 24, "cover": "/covers/the-hobbit.webp",
        "author": "jrr-tolkien", "genres": ["fantasy", "adventure"],
        "description": "Bilbo Baggins leaves his comfortable home to join a company of dwarves on a dangerous quest toward a guarded treasure and an unexpected kind of courage.",
    },
    {
        "title": "1984", "slug": "1984", "isbn": "9780000002011", "year": 1949,
        "price": 1690, "stock": 23, "cover": "/covers/1984.webp", "author": "george-orwell",
        "genres": ["dystopian-fiction", "science-fiction"],
        "description": "In a state built on surveillance and manufactured truth, Winston Smith begins to question the system that controls language, memory, and private thought.",
    },
    {
        "title": "Harry Potter and the Philosopher’s Stone",
        "slug": "harry-potter-and-the-philosophers-stone", "isbn": "9780000002012",
        "year": 1997, "price": 1990, "stock": 28,
        "cover": "/covers/harry-potter-and-the-philosophers-stone.webp", "author": "jk-rowling",
        "genres": ["young-adult", "fantasy"],
        "description": "An overlooked boy discovers that he belongs to a hidden magical world, beginning a first year of friendship, wonder, danger, and hard-won belonging.",
    },
    {
        "title": "The Wonderful Wizard of Oz", "slug": "the-wonderful-wizard-of-oz",
        "isbn": "9780000002013", "year": 1900, "price": 1690, "stock": 20,
        "cover": "/covers/the-wonderful-wizard-of-oz.webp", "author": "l-frank-baum",
        "genres": ["childrens-literature", "fantasy"],
        "description": "Carried from Kansas by a cyclone, Dorothy and Toto follow the yellow-brick road toward the Emerald City, gathering unlikely companions who are searching for courage, wisdom, heart, and a way home.",
    },
]

SEEDED_COMMENTS = (
    ("romeo-and-juliet", "reader@orphaleia.local", "The balcony scenes still feel immediate, but the family conflict is what stayed with me."),
    ("the-adventures-of-sherlock-holmes", settings.admin_email.lower(), "Each case is compact, precise, and remarkably alive more than a century later."),
)


def _upsert_user(
    db: Session,
    email: str,
    full_name: str,
    password: str,
    role: str = "customer",
    rotate_credentials: bool = False,
) -> User:
    user = db.scalar(select(User).where(User.email == email.lower()))
    if user is None:
        user = User(email=email.lower(), full_name=full_name, password_hash=hash_password(password), role=role, is_verified=True)
        db.add(user)
    elif rotate_credentials:
        user.full_name = full_name
        user.role = role
        user.is_verified = True
        if not verify_password(password, user.password_hash):
            timestamp = datetime.now(UTC)
            user.password_hash = hash_password(password)
            user.auth_version += 1
            user.pending_email = None
            db.execute(
                update(RefreshSession)
                .where(RefreshSession.user_id == user.id, RefreshSession.revoked_at.is_(None))
                .values(revoked_at=timestamp)
            )
            db.execute(
                update(ActionToken)
                .where(ActionToken.user_id == user.id, ActionToken.used_at.is_(None))
                .values(used_at=timestamp)
            )
    return user


def sync_catalog(db: Session) -> list[Book]:
    admin = _upsert_user(
        db,
        settings.admin_email,
        "Orphaleia Keeper",
        settings.admin_password,
        role="admin",
        rotate_credentials=True,
    )
    reader = _upsert_user(db, "reader@orphaleia.local", "Ariadne Reader", "ReaderPass!2026")

    authors: dict[str, Author] = {}
    for slug, payload in AUTHORS.items():
        image_url = f"/assets/authors/{slug}.webp"
        author = db.scalar(select(Author).where(Author.slug == slug))
        if author is None:
            author = Author(slug=slug, name=payload["name"], bio=payload["bio"], image_url=image_url)
            db.add(author)
        else:
            author.name = payload["name"]
            author.bio = payload["bio"]
            author.image_url = image_url
        authors[slug] = author

    genres: dict[str, Genre] = {}
    for slug, (name, description) in GENRES.items():
        genre = db.scalar(select(Genre).where(Genre.slug == slug))
        if genre is None:
            genre = Genre(slug=slug, name=name, description=description)
            db.add(genre)
        else:
            genre.name = name
            genre.description = description
        genres[slug] = genre

    db.flush()

    for book in db.scalars(select(Book).where(Book.slug.in_(LEGACY_CATALOG_SLUGS))).all():
        book.active = False
        book.featured = False

    books: list[Book] = []
    for item in CATALOG:
        book = db.scalar(select(Book).where(Book.slug == item["slug"]))
        if book is None:
            book = Book(
                title=item["title"], slug=item["slug"], isbn=item["isbn"], description=item["description"],
                publication_year=item["year"], price_cents=item["price"], stock_qty=item["stock"], cover_url=item["cover"],
            )
            db.add(book)
        book.title = item["title"]
        book.isbn = item["isbn"]
        book.description = item["description"]
        book.publication_year = item["year"]
        book.price_cents = item["price"]
        book.stock_qty = item["stock"]
        book.cover_url = item["cover"]
        book.video_url = None
        book.featured = item["slug"] in FEATURED_SLUGS
        book.active = True
        book.authors = [authors[item["author"]]]
        book.genres = [genres[slug] for slug in item["genres"]]
        books.append(book)

    db.flush()

    historic = [(2022, 4), (2023, 5), (2024, 4), (2025, 5)]
    for index, book in enumerate(books):
        current = historic[index % len(historic)][1]
        rating = db.scalar(select(Rating).where(Rating.user_id == reader.id, Rating.book_id == book.id))
        if rating is None:
            db.add(Rating(user_id=reader.id, book_id=book.id, value=current))

        existing_years = {
            event.created_at.year
            for event in db.scalars(select(RatingEvent).where(RatingEvent.user_id == reader.id, RatingEvent.book_id == book.id)).all()
        }
        for year, value in historic[: 2 + (index % 3)]:
            if year not in existing_years:
                db.add(RatingEvent(user_id=reader.id, book_id=book.id, value=max(1, value - (index % 2)), created_at=datetime(year, 6, 15, tzinfo=UTC)))

    users_by_email = {"reader@orphaleia.local": reader, settings.admin_email.lower(): admin}
    books_by_slug = {book.slug: book for book in books}
    for book_slug, email, body in SEEDED_COMMENTS:
        user = users_by_email[email]
        book = books_by_slug[book_slug]
        exists = db.scalar(select(Comment.id).where(Comment.user_id == user.id, Comment.book_id == book.id, Comment.body == body))
        if exists is None:
            db.add(Comment(user_id=user.id, book_id=book.id, body=body))

    shipping_zones = (
        ("Spain", "ES", 395, 4500),
        ("European Union", "AT,BE,BG,HR,CY,CZ,DE,DK,EE,FI,FR,GR,HU,IE,IT,LT,LU,LV,MT,NL,PL,PT,RO,SE,SI,SK", 895, 7500),
    )
    for name, country_codes, rate_cents, free_over_cents in shipping_zones:
        zone = db.scalar(select(ShippingZone).where(ShippingZone.name == name))
        if zone is None:
            zone = ShippingZone(name=name, country_codes=country_codes, rate_cents=rate_cents)
            db.add(zone)
        zone.country_codes = country_codes
        zone.rate_cents = rate_cents
        zone.free_over_cents = free_over_cents
        zone.active = True

    db.commit()
    return books


def seed():
    if settings.app_env != "development" or not settings.allow_demo_seed:
        raise RuntimeError("Demo seeding requires APP_ENV=development and ALLOW_DEMO_SEED=true")
    if len(settings.admin_password) < 16:
        raise RuntimeError("ADMIN_PASSWORD must be at least 16 characters for demo seeding")
    Base.metadata.create_all(engine)
    with SessionLocal() as db:
        books = sync_catalog(db)
        print(f"Synchronized {len(books)} classic books. Admin: {settings.admin_email}")


if __name__ == "__main__":
    seed()
