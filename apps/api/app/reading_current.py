from __future__ import annotations

import base64
import hashlib
import hmac
import logging
import math
import secrets
import uuid
from datetime import UTC, datetime, timedelta
from typing import Any

from fastapi import HTTPException
from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session, selectinload

from .config import settings
from .models import Book, Genre, Rating, ReadingCurrentProfile, ReadingCurrentShare, User
from .serializers import book_out, genre_out

logger = logging.getLogger(__name__)

QUIZ_VERSION = "2026.1"
TOTAL_STEPS = 8
SHARE_LIFETIME_DAYS = 365
SHARE_TOMBSTONE_DAYS = 30

TRAITS = (
    "connection",
    "emotion",
    "mystery",
    "darkness",
    "wonder",
    "adventure",
    "speculation",
    "ideas",
    "realism",
    "coming_of_age",
    "pace",
    "introspection",
)

TRAIT_LABELS = {
    "connection": "stories anchored by human connection",
    "emotion": "an emotional afterglow",
    "mystery": "questions that reward close attention",
    "darkness": "a willingness to enter the shadows",
    "wonder": "room for wonder",
    "adventure": "a pull toward the unknown",
    "speculation": "worlds that bend what is possible",
    "ideas": "ideas that keep working after the last page",
    "realism": "recognizable human truth",
    "coming_of_age": "the charged moment of becoming",
    "pace": "a strong forward current",
    "introspection": "time inside a character's mind",
}


def _answer(answer_id: str, label: str, description: str, **effects: int) -> dict[str, Any]:
    return {"id": answer_id, "label": label, "description": description, "effects": effects}


