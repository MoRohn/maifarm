# Manual Test Assets

This directory groups ad-hoc testing utilities that previously lived at the repository root. They are intentionally separated from automated suites (`tests/`) to keep the top-level workspace tidy while preserving manual debugging workflows.

## Structure

- `browser/` – HTML fixtures that can be opened directly in a browser to exercise WebSocket streams, UI widgets, and terminal rendering behaviours.
- `scripts/` – Node.js/TypeScript scripts for targeted workflow validation (farm lifecycle, provider orchestration, API smoke checks, etc.).
- `results/` – Archived outputs or scratch results captured from manual sessions. Safe to delete after review.

All files remain executable in-place; update any personal shell aliases to reference the new paths. Documentation that references these resources has been updated to the new locations.
