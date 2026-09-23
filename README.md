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
