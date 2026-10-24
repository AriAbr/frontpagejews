# frontpagejews

Tracks how often each country is mentioned in the output of major news outlets,
so the counts can later be compared against real-world event data (population,
GDP, conflict deaths, market moves).

## How it works

`manage.py fetch_gdelt` downloads GDELT's raw files for each finished day,
reduces them to per-domain article and country-mention counts, and caches one
JSON file per day under `var/data/gdelt/`. `var/data` is a worktree of the
`data` branch, which holds every day since 2015; the deploy pushes each new day
to it. Refetching it all takes about a day, so treat it as data, not a cache.
`manage.py fetch_benchmarks` caches World Bank population and GDP and UCDP's
conflict deaths under `var/data/benchmarks/`, so the branch holds everything the
site shows. Unlike the days, they're disposable: deleting them only means
re-downloading.

The site is static. `manage.py build_site` writes the dashboard to `build/`: the
page, a `data.json` of each outlet's daily mentions over the last 30 days, and
the scripts. The scripts work out everything that depends on the visitor's
choice of outlets, comparison country and benchmark in the browser
(`choices.js` and `chart-data.js`, tested with `npm test`). Locally,
`runserver` serves the same page and data.

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
separate because they are genuinely separable. `users/` here is that same
carve-out, and is the kind of thing that justifies a second app -- a new group
of domain models is not.

`users.User` subclasses `AbstractUser` and `AUTH_USER_MODEL` points at it. It
adds only a case-insensitive unique-email constraint for now. The point is that
it exists at all: `AUTH_USER_MODEL` cannot be repointed once migrations
referencing it have been applied, so a custom user model is nearly free on day
one and genuinely painful to retrofit later.

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

## Testing

Test directories are packages (`tests/__init__.py`). Without that, two files
named `test_models.py` in different apps both import as the top-level module
`test_models` and pytest fails collection with an import file mismatch.