QUESTIONS: dict[str, dict[str, Any]] = {
    "world": {
        "id": "world",
        "prompt": "Where should the first page take you?",
        "hint": "Choose the doorway you would enter without asking for a map.",
        "discriminators": ("realism", "darkness", "wonder", "speculation"),
        "answers": (
            _answer("known-streets", "Streets I might know", "Real lives, precise details, and trouble close to home.", realism=3, introspection=2, connection=1),
            _answer("house-with-secrets", "A house with secrets", "Old rooms, charged silences, and something behind the locked door.", darkness=2, mystery=2, emotion=2, realism=1),
            _answer("enchanted-country", "An enchanted country", "Impossible creatures, old magic, and a path beyond the ordinary.", wonder=3, speculation=2, adventure=2),
            _answer("distant-future", "A distant future", "New worlds, difficult inventions, and ideas with consequences.", speculation=3, ideas=2, adventure=1),
        ),
    },
    "engine": {
        "id": "engine",
        "prompt": "What should pull the story forward?",
        "hint": "Every voyage needs a current. Pick the one that catches you fastest.",
        "discriminators": ("connection", "mystery", "adventure", "ideas"),
        "answers": (
            _answer("relationship", "A relationship", "Love, loyalty, rivalry, or the ache between two people.", connection=3, emotion=2),
            _answer("puzzle", "A puzzle", "Clues, hidden motives, and the pleasure of noticing first.", mystery=3, ideas=2),
            _answer("quest", "A quest", "A destination worth danger, distance, and one questionable shortcut.", adventure=3, pace=2, wonder=1),
            _answer("question", "A difficult question", "An idea that keeps changing shape each time it is examined.", ideas=3, introspection=2, realism=1),
        ),
    },
    "afterglow": {
        "id": "afterglow",
        "prompt": "How should the last page leave you?",
        "hint": "Be honest. The noble answer is rarely the useful one.",
        "discriminators": ("emotion", "pace", "wonder", "darkness"),
        "answers": (
            _answer("understood", "A little more understood", "The book knew something human and said it clearly.", emotion=3, connection=2, introspection=1),
            _answer("exhilarated", "Breathless and delighted", "The room returns only after the final sentence.", pace=3, adventure=2),
            _answer("awed", "Amazed by what is possible", "The world feels larger than it did before.", wonder=3, speculation=2),
            _answer("unsettled", "Beautifully unsettled", "The lights stay on. The questions do too.", darkness=3, mystery=1, emotion=2),
        ),
    },
    "pace": {
        "id": "pace",
        "prompt": "How quickly should the pages turn?",
        "hint": "There is no prize for choosing the fastest boat.",
        "discriminators": ("pace", "introspection", "adventure", "mystery"),
        "answers": (
            _answer("sentence-by-sentence", "Let me savor every sentence", "Language first. I am happy to linger.", introspection=3, ideas=1, realism=1),
            _answer("slow-tension", "Build the tension slowly", "I like hearing the floorboard before seeing the door open.", mystery=2, darkness=1, emotion=1),
            _answer("steady-journey", "Keep a steady current", "Enough room to notice things, enough motion to continue.", adventure=2, connection=1, pace=1),
            _answer("page-turner", "Make it difficult to stop", "One more chapter is a perfectly respectable bedtime plan.", pace=3, mystery=1, adventure=1),
        ),
    },
    "darkness": {
        "id": "darkness",
        "prompt": "How much shadow may enter the story?",
        "hint": "The lantern is yours. You decide how far it has to reach.",
        "discriminators": ("darkness", "emotion", "mystery", "wonder"),
        "answers": (
            _answer("warm-lantern", "Keep a warm lantern nearby", "Difficulty is welcome, despair need not move in.", connection=2, wonder=1, emotion=1),
            _answer("edges", "A shadow at the edges", "Unease sharpens a story when it knows when to leave.", darkness=1, mystery=1),
            _answer("midnight", "I can manage full midnight", "Let the story go somewhere genuinely dark.", darkness=3, emotion=2),
            _answer("clever-dread", "Give the darkness a clever mind", "Fear is best when it is also solving something.", darkness=2, mystery=2, ideas=1),
        ),
    },
    "reality": {
        "id": "reality",
        "prompt": "How firmly should the story obey reality?",
        "hint": "The customs officer has briefly looked away.",
        "discriminators": ("realism", "wonder", "speculation", "ideas"),
        "answers": (
            _answer("recognizable", "Keep both feet on the ground", "The strange part can be the people.", realism=3, connection=1),
            _answer("one-seam", "Allow one impossible seam", "Reality may bend if the stitch is convincing.", realism=1, wonder=1, mystery=1),
            _answer("mythic", "Open the gates to myth", "Give me magic with rules, history, and weather.", wonder=3, speculation=2),
            _answer("future", "Build a future I can test", "Change the world, then follow the consequences.", speculation=3, ideas=2),
        ),
    },
    "ambiguity": {
        "id": "ambiguity",
        "prompt": "What sort of ending earns your trust?",
        "hint": "The coast may be clear, misty, or entirely theoretical.",
        "discriminators": ("connection", "emotion", "ideas", "darkness", "introspection"),
        "answers": (
            _answer("clear", "Close the circle", "A satisfying answer is not a lesser art.", connection=2, pace=1),
            _answer("hopeful", "Hopeful, but not tidy", "Let the characters carry a few loose threads home.", emotion=2, connection=1, introspection=1),
            _answer("lingering", "Leave one question alive", "I want the ending to continue quietly in my head.", ideas=2, introspection=2, mystery=1),
            _answer("devastating", "Tell the difficult truth", "If the ending must hurt, let it mean something.", darkness=2, emotion=3),
        ),
    },
    "relationships": {
        "id": "relationships",
        "prompt": "Where should other people sit in the story?",
        "hint": "Companions are useful. They also eat the last orange.",
        "discriminators": ("connection", "adventure", "introspection", "darkness"),
        "answers": (
            _answer("heart", "At its very heart", "The bonds between people should change everything.", connection=3, emotion=2),
            _answer("companion", "Beside the main journey", "A good companion matters, but the road still calls.", connection=2, adventure=1),
            _answer("solitary", "Mostly inside one mind", "Solitude can be crowded enough.", introspection=3, ideas=1),
            _answer("rivalry", "Make it a rivalry or obsession", "Connection is interesting when it has sharp edges.", darkness=2, mystery=2, emotion=1),
        ),
    },
    "puzzles": {
        "id": "puzzles",
        "prompt": "How much should the book ask you to solve?",
        "hint": "You may inspect the footprints. Please leave the curtains attached.",
        "discriminators": ("mystery", "ideas", "connection", "darkness"),
        "answers": (
            _answer("none", "Very little", "I would rather feel the story than interrogate it.", connection=2, emotion=1),
            _answer("optional-clues", "A few clues in the margins", "Let careful readers find an extra door.", mystery=1, introspection=1),
            _answer("fair-play", "Give me a fair puzzle", "The answer should be hidden, not withheld.", mystery=3, ideas=2),
            _answer("unreliable", "Make reality itself suspicious", "I enjoy discovering that the map has been lying.", mystery=2, darkness=2, speculation=1),
        ),
    },
    "motion": {
        "id": "motion",
        "prompt": "Where should the important change happen?",
        "hint": "Not every revolution requires a collapsing bridge.",
        "discriminators": ("introspection", "connection", "ideas", "adventure", "pace"),
        "answers": (
            _answer("inward", "Inside the character", "A changed mind can be the largest landscape.", introspection=3, emotion=2),
            _answer("conversation", "Between people", "A sentence at the right moment can alter the route.", connection=2, ideas=1),
            _answer("discovery", "In what they discover", "New knowledge should redraw the map.", ideas=2, adventure=1, speculation=1),
            _answer("danger", "In the danger itself", "Let choices happen at running speed.", pace=3, adventure=2, darkness=1),
        ),
    },
    "life-stage": {
        "id": "life-stage",
        "prompt": "Whose eyes should make the world feel new?",
        "hint": "Wisdom is not required. Curiosity is.",
        "discriminators": ("wonder", "coming_of_age", "realism", "introspection", "ideas"),
        "answers": (
            _answer("childlike", "A keeper of childlike wonder", "The obvious rules have not yet become obvious.", wonder=3, coming_of_age=1),
            _answer("first-independence", "Someone meeting first independence", "Every choice is new enough to matter twice.", coming_of_age=3, connection=1, adventure=1),
            _answer("adult-contradictions", "An adult full of contradictions", "Experience has made the questions better, not smaller.", realism=2, introspection=2, emotion=1),
            _answer("outsider", "A timeless outsider", "Distance can reveal what belonging conceals.", ideas=2, darkness=1, speculation=1),
        ),
    },
}

