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

## Data Model

- `Outlet` -- a news source. `slug` is what the scrape command takes
  (`scrape nyt`).
- `DailyScrape` -- one run over one outlet's feeds on one day, holding
  `article_count`: how many unique articles were seen.
- `DailyCountryCount` -- how many of that scrape's articles mentioned one
  country, hanging off `DailyScrape` via `related_name="country_counts"`. Only
  non-zero counts are stored, so an absent row means no mentions.

### The database holds observations; code holds configuration

`DailyCount` is an observation and `Outlet` is a dimension of one, so both are
models. Feed URLs are input configuration: nothing joins to them, they are not
observed, and no non-developer edits them. They live in code, in the same
category as the country-variants data file, and `Outlet` rows are materialized
from that registry with `get_or_create`.

A `Feed` model was built and then removed. It was justified on the grounds that
the NYT needs four section feeds, which confused *needing four URLs* with
*needing a table*. Keeping feeds in code means a fresh clone can scrape with no
fixture or seed step, and a feed URL change is a reviewable commit rather than
an invisible state change in whichever environment someone clicked in.

### Decisions worth not relitigating

**`date` is the scrape date, not the article publication date.** RSS feeds are a
moving window of recent articles, not a per-day archive. Keyed on publication
date, any given day is only ever partially observed, and a later re-scrape sees
fewer old articles than the first pass did -- so a plain upsert would silently
shrink history. Keyed on scrape date, re-running on the same day overwrites the
same rows and counts converge. The stored figure is "what this outlet's feeds
looked like when we looked", which is the question the project is actually
asking.

**Matching runs against article titles only, and `count` is a single field.**
RSS feeds do carry descriptions (~145 chars, NYT 108/115 items, WSJ 40/40), but
they are unevenly supplied and vary in length by outlet and section, so matching
them turns feed formatting into fake coverage differences between outlets.
Titles are the one field everyone supplies identically. Measured over live NYT
and WSJ feeds, total mentions and mentioning-articles were identical in 28 of 29
rows when matching titles alone, so a second count field would be dead weight --
they only diverge once descriptions are included (10/21 NYT rows, 5/13 WSJ).

**`DailyScrape.article_count` is the denominator, and it is not optional.** Raw
per-country counts are not comparable between outlets that publish at different
volumes: 10 Iran mentions from the NYT's 97 articles is less attention than 5
from the WSJ's 40. It also separates a scrape that found no countries from one
that never ran, which are otherwise identical, since only non-zero counts are
stored. Neither is backfillable -- the articles are gone the next day.

**Counts hang off the scrape by FK rather than repeating date and outlet.** The
denominator query is the motivating one, and the FK makes it a single indexed
join instead of a two-column join on `(date, outlet)` with nothing backing it.
It also makes "this scrape's counts" a set that can be cleared and rewritten, so
a same-day re-scrape cannot strand a row for a country that has since dropped
out of the feed.

**`DailyScrape.outlet` is PROTECT; `DailyCountryCount.daily_scrape` is
CASCADE.** Scraped history is an irreplaceable observation, so deleting an
outlet must not silently discard months of it -- the escape hatch, if that
becomes annoying, is an `is_active` flag rather than switching to CASCADE. The
per-country counts, by contrast, genuinely are part of their scrape.

**`country_code` is indexed; `date` deliberately is not.** The unique constraint
already creates a composite index on `(date, outlet, country_code)`, and a
B-tree serves its leftmost prefix, so `date` needs nothing extra. `country_code`
is the third column and gets no such help. Measured over 500k rows, the
country-over-time query -- the one this project exists to run -- went from
15.0ms to 2.9ms with the index, while a separate `date` index moved a date-range
query only from 38.3ms to 32.8ms. SQLite falls back to a skip-scan without it;
Postgres largely cannot, so the index matters at least as much after the move.
`date` now lives on `DailyScrape`, where the unique constraint covers it.

## Testing

Test directories are packages (`tests/__init__.py`). Without that, two files
named `test_models.py` in different apps both import as the top-level module
`test_models` and pytest fails collection with an import file mismatch.

## Known Trade-offs

- **Matching is deliberately dumb**: substring matching against country name
  variants. False positives (Jordan the country vs. the name) are a known,
  deferred problem, to be handled with hand-written disambiguation rules in the
  country data file.
