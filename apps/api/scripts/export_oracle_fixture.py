"""Export deterministic Book Oracle browser fixtures without a database or server."""

import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.book_oracle import BOOKS, QUESTIONS, feature, introduction, replay  # noqa: E402


def export_round(book_id: str, overrides: dict[str, str] | None = None) -> dict:
    history = []
    answers = []
    states = {}

    def capture(events):
        state = dict(replay(tuple(events)))
        book_id = state.pop("book_id", None)
        if book_id:
            book = BOOKS[book_id]
            state["book"] = {key: book[key] for key in ("id", "title", "author", "shop_slug")}
            state["book"]["explanation"] = "Your clues about this story’s distinctive premise pointed here."
        wire_events = [
            {"type": kind, "question_id": key, "answer": value} if kind == "answer" else {"type": kind, "book_id": key, "correct": value}
            for kind, key, value in events
        ]
        states[json.dumps(wire_events, separators=(",", ":"))] = state
        return state, wire_events

    for _ in range(len(QUESTIONS) + 1):
        state, wire = capture(history)
        if state["status"] != "question":
            assert state["status"] == "guess" and state["book"]["id"] == book_id
            answers = wire
            break
        question_id = state["question"]["id"]
        value = feature(BOOKS[book_id], question_id)
        answer = (overrides or {}).get(question_id, "unknown" if value is None else "yes" if value else "no")
        history.append(("answer", question_id, answer))
    else:
        raise RuntimeError(f"{book_id} must be identifiable before exporting fixtures")
    for correct in (True, False):
        capture([*history, ("guess", book_id, correct)])
    return {"answers": answers, "states": states}


def export_fixture() -> dict:
    return {
        "manifest": introduction(),
        **export_round("the-hobbit"),
        "alice": export_round("alices-adventures-in-wonderland", {
            "journey": "no", "female": "yes", "animal": "yes",
            "before-1900": "unknown", "before-1850": "unknown", "before-1800": "unknown", "after-1950": "unknown",
        }),
    }


if __name__ == "__main__":
    destination = Path(__file__).resolve().parents[3] / "apps/web/src/test/fixtures/book-oracle.json"
    destination.write_text(json.dumps(export_fixture(), ensure_ascii=False, indent=2) + "\n")
    print(destination)