UNIVERSAL_QUESTION_IDS = ("world", "engine", "afterglow")
ADAPTIVE_QUESTION_IDS = ("pace", "darkness", "reality", "ambiguity", "relationships", "puzzles", "motion", "life-stage")


def _profile(**values: int) -> dict[str, int]:
    return {trait: values.get(trait, 0) for trait in TRAITS}


GENRE_PROFILES = {
    "romance": _profile(connection=3, emotion=3, realism=2, coming_of_age=1, pace=1, introspection=2),
    "tragedy": _profile(connection=2, emotion=3, darkness=3, ideas=2, realism=2, pace=1, introspection=2),
    "literary-fiction": _profile(connection=2, emotion=3, mystery=1, darkness=1, ideas=3, realism=3, coming_of_age=1, introspection=3),
    "gothic-fiction": _profile(connection=2, emotion=3, mystery=2, darkness=3, wonder=1, speculation=1, ideas=1, realism=2, pace=1, introspection=2),
    "mystery-crime": _profile(emotion=1, mystery=3, darkness=2, adventure=1, ideas=2, realism=3, pace=3, introspection=1),
    "childrens-literature": _profile(connection=2, emotion=2, mystery=1, wonder=3, adventure=2, speculation=1, ideas=1, realism=1, coming_of_age=3, pace=2, introspection=1),
    "philosophical-fiction": _profile(connection=1, emotion=2, mystery=1, darkness=1, wonder=1, speculation=2, ideas=3, realism=2, introspection=3),
    "fantasy": _profile(connection=1, emotion=2, mystery=1, darkness=1, wonder=3, adventure=3, speculation=3, ideas=1, coming_of_age=2, pace=2, introspection=1),
    "psychological-thriller": _profile(connection=1, emotion=3, mystery=3, darkness=3, speculation=1, ideas=2, realism=2, pace=3, introspection=2),
    "dark-fantasy": _profile(connection=1, emotion=2, mystery=2, darkness=3, wonder=3, adventure=2, speculation=3, ideas=1, coming_of_age=1, pace=2, introspection=1),
    "science-fiction": _profile(emotion=1, mystery=1, darkness=1, wonder=2, adventure=2, speculation=3, ideas=3, realism=1, coming_of_age=1, pace=2, introspection=1),
    "adventure": _profile(connection=1, emotion=1, mystery=1, darkness=1, wonder=2, adventure=3, speculation=1, realism=1, coming_of_age=1, pace=3),
    "dystopian-fiction": _profile(connection=1, emotion=2, mystery=2, darkness=3, adventure=1, speculation=3, ideas=3, realism=2, coming_of_age=1, pace=2, introspection=2),
    "young-adult": _profile(connection=2, emotion=3, mystery=1, darkness=1, wonder=2, adventure=2, speculation=1, ideas=1, realism=2, coming_of_age=3, pace=2, introspection=2),
}

