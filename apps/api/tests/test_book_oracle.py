import json
from pathlib import Path

import pytest
from fastapi import HTTPException

from app.book_oracle import BOOKS, FEATURES, LIKELIHOODS, QUESTIONS, VERSION, _state, feature, replay
from app.database import SessionLocal
from app.models import Book
from app.seed import CATALOG


def play(book_id, events=(), soft=False):
    history = list(events)
    for _ in range(len(QUESTIONS) + 1):
        state = replay(tuple(history))
        if state["status"] != "question":
            return history, state
        question_id = state["question"]["id"]
        value = feature(BOOKS[book_id], question_id)
        answer = "unknown" if value is None else ("probably" if value else "probably-not") if soft else "yes" if value else "no"
        history.append(("answer", question_id, answer))
    pytest.fail("The question bank should be finite")


def payload(events):
    return {"version": VERSION, "events": [
        {"type": kind, "question_id": key, "answer": value} if kind == "answer" else {"type": kind, "book_id": key, "correct": value}
        for kind, key, value in events
    ]}


def test_library_has_100_distinct_sourced_profiles_and_all_shop_books():
    assert len(BOOKS) == 100
    assert len(QUESTIONS) + 3 == 123
    profiles = {tuple(feature(book, q) for q in QUESTIONS) for book in BOOKS.values()}
    assert len(profiles) == 100
    assert {b["slug"] for b in CATALOG} <= {b["shop_slug"] for b in BOOKS.values()}
    for book in BOOKS.values():
        assert book["sources"]
        assert all(url.startswith("https://") for url in book["sources"])
        assert len(book["features"]) == 20
        assert all(value is None or type(value) is bool for value in book["features"].values())


def test_truthful_answers_identify_every_title_without_repeated_questions():
    for book_id in BOOKS:
        history, state = play(book_id)
        assert state["status"] == "guess", (book_id, state)
        assert state["book_id"] == book_id
        assert len(history) >= 3
        assert len({key for _, key, _ in history}) == len(history)
        assert replay(tuple(history + [("guess", book_id, True)]))["status"] == "success"


def test_soft_answers_have_less_weight_and_can_still_identify_a_book():
    assert LIKELIHOODS["yes"][0] / LIKELIHOODS["yes"][1] > LIKELIHOODS["probably"][0] / LIKELIHOODS["probably"][1]
    history, state = play("the-hobbit", soft=True)
    assert state["status"] == "guess"
    assert state["book_id"] == "the-hobbit"
    assert len(history) > len(play("the-hobbit")[0])


def test_unknown_answers_exhaust_clues_without_guessing_or_repeating():
    history = []
    while (state := replay(tuple(history)))["status"] == "question":
        history.append(("answer", state["question"]["id"], "unknown"))
        assert len(history) <= len(QUESTIONS)
    assert state["status"] == "defeat"
    assert state["guess_count"] == 0
    assert len({key for _, key, _ in history}) == len(history)


def test_missing_features_supply_neither_support_nor_contradiction():
    assert feature(BOOKS["the-great-gatsby"], "children") is None
    assert feature(BOOKS["the-hobbit"], "nonexistent") is None
    # Three uncertain feature observations alone cannot create a guess.
    assert _state([("children", "yes")], [])["status"] == "question"
    assert any(value is None for values in FEATURES.values() for value in values)


def test_definite_contradiction_prevents_a_confident_guess():
    history, state = play("the-hobbit")
    assert state["status"] == "guess"
    # Even many supporting answers cannot override a contradictory definite clue.
    contradicted = [(key, value) for _, key, value in history if not key.startswith("clue-")] + [("clue-the-hobbit", "no")]
    result = _state(contradicted, [])
    assert result["status"] != "guess" or result["book_id"] != "the-hobbit"


def test_confirming_a_unique_plot_outweighs_broad_or_unknown_answers_for_all_100_books():
    # Broad descriptions can be interpreted differently. A recognized exclusive
    # premise is enough to offer the title for the player's final confirmation.
    for book_id in BOOKS:
        answers = [("journey", "no"), ("female", "yes"), ("children", "unknown"), (f"clue-{book_id}", "yes")]
        state = _state(answers, [])
        assert state["status"] == "guess"
        assert state["book_id"] == book_id


@pytest.mark.parametrize("answer", ["probably", "probably-not", "unknown", "no"])
def test_uncertain_or_denied_plot_is_not_a_decisive_confirmation(answer):
    state = _state([("clue-alices-adventures-in-wonderland", answer)], [])
    assert state["status"] == "question"


def test_alice_is_a_female_lead_with_central_animal_characters():
    alice = BOOKS["alices-adventures-in-wonderland"]
    assert alice["features"]["female"] is True
    assert alice["features"]["animal"] is True


def alice_regression_round():
    history = []
    overrides = {"journey": "no", "female": "yes", "animal": "yes", "before-1900": "unknown", "before-1850": "unknown", "before-1800": "unknown", "after-1950": "unknown"}
    for _ in range(len(QUESTIONS) + 1):
        state = replay(tuple(history))
        if state["status"] != "question":
            return history, state
        question_id = state["question"]["id"]
        value = feature(BOOKS["alices-adventures-in-wonderland"], question_id)
        answer = overrides.get(question_id, "unknown" if value is None else "yes" if value else "no")
        history.append(("answer", question_id, answer))
        if question_id == "clue-alices-adventures-in-wonderland":
            return history, replay(tuple(history))
    pytest.fail("The oracle should reach a decisive plot clue")


