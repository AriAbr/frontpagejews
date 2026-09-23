# frontpagejews

Tracks how often each country is mentioned in the output of major news outlets,
so the counts can later be compared against real-world event data (population,
GDP, conflict deaths, market moves).

## How it works

A scheduled job hits ~20 news sources once or twice a day, matches article text
against a list of country name variants, and stores per-outlet per-day mention
counts. Only non-zero counts are stored. The article text itself is not
persisted.

## Tech Stack

- **Backend**: Django
- **Database**: SQLite for now; Postgres once the project moves into Docker
- **Package Management**: Poetry (`virtualenvs.in-project = true`, so the venv is `./.venv`)
- **Lint/format**: Ruff, via pre-commit
- **Testing**: pytest + pytest-django
- **Commits**: [conventional commits](https://www.conventionalcommits.org/) (e.g. `fix:`, `feat:`, `refactor:`)

## Layout

The Django *project* package is `app/` (settings, urls, wsgi, asgi). Domain apps
are siblings at the repo root -- currently just `frontpagejews/`. This mirrors
the eznashdb repo, where the domain app is named after the product.

### One domain app, on purpose

Mention counts, composite scores, and the real-world benchmark data (population,
GDP, conflict deaths, market moves) all live in `frontpagejews/`. They are one
domain: they join against each other on nearly every query and surface in the
same interface. Do not split them into `mentions/`, `scores/`, `benchmarks/`.

Django apps are a packaging and reusability unit, not a domain-modelling unit --
an app is something you could plausibly install into a different project. Split
by *concern*, not by model type. eznashdb does exactly this: `eznashdb` holds
the whole domain (`Shul`, `Room`, ...), while `users` and `feedback` are
separate because they are genuinely separable. A second app here would be
justified for something like auth, not for a new group of models.

The cost is asymmetric, which is why this is the default:

- Splitting a *module* later is free -- `models.py` becomes a `models/` package,
  or `scoring.py` lands next to it. No migration involvement.
- Splitting an *app* later is expensive -- moving a model between apps needs
  `SeparateDatabaseAndState` surgery, a cross-app edge in the migration graph,
  and table renames.

So grow modules freely inside `frontpagejews/` and leave app boundaries alone.

Avoid app names that shadow installed packages, since the project root is on
`sys.path`. `coverage/` would be the natural name for this domain and is exactly
the trap -- it would shadow `coverage.py` the moment `pytest-cov` is added.

## Conventions

- Everything environment-specific comes from `os.environ`, loaded from a
  gitignored `.env` by `python-dotenv` at the top of `app/settings.py`.
  `.env.example` lists the keys with no values.
- Nothing machine-specific is committed. In particular there is no default port
  anywhere in the repo; `make web` requires `PORT` in `.env` and fails loudly
  without it.
- Two switches drive conditionals in settings: `DEBUG` (bool) and `DJANGO_ENV`
  (`dev`/`test`/`prod`).

## Known Trade-offs

- **Matching is deliberately dumb**: substring matching against country name
  variants. False positives (Jordan the country vs. the name) are a known,
  deferred problem, to be handled with hand-written disambiguation rules in the
  country data file.
