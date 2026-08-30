from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

from pydantic import ValidationError

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.database import SessionLocal
from app.rankings import RankingImportDocument, import_ranking_dataset


def main() -> None:
    parser = argparse.ArgumentParser(description="Import a normalized licensed annual book-sales ranking dataset.")
    parser.add_argument("document", type=Path, help="Path to the normalized ranking JSON document")
    parser.add_argument("--publish", action="store_true", help="Publish immediately; requires exact_units_public in the document")
    args = parser.parse_args()

    try:
        document = RankingImportDocument.model_validate(json.loads(args.document.read_text()))
    except (OSError, json.JSONDecodeError, ValidationError) as error:
        parser.error(str(error))

    with SessionLocal() as db:
        try:
            result = import_ranking_dataset(db, document, publish=args.publish)
        except ValueError as error:
            parser.error(str(error))

    state = "unchanged" if result.unchanged else "imported"
    publication = "published" if result.dataset.published_at else "unpublished"
    print(f"Dataset {result.dataset.id}: {state}, {publication}")


if __name__ == "__main__":
    main()
