"""A finite, editorial book-guessing game. No model calls or player data storage.

Scores are relative weights within this library, never a calibrated probability
that the player's book is present. A correct guess always needs confirmation.
"""

from __future__ import annotations

import json
import math
from functools import lru_cache
from pathlib import Path

from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from .models import Book
from .oracle_schemas import OracleStepInput

KNOWLEDGE = json.loads((Path(__file__).parent / "knowledge" / "book_oracle.json").read_text())
VERSION = KNOWLEDGE["version"]
BOOKS = {book["id"]: book for book in KNOWLEDGE["books"]}
QUESTIONS = {q["id"]: q for q in KNOWLEDGE["questions"]}
for _book in BOOKS.values():
    QUESTIONS[f"clue-{_book['id']}"] = {"id": f"clue-{_book['id']}", "prompt": _book["hallmark"]}
QUESTION_IDS = tuple(QUESTIONS)
CHOICES = [
    {"id": "yes", "label": "Yes"},
    {"id": "no", "label": "No"},
    {"id": "probably", "label": "Probably"},
    {"id": "probably-not", "label": "Probably not"},
    {"id": "unknown", "label": "Don’t know"},
]
# (agreement, disagreement), applied symmetrically to positive/negative answers.
LIKELIHOODS = {"yes": (.97, .03), "no": (.03, .97), "probably": (.9, .1), "probably-not": (.1, .9)}


def feature(book: dict, question_id: str) -> bool | None:
    if question_id.startswith("clue-"):
        # Each hallmark describes a specific central premise, reviewed against
        # the other 99 works. Unlike broad tags it is an exclusive discriminator.
        return question_id == f"clue-{book['id']}"
    return book["features"].get(question_id)


FEATURES = {key: tuple(feature(book, key) for book in BOOKS.values()) for key in QUESTIONS}


def introduction() -> dict:
    return {
        "version": VERSION,
        "title": "The Book Oracle",
        "introduction": "Think of a book. Keep its title secret.",
        "library_size": len(BOOKS),
        "choices": CHOICES,
    }


def entropy(p: float) -> float:
    return -p * math.log2(p) - (1 - p) * math.log2(1 - p) if 0 < p < 1 else 0.0


def _state(answers: list[tuple[str, str]], rejected: list[str], correct: str | None = None) -> dict:
    base = {"version": VERSION, "question_count": len(answers), "guess_count": len(rejected) + bool(correct)}
    if correct:
        return {**base, "status": "success", "book_id": correct}
    if len(rejected) >= 3:
        return {**base, "status": "defeat", "message": "You’ve outwitted the oracle. Three guesses, and your book is still a mystery. Let’s try another round."}

    # A definite recognition of an exclusive premise identifies a work more
    # reliably than broad editorial categories (e.g. whether a dream is a
    # "journey"). Offer the title immediately for final confirmation, even if
    # those earlier descriptions disagree. Tentative recognition is still scored.
    rejected_plots = {f"clue-{book_id}" for book_id in rejected}
    evidence = [(question_id, answer) for question_id, answer in answers if question_id not in rejected_plots]
    for question_id, answer in reversed(evidence):
        if question_id.startswith("clue-") and answer == "yes":
            book_id = question_id.removeprefix("clue-")
            if book_id in BOOKS:
                return {**base, "status": "guess", "book_id": book_id}

    candidates = [book for book in BOOKS.values() if book["id"] not in rejected]
    logs = []
    for book in candidates:
        score = 0.0
        for question_id, answer in evidence:
            if answer == "unknown":
                continue
            value = feature(book, question_id)
            yes, no = LIKELIHOODS[answer]
            score += math.log(.5 if value is None else yes if value else no)
        logs.append(score)
    highest = max(logs)
    weights = [math.exp(score - highest) for score in logs]
    total = sum(weights)
    weights = [w / total for w in weights]
    best = max(range(len(candidates)), key=lambda i: weights[i])
    leading = candidates[best]
    supporting = []
    contradictory = False
    positive = False
    for question_id, answer in evidence:
        value = feature(leading, question_id)
        if value is None or answer == "unknown":
            continue
        agrees = (answer in ("yes", "probably")) == value
        if agrees:
            supporting.append((question_id, answer))
            positive = positive or value
        elif answer in ("yes", "no"):
            contradictory = True
    if weights[best] >= .95 and len(supporting) >= 3 and positive and not contradictory:
        return {**base, "status": "guess", "book_id": leading["id"]}

    used = {q for q, _ in answers} | rejected_plots
    candidate_indices = [i for i, book in enumerate(BOOKS.values()) if book["id"] not in rejected]
    selected = None
    best_gain = 1e-9
    for question_id in QUESTION_IDS:
        if question_id in used:
            continue
        values = FEATURES[question_id]
        yes_weight = sum(w for w, i in zip(weights, candidate_indices, strict=True) if values[i] is True)
        unknown_weight = sum(w for w, i in zip(weights, candidate_indices, strict=True) if values[i] is None)
        # Unknown feature values contribute no distinguishing information.
        gain = entropy(min(1.0, yes_weight + .5 * unknown_weight)) - unknown_weight
        if gain > best_gain + 1e-12:
            selected, best_gain = question_id, gain
    if selected is None:
        return {**base, "status": "defeat", "message": "I’ve run out of useful clues. Your book may be beyond my shelves, or a detail may have led me astray. You can go back to change an answer or try another book."}
    return {**base, "status": "question", "question": QUESTIONS[selected]}


