# frontpagejews data

Everything the site shows, as the deploy last fetched it. This branch holds data
only and shares no history with `main`. The deploy checks it out at `var/data`,
fetches anything missing and pushes it back, so it stays complete by itself. To
get it locally, from the main checkout:

```bash
git fetch origin data
git worktree add var/data data
```

`gdelt/` holds each day's mentions per outlet domain, as `manage.py fetch_gdelt`
caches them: one JSON file per finished day since GDELT 2 began (2015-02-19), in
a folder per year: `gdelt/2024/2024-03-01.json`.

`benchmarks/` holds the population, GDP and conflict-deaths figures the site
compares against, as `manage.py fetch_benchmarks` last fetched them. The
deploy refetches them on every run and pushes any change.
