# GDELT days

Each day's mentions per outlet domain, as `manage.py fetch_gdelt` caches them:
one JSON file per finished day since GDELT 2 began (2015-02-19), in a folder
per year: `2024/2024-03-01.json`.

This branch holds data only and shares no history with `main`. The deploy
checks it out at `var/gdelt`, fetches any day that's missing and pushes the new
days back, so it stays complete by itself. To get it locally, from the main
checkout:

```bash
git fetch origin gdelt-data
git worktree add var/gdelt gdelt-data
```