ARCHETYPES = {
    "heartkeeper": {
        "name": "The Heartkeeper",
        "description": "You read for the charged space between people and the feelings they cannot quite hide.",
        "traits": ("connection", "emotion"),
    },
    "riddlekeeper": {
        "name": "The Riddlekeeper",
        "description": "You notice the loose thread, the doubtful alibi, and the door everyone else walked past.",
        "traits": ("mystery", "ideas"),
    },
    "horizon-chaser": {
        "name": "The Horizon Chaser",
        "description": "You want a story with distance in its legs and enough momentum to miss your stop.",
        "traits": ("adventure", "pace"),
    },
    "elsewhere-dreamer": {
        "name": "The Elsewhere Dreamer",
        "description": "You read to test the border between the possible, the impossible, and the almost believable.",
        "traits": ("wonder", "speculation", "coming_of_age"),
    },
    "quiet-cartographer": {
        "name": "The Quiet Cartographer",
        "description": "You map inner lives, difficult ideas, and the small truths that rearrange a familiar world.",
        "traits": ("realism", "introspection", "ideas"),
    },
    "night-lantern": {
        "name": "The Night Lantern",
        "description": "You are willing to follow a story into shadow when it promises something honest there.",
        "traits": ("darkness", "emotion"),
    },
}


def _empty_vector() -> dict[str, float]:
    return {trait: 0.0 for trait in TRAITS}


def _add_effects(vector: dict[str, float], effects: dict[str, int]) -> None:
    for trait, value in effects.items():
        if trait in vector:
            vector[trait] += value


def _cosine(left: dict[str, float], right: dict[str, int]) -> float:
    dot = sum(left[trait] * right[trait] for trait in TRAITS)
    left_size = math.sqrt(sum(value * value for value in left.values()))
    right_size = math.sqrt(sum(value * value for value in right.values()))
    if not left_size or not right_size:
        return 0.0
    return dot / (left_size * right_size)


def eligible_genres(db: Session) -> list[Genre]:
    genres = db.scalars(
        select(Genre)
        .join(Genre.books)
        .where(Book.active.is_(True))
        .distinct()
        .order_by(Genre.slug)
    ).all()
    missing = [genre.slug for genre in genres if genre.slug not in GENRE_PROFILES]
    if missing:
        logger.warning("Reading Current excludes unprofiled live genres: %s", ", ".join(missing))
    return [genre for genre in genres if genre.slug in GENRE_PROFILES]


def _genre_scores(vector: dict[str, float], genres: list[Genre]) -> dict[str, float]:
    return {genre.slug: _cosine(vector, GENRE_PROFILES[genre.slug]) for genre in genres}


