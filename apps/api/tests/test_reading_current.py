from datetime import UTC, datetime, timedelta
from types import SimpleNamespace

from conftest import login

from app.database import SessionLocal
from app.models import Author, Book, Genre, ReadingCurrentShare
from app.reading_current import (
    ARCHETYPES,
    GENRE_PROFILES,
    QUIZ_VERSION,
    TRAITS,
    _add_effects,
    _archetype,
    _empty_vector,
    _question_for_index,
    _ranked_genres,
)


def complete_voyage(client, choice_index=0):
    intro = client.get("/api/v1/reading-current")
    assert intro.status_code == 200
    payload = intro.json()
    question = payload["first_question"]
    answers = []
    question_ids = []
    for step in range(1, 9):
        question_ids.append(question["id"])
        answers.append({"question_id": question["id"], "answer_id": question["answers"][choice_index]["id"]})
        response = client.post(
            "/api/v1/reading-current/step",
            json={"version": payload["version"], "answers": answers},
        )
        assert response.status_code == 200
        next_payload = response.json()
        if step < 8:
            assert next_payload["status"] == "question"
            assert next_payload["question"]["step"] == step + 1
            question = next_payload["question"]
        else:
            assert next_payload["status"] == "complete"
    return answers, question_ids, next_payload["result"]


def add_catalog_books():
    with SessionLocal() as db:
        author = db.query(Author).first()
        slugs = [slug for slug in GENRE_PROFILES if slug != "adventure"]
        for index, slug in enumerate(slugs, start=1):
            name = slug.replace("-", " ").title()
            genre = Genre(name=name, slug=slug, description=f"{name} stories.")
            db.add(
                Book(
                    title=f"The {name} Passage",
                    slug=f"the-{slug}-passage",
                    isbn=f"978000001{index:04d}",
                    description=f"A sufficiently long {name.lower()} test description.",
                    publication_year=2025,
                    price_cents=1900 + index,
                    stock_qty=0,
                    cover_url="/covers/test.svg",
                    authors=[author],
                    genres=[genre],
                )
            )
        db.commit()


def test_voyage_completes_in_exactly_eight_deterministic_steps(client):
    add_catalog_books()
    first_answers, first_questions, first_result = complete_voyage(client)
    second_answers, second_questions, second_result = complete_voyage(client)

    assert len(first_answers) == 8
    assert len(set(first_questions)) == 8
    assert first_questions == second_questions
    assert first_result["primary_genre"] == second_result["primary_genre"]
    assert len(first_result["related_genres"]) == 2
    assert len(first_result["books"]) == 3
    assert any(not book["available"] for book in first_result["books"])


def test_branch_changes_when_an_earlier_answer_changes(client):
    add_catalog_books()
    intro = client.get("/api/v1/reading-current").json()
    question = intro["first_question"]
    first = {"question_id": question["id"], "answer_id": question["answers"][0]["id"]}
    changed = {"question_id": question["id"], "answer_id": question["answers"][2]["id"]}

    def first_adaptive(initial):
        answers = [initial]
        for _ in range(2):
            response = client.post("/api/v1/reading-current/step", json={"version": QUIZ_VERSION, "answers": answers}).json()
            current = response["question"]
            answers.append({"question_id": current["id"], "answer_id": current["answers"][0]["id"]})
        return client.post("/api/v1/reading-current/step", json={"version": QUIZ_VERSION, "answers": answers}).json()["question"]["id"]

    assert first_adaptive(first) != first_adaptive(changed)


def test_rejects_unknown_version_out_of_order_and_duplicate_answers(client):
    intro = client.get("/api/v1/reading-current").json()
    question = intro["first_question"]
    answer = {"question_id": question["id"], "answer_id": question["answers"][0]["id"]}
    assert client.post("/api/v1/reading-current/step", json={"version": "old", "answers": [answer]}).status_code == 409
    assert client.post("/api/v1/reading-current/step", json={"version": QUIZ_VERSION, "answers": [{**answer, "question_id": "engine"}]}).status_code == 422
    assert client.post("/api/v1/reading-current/step", json={"version": QUIZ_VERSION, "answers": [answer, answer]}).status_code == 422
    assert client.post("/api/v1/reading-current/step", json={"version": QUIZ_VERSION, "answers": [{**answer, "answer_id": "not-real"}]}).status_code == 422


def test_all_archetypes_have_a_canonical_vector():
    canonical = {
        "heartkeeper": {"connection": 10, "emotion": 10},
        "riddlekeeper": {"mystery": 10, "ideas": 10},
        "horizon-chaser": {"adventure": 10, "pace": 10},
        "elsewhere-dreamer": {"wonder": 10, "speculation": 10, "coming_of_age": 10},
        "quiet-cartographer": {"realism": 10, "introspection": 10, "ideas": 10},
        "night-lantern": {"darkness": 10, "emotion": 10},
    }
    assert set(canonical) == set(ARCHETYPES)
    for expected, values in canonical.items():
        vector = {trait: float(values.get(trait, 0)) for trait in TRAITS}
        assert _archetype(vector)["id"] == expected


