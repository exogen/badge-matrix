#!/bin/bash
set -e
# Deployment is complicated by the fact that we don't want to push Verdana.ttf
# to GitHub (for license reasons), but the file needs to get to Heroku somehow.
# Note that our usage of Verdana.ttf here isn't against the license, it's
# distributing it via GitHub that's the problem. So, inspired by shields.io,
# this script makes a special temporary branch for Heroku and pushes that.

# `npm run check-font` would be better, but the resulting double huge npm error
# message is really annoying.
./scripts/check-font.sh

# Fail if the `heroku` remote isn't there.
git remote show heroku

# Necessary for combining the Cairo and Node.js buildpacks.
heroku buildpacks:set https://github.com/ddollar/heroku-buildpack-multi.git || true

git stash # Stash uncommitted changes.
git checkout -B deploy # Force branch creation/reset.
git add -f ./Verdana.ttf # Force add ignored font file.
# Use the same commit message, but add a little note.
git commit -m "$(git log -1 --pretty=%B) [deploy branch: do NOT push to GitHub]"
git push -f heroku deploy:master
git rm --cached ./Verdana.ttf # Otherwise, switching branches will remove it.
git checkout - # Switch back to whatever branch we came from.
git branch -D deploy # Just to prevent someone accidentally pushing to GitHub.
git stash pop --index || true # Restore uncommitted changes, OK if none.
