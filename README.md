# frontpagejews

Tracks how often each country is mentioned in the output of major news outlets,
so the counts can be compared against real-world event data.

## Setup

```bash
cp .env.example .env
poetry install
poetry run python -c 'from django.core.management.utils import get_random_secret_key as k; print(k())'
# paste into SECRET_KEY in .env, and pick a free PORT
make web
```

Then open `http://localhost:$PORT/`.

The GDELT days fetched so far live on the `gdelt-data` branch, which holds only
data. Check it out at `var/gdelt`, where the site reads them:

```bash
git fetch origin gdelt-data
git worktree add var/gdelt gdelt-data
```

The deploy fetches any day that's missing and pushes it there; `git pull` in
`var/gdelt` brings the new days in.