def test_all_fourteen_genres_have_reviewed_profiles():
    assert len(GENRE_PROFILES) == 14
    assert all(set(profile) == set(TRAITS) for profile in GENRE_PROFILES.values())


def test_canonical_adaptive_paths_can_reach_every_profiled_genre():
    genres = [SimpleNamespace(slug=slug) for slug in GENRE_PROFILES]
    reached = set()

    def explore(index, vector, asked):
        question = _question_for_index(index, vector, genres, asked)
        for answer in question["answers"]:
            next_vector = vector.copy()
            _add_effects(next_vector, answer["effects"])
            next_asked = asked | {question["id"]}
            if index == 7:
                reached.add(_ranked_genres(next_vector, genres)[0].slug)
            elif len(reached) < len(GENRE_PROFILES):
                explore(index + 1, next_vector, next_asked)

    explore(0, _empty_vector(), set())
    assert reached == set(GENRE_PROFILES)


def test_signed_in_result_is_upserted_and_can_be_removed(client):
    answers, _, result = complete_voyage(client)
    headers = login(client)
    saved = client.put(
        "/api/v1/users/me/reading-current",
        json={"version": QUIZ_VERSION, "answers": answers},
        headers=headers,
    )
    assert saved.status_code == 200
    assert saved.json()["profile"]["result"]["primary_genre"] == result["primary_genre"]

    second = client.put(
        "/api/v1/users/me/reading-current",
        json={"version": QUIZ_VERSION, "answers": answers},
        headers=headers,
    )
    assert second.status_code == 200
    assert client.get("/api/v1/users/me/reading-current").json()["profile"] is not None
    assert client.delete("/api/v1/users/me/reading-current").status_code == 403
    assert client.delete("/api/v1/users/me/reading-current", headers=headers).status_code == 204
    assert client.get("/api/v1/users/me/reading-current").json()["profile"] is None


def test_guest_share_is_immutable_and_private_token_revocable(client):
    answers, _, result = complete_voyage(client)
    created = client.post(
        "/api/v1/reading-current/shares",
        json={"version": QUIZ_VERSION, "answers": answers},
    )
    assert created.status_code == 201
    share = created.json()
    token = share["url"].rsplit("/", 1)[-1]
    public = client.get(f"/api/v1/reading-current/shares/{token}")
    assert public.status_code == 200
    assert {key: value for key, value in public.json()["result"].items() if key != "completed_at"} == {
        key: value for key, value in result.items() if key != "completed_at"
    }
    assert client.get(f"/api/v1/reading-current/shares/{token}").json()["result"] == public.json()["result"]
    assert public.json()["display_name"] is None
    assert client.delete(f"/api/v1/reading-current/shares/{token}", headers={"X-Share-Revoke-Token": "wrong"}).status_code == 403
    assert client.delete(f"/api/v1/reading-current/shares/{token}", headers={"X-Share-Revoke-Token": share["revoke_token"]}).status_code == 204
    assert client.get(f"/api/v1/reading-current/shares/{token}").status_code == 410


def test_member_share_name_requires_explicit_consent(client):
    answers, _, _ = complete_voyage(client)
    headers = login(client)
    client.put("/api/v1/users/me/reading-current", json={"version": QUIZ_VERSION, "answers": answers}, headers=headers)

    anonymous = client.post("/api/v1/users/me/reading-current/shares", json={"include_display_name": False}, headers=headers)
    named = client.post("/api/v1/users/me/reading-current/shares", json={"include_display_name": True}, headers=headers)
    assert anonymous.status_code == named.status_code == 201
    assert anonymous.json()["display_name"] is None
    assert named.json()["display_name"] == "Test Reader"
    public_token = named.json()["url"].rsplit("/", 1)[-1]
    assert client.get(f"/api/v1/reading-current/shares/{public_token}").json()["display_name"] == "Test Reader"
    assert client.delete(f"/api/v1/users/me/reading-current/shares/{named.json()['id']}", headers=headers).status_code == 204
    assert client.get(f"/api/v1/reading-current/shares/{public_token}").status_code == 410


def test_expired_share_returns_dedicated_gone_state(client):
    answers, _, _ = complete_voyage(client)
    created = client.post("/api/v1/reading-current/shares", json={"version": QUIZ_VERSION, "answers": answers}).json()
    token = created["url"].rsplit("/", 1)[-1]
    with SessionLocal() as db:
        share = db.get(ReadingCurrentShare, created["id"])
        share.expires_at = datetime.now(UTC) - timedelta(seconds=1)
        db.commit()
    assert client.get(f"/api/v1/reading-current/shares/{token}").status_code == 410


def test_guest_share_creation_is_rate_limited(client):
    answers, _, _ = complete_voyage(client)
    for _ in range(10):
        assert client.post("/api/v1/reading-current/shares", json={"version": QUIZ_VERSION, "answers": answers}).status_code == 201
    assert client.post("/api/v1/reading-current/shares", json={"version": QUIZ_VERSION, "answers": answers}).status_code == 429
