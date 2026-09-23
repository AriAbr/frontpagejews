SHELL := /bin/bash
.ONESHELL:

.venv: pyproject.toml
	echo "running .venv..."
	poetry install
	touch .venv

migrations := $(wildcard */migrations/*.py)

clean:
	rm -vf .git/hooks/{pre-{commit,push},commit-msg}
	rm -rf .venv

# PORT is read from .env and is intentionally not committed -- it only exists
# because runserver has to bind something, and goes away once this project
# sits behind a hostname-based proxy.
# Read through dotenv rather than `source`, so make and Django parse .env
# identically and values with shell metacharacters are safe.
web: .venv $(migrations)
	PORT=$$(poetry run python -c 'import os; from dotenv import load_dotenv; load_dotenv(".env"); print(os.getenv("PORT", ""))')
	if [[ -z "$$PORT" ]]; then
		echo "PORT is not set. Add PORT=<a free port> to .env (see .env.example)." >&2
		exit 1
	fi
	poetry run python manage.py migrate
	poetry run python manage.py runserver 0.0.0.0:$$PORT

ci:
	poetry run pre-commit run --show-diff-on-failure --color=always --all-files

test:
	poetry run pytest -ra -q --disable-warnings --tb=long

.PHONY: clean web ci test
