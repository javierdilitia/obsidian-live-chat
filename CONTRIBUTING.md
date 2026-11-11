# Contributing

## Prerequisites

- [uv](https://docs.astral.sh/uv/) and Python 3.12
- Node 22 (see `.nvmrc`) and pnpm 10

## Setup

From the repo root:

```bash
uv sync --all-packages --directory backend
pnpm --dir web install
uv run --project backend pre-commit install --install-hooks -t pre-commit -t commit-msg -t pre-push
python scripts/check.py all
```

## Branches

Branch off `main` and name the branch by its kind: `feat/…`, `fix/…`, `chore/…`, `docs/…`. Changes reach `main` only through a pull request.

## Commit messages

[Conventional Commits](https://www.conventionalcommits.org/). Allowed types:

`feat` `fix` `docs` `chore` `refactor` `test` `ci` `build` `perf`

Add `!` for a breaking change (`feat!: …`). A scope is optional (`feat(web): …`). The `commit-msg` hook and the CI `commits` job both enforce this.

## Hooks

| Stage | What runs |
|---|---|
| `pre-commit` | trailing whitespace, end of file, YAML/JSON/TOML checks, large-file guard (500 KB), ruff check + format, Prettier + ESLint fix on web files, gitleaks secret scan |
| `commit-msg` | Conventional Commits check |
| `pre-push` | pyright, pytest, `tsc`, Vitest |

Heavy checks run on pre-push only, so commits stay fast. CI runs the same checks, so skipping hooks with `--no-verify` won't get a change past review.

## Checks

Every check is defined once, in `scripts/check.py`. Hooks and CI call it.

```bash
python scripts/check.py all        # everything CI runs
python scripts/check.py backend    # ruff format/check, pyright, pytest, uv build
python scripts/check.py web        # prettier, eslint, tsc, vitest, vite build
```

Run `python scripts/check.py all` before opening a PR.

## Pull requests

- Fill in the PR template.
- Update `CHANGELOG.md` under **Unreleased** for anything a user or teammate would notice.
- All four CI jobs (`backend`, `web`, `secrets`, `commits`) must be green.

## Dependencies

- Lockfiles (`backend/uv.lock`, `web/pnpm-lock.yaml`) are committed. CI installs with `--locked` / `--frozen-lockfile`.
- **A2UI packages are pinned to exact versions**, never ranges: A2UI still ships breaking changes. An A2UI upgrade is its own PR, and that PR also refreshes `.claude/skills/a2ui/references/llms-full.txt` and its `SOURCE.md`.
- Dependabot opens weekly grouped updates per ecosystem.

## Testing

- Python: pytest, with the shared `CatalogSourceContract` suite for any data source. Coverage must stay at or above 80% for the data packages.
- Web: Vitest + Testing Library.
- **No screenshot or headless-browser tooling** (Playwright, Chromium, Puppeteer) in this repo. Check rendered UI by reading the code and opening it yourself.