def _ranked_genres(vector: dict[str, float], genres: list[Genre]) -> list[Genre]:
    scores = _genre_scores(vector, genres)
    return sorted(genres, key=lambda genre: (-scores[genre.slug], genre.slug))


def _adaptive_question(vector: dict[str, float], genres: list[Genre], asked_ids: set[str]) -> dict[str, Any]:
    candidates = [QUESTIONS[question_id] for question_id in ADAPTIVE_QUESTION_IDS if question_id not in asked_ids]
    if not candidates:
        raise HTTPException(422, "The voyage contains too many answers")
    leaders = _ranked_genres(vector, genres)[:4]

    def spread(question: dict[str, Any]) -> float:
        return sum(
            max(GENRE_PROFILES[genre.slug][trait] for genre in leaders)
            - min(GENRE_PROFILES[genre.slug][trait] for genre in leaders)
            for trait in question["discriminators"]
        ) if leaders else 0.0

    return max(candidates, key=lambda question: (spread(question), -ADAPTIVE_QUESTION_IDS.index(question["id"])))


def _question_for_index(index: int, vector: dict[str, float], genres: list[Genre], asked_ids: set[str]) -> dict[str, Any]:
    if index < len(UNIVERSAL_QUESTION_IDS):
        return QUESTIONS[UNIVERSAL_QUESTION_IDS[index]]
    return _adaptive_question(vector, genres, asked_ids)


def _scene_for_step(step: int) -> str:
    if step <= 2:
        return "moonlit-harbor"
    if step <= 4:
        return "doorway-archive"
    if step <= 6:
        return "forked-forest"
    return "distant-lighthouse"


def question_out(question: dict[str, Any], step: int) -> dict[str, Any]:
    return {
        "id": question["id"],
        "prompt": question["prompt"],
        "hint": question["hint"],
        "step": step,
        "total_steps": TOTAL_STEPS,
        "scene": _scene_for_step(step),
        "answers": [
            {"id": answer["id"], "label": answer["label"], "description": answer["description"]}
            for answer in question["answers"]
        ],
    }


def validate_answers(db: Session, version: str, answers: list[dict[str, str]]) -> tuple[dict[str, float], list[Genre]]:
    if version != QUIZ_VERSION:
        raise HTTPException(409, "This voyage has changed. Start again to use the latest questions")
    if len(answers) > TOTAL_STEPS:
        raise HTTPException(422, f"A voyage contains exactly {TOTAL_STEPS} answers")
    genres = eligible_genres(db)
    if not genres:
        raise HTTPException(503, "The reading currents are being charted. Try again shortly")
    vector = _empty_vector()
    asked_ids: set[str] = set()
    for index, submitted in enumerate(answers):
        expected = _question_for_index(index, vector, genres, asked_ids)
        question_id = submitted.get("question_id", "")
        answer_id = submitted.get("answer_id", "")
        if question_id in asked_ids:
            raise HTTPException(422, "Each question may be answered only once")
        if question_id != expected["id"]:
            raise HTTPException(422, "The supplied answers do not follow this voyage")
        selected = next((answer for answer in expected["answers"] if answer["id"] == answer_id), None)
        if selected is None:
            raise HTTPException(422, "Choose one of the available answers")
        asked_ids.add(question_id)
        _add_effects(vector, selected["effects"])
    return vector, genres


def next_step(db: Session, version: str, answers: list[dict[str, str]]) -> dict[str, Any]:
    vector, genres = validate_answers(db, version, answers)
    if len(answers) == TOTAL_STEPS:
        return {
            "status": "complete",
            "version": QUIZ_VERSION,
            "total_steps": TOTAL_STEPS,
            "result": build_result(db, vector, genres),
        }
    question = _question_for_index(len(answers), vector, genres, {answer["question_id"] for answer in answers})
    return {
        "status": "question",
        "version": QUIZ_VERSION,
        "total_steps": TOTAL_STEPS,
        "question": question_out(question, len(answers) + 1),
    }


