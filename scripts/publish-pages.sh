#!/bin/sh
# Publishes a folder of files to one subfolder of the public repository's website branch (gh-pages), without touching the other subfolders.
#   scripts/publish-pages.sh <subfolder> <source folder> [merge]
# Subfolders: knowledge (daily model database), packs (content packs), releases (latest.json, downloads.json, SHA256SUMS), docs (the website).
# With "merge" the files are added to the subfolder instead of replacing it.
# Needs the key PUBLIC_DEPLOY_KEY (a deploy key with write access to kadamraval/gencraft) in the environment. The branch is kept as ONE commit
# (amended and force-pushed), so the repository never grows. Every workflow that calls this one shares the concurrency group "publish", so
# two runs never write at the same time.
set -eu
sub="$1"
src="$2"
mode="${3:-}"
here="$(pwd)"
repo="git@github.com:kadamraval/gencraft.git"

mkdir -p ~/.ssh
printf '%s\n' "$PUBLIC_DEPLOY_KEY" > ~/.ssh/gencraft_public
chmod 600 ~/.ssh/gencraft_public
ssh-keyscan github.com >> ~/.ssh/known_hosts 2>/dev/null
export GIT_SSH_COMMAND="ssh -i $HOME/.ssh/gencraft_public -o IdentitiesOnly=yes"

work="$(mktemp -d)"
if git clone --depth 1 --branch gh-pages "$repo" "$work" 2>/dev/null; then
  :
else
  git init -q "$work"
  git -C "$work" checkout -q -b gh-pages
  git -C "$work" remote add origin "$repo"
fi
cd "$work"
git config user.name "gencraft-bot"
git config user.email "gencraft-bot@users.noreply.github.com"
if [ "$mode" != "merge" ]; then rm -rf "./$sub"; fi
mkdir -p "./$sub"
cp -R "$here/$src/." "./$sub/"
touch .nojekyll
printf '<!doctype html><meta charset="utf-8"><meta http-equiv="refresh" content="0; url=docs/"><title>Gencraft</title><p><a href="docs/">Gencraft documentation</a></p>\n' > index.html
git add -A
stamp="$(date -u +%Y-%m-%dT%H:%MZ)"
if git rev-parse -q --verify HEAD >/dev/null 2>&1; then
  git commit -q --amend --allow-empty -m "Gencraft site $stamp"
else
  git commit -q -m "Gencraft site $stamp"
fi
git push -q --force origin gh-pages
echo "Published $src to /$sub/"