def test_alice_white_rabbit_confirmation_immediately_returns_a_guess(client):
    history, _ = alice_regression_round()
    assert history[-1] == ("answer", "clue-alices-adventures-in-wonderland", "yes")
    response = client.post("/api/v1/book-oracle/step", json=payload(history))
    assert response.status_code == 200
    assert response.json()["status"] == "guess"
    assert response.json()["book"]["id"] == "alices-adventures-in-wonderland"


def test_rejecting_a_decisive_plot_clears_its_exclusive_evidence():
    # Saying 'no' to the title corrects the earlier recognition of that plot;
    # otherwise its unique positive would contradict every remaining work.
    rejected = ["alices-adventures-in-wonderland"]
    with_plot = _state([("children", "yes"), ("clue-alices-adventures-in-wonderland", "yes")], rejected)
    without_plot = _state([("children", "yes")], rejected)
    assert with_plot["status"] == without_plot["status"] == "question"
    assert with_plot["question"] == without_plot["question"]


def test_rejections_are_excluded_and_three_guesses_end_the_round():
    history, state = play("the-hobbit", soft=True)
    rejected = []
    for target in ("the-hobbit", "peter-pan", "the-wonderful-wizard-of-oz"):
        if state["status"] == "question":
            history, state = play(target, history, soft=True)
        if state["status"] == "guess":
            assert state["book_id"] not in rejected
            rejected.append(state["book_id"])
            history.append(("guess", state["book_id"], False))
            state = replay(tuple(history))
    assert rejected
    assert state["status"] == "defeat" or state.get("book_id") not in rejected
    assert _state([], ["the-hobbit", "peter-pan", "the-wonderful-wizard-of-oz"])["status"] == "defeat"


def test_public_contract_and_confirmed_success(client):
    manifest = client.get("/api/v1/book-oracle")
    assert manifest.status_code == 200
    assert manifest.json()["library_size"] == 100
    assert [item["id"] for item in manifest.json()["choices"]] == ["yes", "no", "probably", "probably-not", "unknown"]
    history, state = play("the-hobbit")
    response = client.post("/api/v1/book-oracle/step", json=payload(history))
    assert response.status_code == 200
    guess = response.json()
    assert guess["book"]["title"] == "The Hobbit"
    assert "book_id" not in guess
    assert "score" not in guess
    assert guess["book"]["shop_slug"] is None
    response = client.post("/api/v1/book-oracle/step", json=payload(history + [("guess", state["book_id"], True)]))
    assert response.json()["status"] == "success"


def test_catalog_enrichment_is_live_optional_and_active_only(client):
    history, _ = play("the-hobbit")
    with SessionLocal() as db:
        book = db.query(Book).first()
        book.slug = "the-hobbit"
        db.commit()
    assert client.post("/api/v1/book-oracle/step", json=payload(history)).json()["book"]["shop_slug"] == "the-hobbit"
    with SessionLocal() as db:
        db.query(Book).first().active = False
        db.commit()
    assert client.post("/api/v1/book-oracle/step", json=payload(history)).json()["book"]["shop_slug"] is None


@pytest.mark.parametrize("events", [
    [{"type": "answer", "question_id": "made-up", "answer": "yes"}],
    [{"type": "guess", "book_id": "the-hobbit", "correct": True}],
    [{"type": "guess", "book_id": "the-hobbit", "correct": "false"}],
    [{"type": "answer", "question_id": "children", "answer": "maybe"}],
    [{"type": "answer", "question_id": "children", "answer": "yes", "extra": True}],
])
def test_invalid_transcripts_use_existing_errors(client, events):
    response = client.post("/api/v1/book-oracle/step", json={"version": VERSION, "events": events})
    assert response.status_code == 422
    assert {"code", "message", "request_id"} <= response.json().keys()


def test_duplicate_questions_and_events_after_success_are_invalid():
    history, state = play("the-hobbit")
    with pytest.raises(HTTPException) as error:
        replay(tuple(history[:1] * 2))
    assert error.value.status_code == 422
    with pytest.raises(HTTPException):
        replay(tuple(history + [("guess", state["book_id"], True), history[0]]))


def test_version_change_and_request_bounds(client):
    assert client.post("/api/v1/book-oracle/step", json={"version": "old", "events": []}).status_code == 409
    assert client.post("/api/v1/book-oracle/step", json={"version": VERSION, "events": [{"type": "guess", "book_id": "the-hobbit", "correct": False}] * 124}).status_code == 422


def test_step_is_rate_limited(client):
    for _ in range(120):
        assert client.post("/api/v1/book-oracle/step", json=payload([])).status_code == 200
    assert client.post("/api/v1/book-oracle/step", json=payload([])).status_code == 429


def test_source_file_is_shipped_with_application():
    data = json.loads((Path(__file__).parents[1] / "app/knowledge/book_oracle.json").read_text())
    assert data["version"] == VERSION


def test_browser_fixture_has_not_drifted_from_the_engine():
    from scripts.export_oracle_fixture import export_fixture

    path = Path(__file__).parents[3] / "apps/web/src/test/fixtures/book-oracle.json"
    assert json.loads(path.read_text()) == export_fixture()