def _archetype(vector: dict[str, float]) -> dict[str, str]:
    def cluster_score(item: tuple[str, dict[str, Any]]) -> tuple[float, str]:
        key, archetype = item
        values = [vector[trait] for trait in archetype["traits"]]
        return (sum(values) / len(values), key)

    key, archetype = max(ARCHETYPES.items(), key=cluster_score)
    return {"id": key, "name": archetype["name"], "description": archetype["description"]}


def _book_relevance(book: Book, scores: dict[str, float]) -> float:
    return sum(scores.get(genre.slug, 0.0) for genre in book.genres)


def _rating_totals(db: Session, book_ids: list[str]) -> dict[str, tuple[float, int]]:
    rows = db.execute(
        select(Rating.book_id, func.avg(Rating.value), func.count(Rating.id))
        .where(Rating.book_id.in_(book_ids))
        .group_by(Rating.book_id)
    ).all() if book_ids else []
    return {book_id: (float(average or 0), int(count or 0)) for book_id, average, count in rows}


def build_result(db: Session, vector: dict[str, float], genres: list[Genre]) -> dict[str, Any]:
    ranked = _ranked_genres(vector, genres)
    scores = _genre_scores(vector, genres)
    constellation = ranked[:3]
    primary = constellation[0]
    shared_traits = sorted(
        TRAITS,
        key=lambda trait: (-(vector[trait] * GENRE_PROFILES[primary.slug][trait]), trait),
    )[:3]
    books = list(db.scalars(
        select(Book)
        .options(selectinload(Book.authors), selectinload(Book.genres))
        .where(Book.active.is_(True))
    ).unique().all())
    ratings = _rating_totals(db, [book.id for book in books])
    books.sort(
        key=lambda book: (
            -_book_relevance(book, scores),
            -ratings.get(book.id, (0.0, 0))[0],
            -ratings.get(book.id, (0.0, 0))[1],
            book.title.casefold(),
        )
    )
    trait_phrases = [TRAIT_LABELS[trait] for trait in shared_traits]
    explanation = f"Your choices point to {trait_phrases[0]}, {trait_phrases[1]}, and {trait_phrases[2]}."
    return {
        "version": QUIZ_VERSION,
        "archetype": _archetype(vector),
        "primary_genre": genre_out(primary),
        "related_genres": [genre_out(genre) for genre in constellation[1:]],
        "explanation": explanation,
        "traits": trait_phrases,
        "books": [book_out(db, book) for book in books[:3]],
        "completed_at": datetime.now(UTC).isoformat(),
    }


def save_profile(db: Session, user: User, version: str, answers: list[dict[str, str]]) -> ReadingCurrentProfile:
    vector, genres = validate_answers(db, version, answers)
    if len(answers) != TOTAL_STEPS:
        raise HTTPException(422, f"Complete all {TOTAL_STEPS} questions before saving")
    result = build_result(db, vector, genres)
    profile = db.get(ReadingCurrentProfile, user.id)
    if profile is None:
        profile = ReadingCurrentProfile(user_id=user.id)
        db.add(profile)
    profile.quiz_version = QUIZ_VERSION
    profile.answers_json = answers
    profile.result_json = result
    profile.updated_at = datetime.now(UTC)
    db.commit()
    db.refresh(profile)
    return profile


def _aware(value: datetime) -> datetime:
    return value if value.tzinfo else value.replace(tzinfo=UTC)


def share_public_token(record_id: str) -> str:
    record_bytes = uuid.UUID(record_id).bytes
    signature = hmac.new(settings.secret_key.encode(), record_bytes, hashlib.sha256).digest()[:16]
    return base64.urlsafe_b64encode(record_bytes + signature).decode().rstrip("=")


