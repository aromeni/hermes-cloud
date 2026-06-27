#!/bin/sh
set -e

# Git identity for automated commits made by hermes
git config --global user.email "hermes@autonomous.bot"
git config --global user.name "Hermes"

# Git HTTPS auth so hermes can push branches and create PRs
if [ -n "$GITHUB_TOKEN" ]; then
    printf 'machine github.com login git password %s\n' "$GITHUB_TOKEN" > ~/.netrc
    chmod 600 ~/.netrc
fi

exec uvicorn app.main:app --host 0.0.0.0 --port 8000
