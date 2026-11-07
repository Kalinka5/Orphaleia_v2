# The Book Oracle

Open `/book-oracle` or use the Book Oracle link in navigation. Guest readers think of a title from the 100-work library, answer questions about the book, and confirm or reject a guess. The oracle has its own route and knowledge library.

## Knowledge and maintenance

`apps/api/app/knowledge/book_oracle.json` is the versioned, developer-maintained library. It includes all 13 seeded shop titles plus 87 other well-known works, mostly classics. Individual fairy tales, plays, novels, and story collections count as works; series and alternative editions do not get duplicate entries. `shop_slug` is optional and only becomes a link if the live catalog has an active match. Books remain guessable when absent or out of stock.

Every work has primary publisher/author or library source references. Standard Ebooks descriptions and Project Gutenberg editions/catalog records were consulted for the classics; publisher and author-estate pages cover the remaining titles. References are editorial provenance, never fetched during play. No external AI service or credentials are used at runtime. Questions and explanations are original short paraphrases, not copied descriptions.

The broad features describe the central premise or main concern, rather than every incidental mention. `true` and `false` are reviewed positive/negative judgments; `null` explicitly means uncertain and must not be converted to `false`. Original publication years concern the work rather than the cited modern edition. Ancient dates are approximate; only broad date ranges are asked. Hallmarks distinguish one specific premise from the other 99 works and avoid endings and major twists.

When adding or revising a title, verify both its broad features and its hallmark against sources, check that the hallmark does not also fit another supported title, and run all-title simulations. Keep the library at 100 works unless changing the product scope. Bump the knowledge version whenever clues, scoring, question order, or membership changes so older tab saves cannot be replayed against a different game. Update the bounded input length (question-bank size plus three guesses) and regenerate the browser fixture and OpenAPI types when those limits change.

## Engine and API

`GET /api/v1/book-oracle` returns the introduction, library size, answer buttons, and version. `POST /api/v1/book-oracle/step` accepts that version and an ordered transcript of answer or guess-confirmation events, including an empty transcript to begin. It deterministically replays and validates every event and returns `question`, `guess`, `success`, or `defeat`. The OpenAPI contract includes discriminated event and response types. Use the repository's normal OpenAPI generation command after changing it.

Equal initial candidate weights are updated with likelihood ratios: definite answers use 0.97/0.03, tentative answers 0.90/0.10, and unknown book features 0.5. “Don’t know” does not change weights. The next unused question maximizes expected distinguishing information, subtracting uncertainty in book metadata. Ties follow stable editorial order. A guess based on broad features requires a normalized weight of at least 0.95, three supporting answers, at least one positive recognized feature, and no contradictory definite answers. These are internal ranking heuristics, not calibrated confidence percentages or a guarantee that the player's book is in the library.

A definite **Yes** to a work’s exclusive plot clue is decisive recognition and immediately offers that title for confirmation. For example, confirming the girl following a white rabbit leads directly to an Alice guess, even if the reader did not consider her dream a journey or did not know its publication date. “Probably,” “No,” and “Don’t know” retain their normal weighted behavior. Broad editorial categories cannot veto this direct recognition.

Rejected guesses are excluded; the third rejection ends the round. Rejecting a title also withdraws the evidence from its exclusive plot clue, so it cannot keep biasing the search or contradicting every other book. The rejected title’s clue is not asked again. There is no fixed question count. The round also ends when useful unused questions run out. Unknown answers, conflicting memories, and books outside the library can lead to defeat; Back lets readers revise earlier clues.

The endpoint uses the existing IP limiter (120 requests/minute). No database rows, account history, typed titles, or analytics events are added. A bounded process-local cache holds only anonymous transcripts and computed states; inventory links are resolved separately on every request. The browser stores only the version and committed transcript in `sessionStorage`; retries replay the same pending transcript, and unavailable storage does not prevent play.

## Verification

- Backend: `apps/api/.venv/bin/pytest apps/api/tests/test_book_oracle.py`.
- Frontend: `cd apps/web && npm test -- --run src/test/BookOracle.test.tsx && npm run build`.
- Browser: `cd apps/web && ORACLE_LIVE=1 npx playwright test e2e/book-oracle.spec.ts --workers=1`. Start the local stack first. Without `ORACLE_LIVE`, the complete-round test uses the checked-in transcript fixture instead of the live API.
- The browser fixture in `apps/web/src/test/fixtures/book-oracle.json` contains actual engine states for a truthful Hobbit round plus an Alice regression round with unknown dates and a conflicting journey interpretation (with representative display text and shop links). Regenerate it using `apps/api/.venv/bin/python apps/api/scripts/export_oracle_fixture.py` after a knowledge change. Browser runs capture introduction, question, guess, success, and dark-mode screenshots in their test output directory.

Four original generated oracle illustrations are served from `/assets/book-oracle/` as transparent WebP files. Their welcoming, thinking, successful, and defeated poses share the same identity. The page honors reduced motion and provides light/dark game surfaces using the shop's existing fonts and brand colors.