@lru_cache(maxsize=2048)
def replay(events: tuple[tuple[str, str, str | bool], ...]) -> dict:
    """Validate the entire deterministic path, caching only anonymous transcripts.

    The bounded cache contains no identifiers, accounts, IPs or entered text.
    Copies are returned to the API before catalog enrichment.
    """
    answers: list[tuple[str, str]] = []
    rejected: list[str] = []
    correct = None
    current = _state(answers, rejected)
    for kind, key, value in events:
        if kind == "answer" and current["status"] == "question" and current["question"]["id"] == key:
            answers.append((key, str(value)))
        elif kind == "guess" and current["status"] == "guess" and current["book_id"] == key:
            if value is True:
                correct = key
            else:
                rejected.append(key)
        else:
            raise HTTPException(422, "This answer does not follow the oracle’s current question or guess. Go back or start a fresh round.")
        current = _state(answers, rejected, correct)
    return current


def step(data: OracleStepInput, db: Session) -> dict:
    if data.version != VERSION:
        raise HTTPException(409, "The oracle’s library has changed. Start a fresh round with the new shelves.")
    events = tuple(
        ("answer", event.question_id, event.answer) if event.type == "answer" else ("guess", event.book_id, event.correct)
        for event in data.events
    )
    result = dict(replay(events))
    book_id = result.pop("book_id", None)
    if book_id:
        book = BOOKS[book_id]
        shop_slug = None
        if book["shop_slug"]:
            shop_slug = db.scalar(select(Book.slug).where(Book.slug == book["shop_slug"], Book.active.is_(True)))
        positive_clues = [
            key for kind, key, value in events
            if kind == "answer" and value in ("yes", "probably") and feature(book, key) is True
        ]
        labels = {
            "children": "a story for younger readers", "fantasy": "magic or the supernatural", "journey": "a central journey",
            "crime": "crime and investigation", "romance": "romantic love", "society": "society and its inequalities",
            "family": "family relationships", "sea": "travel across water", "science": "imagined science or technology",
            "horror": "a sinister atmosphere", "school": "schooling and teaching", "female": "a central female viewpoint",
            "animal": "animal characters", "war": "armed conflict", "play": "a story written for the stage",
            "stories": "a collection of separate stories", "before-1900": "publication before 1900",
            "before-1850": "publication before 1850", "before-1800": "publication before 1800", "after-1950": "publication since 1950",
        }
        clues = [labels[key] for key in positive_clues if key in labels][-3:]
        if any(key.startswith("clue-") for key in positive_clues):
            clues.append("the distinctive premise you recognized")
        result["book"] = {
            "id": book_id, "title": book["title"], "author": book["author"], "shop_slug": shop_slug,
            "explanation": "I followed your clues about " + ", ".join(clues) + ". Together, they pointed to this story.",
        }
    return result