def _share_id_from_token(token: str) -> str:
    try:
        raw = base64.urlsafe_b64decode(token + "=" * (-len(token) % 4))
        if len(raw) != 32:
            raise ValueError
        record_bytes, signature = raw[:16], raw[16:]
        expected = hmac.new(settings.secret_key.encode(), record_bytes, hashlib.sha256).digest()[:16]
        if not hmac.compare_digest(signature, expected):
            raise ValueError
        return str(uuid.UUID(bytes=record_bytes))
    except (ValueError, TypeError):
        raise HTTPException(404, "Shared reading current not found") from None


def _token_digest(token: str) -> str:
    return hashlib.sha256(token.encode()).hexdigest()


def create_share(
    db: Session,
    result: dict[str, Any],
    owner: User | None = None,
    include_display_name: bool = False,
) -> tuple[ReadingCurrentShare, str | None]:
    record = ReadingCurrentShare(
        owner_user_id=owner.id if owner else None,
        public_token_hash="pending",
        result_json=result,
        display_name=owner.full_name if owner and include_display_name else None,
        expires_at=datetime.now(UTC) + timedelta(days=SHARE_LIFETIME_DAYS),
    )
    revoke_token = None
    if owner is None:
        revoke_token = secrets.token_urlsafe(32)
        record.revoke_token_hash = _token_digest(revoke_token)
    db.add(record)
    db.flush()
    public_token = share_public_token(record.id)
    record.public_token_hash = _token_digest(public_token)
    db.commit()
    db.refresh(record)
    return record, revoke_token


def get_share_by_token(db: Session, token: str, include_inactive: bool = False) -> ReadingCurrentShare:
    share_id = _share_id_from_token(token)
    record = db.get(ReadingCurrentShare, share_id)
    if record is None or not hmac.compare_digest(record.public_token_hash, _token_digest(token)):
        raise HTTPException(404, "Shared reading current not found")
    if not include_inactive and (record.revoked_at is not None or _aware(record.expires_at) <= datetime.now(UTC)):
        raise HTTPException(410, "This shared reading current is no longer available")
    return record


def share_out(record: ReadingCurrentShare, include_management: bool = False) -> dict[str, Any]:
    token = share_public_token(record.id)
    payload = {
        "id": record.id,
        "url": f"{settings.frontend_url.rstrip('/')}/reading-current/shared/{token}",
        "created_at": record.created_at,
        "expires_at": record.expires_at,
        "display_name": record.display_name,
    }
    if include_management:
        payload["revoked_at"] = record.revoked_at
    return payload


def profile_out(db: Session, profile: ReadingCurrentProfile | None, user: User) -> dict[str, Any]:
    shares = list(db.scalars(
        select(ReadingCurrentShare)
        .where(
            ReadingCurrentShare.owner_user_id == user.id,
            ReadingCurrentShare.revoked_at.is_(None),
            ReadingCurrentShare.expires_at > datetime.now(UTC),
        )
        .order_by(ReadingCurrentShare.created_at.desc())
    ).all())
    return {
        "profile": {
            "version": profile.quiz_version,
            "result": profile.result_json,
            "updated_at": profile.updated_at,
            "is_stale": profile.quiz_version != QUIZ_VERSION,
        } if profile else None,
        "shares": [share_out(record, include_management=True) for record in shares],
    }


def revoke_guest_share(db: Session, token: str, revoke_token: str) -> None:
    record = get_share_by_token(db, token)
    if not record.revoke_token_hash or not hmac.compare_digest(record.revoke_token_hash, _token_digest(revoke_token)):
        raise HTTPException(403, "This browser cannot revoke the shared result")
    record.revoked_at = datetime.now(UTC)
    db.commit()


def purge_old_shares(db: Session) -> int:
    cutoff = datetime.now(UTC) - timedelta(days=SHARE_TOMBSTONE_DAYS)
    records = db.scalars(
        select(ReadingCurrentShare).where(
            or_(
                ReadingCurrentShare.expires_at < cutoff,
                ReadingCurrentShare.revoked_at < cutoff,
            )
        )
    ).all()
    for record in records:
        db.delete(record)
    db.commit()
    return len(records)
