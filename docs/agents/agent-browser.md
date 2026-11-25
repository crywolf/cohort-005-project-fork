# Giving the agent a browser

This is how you drive a page in the app, and ask it questions.

It uses [agent-browser](https://github.com/vercel-labs/agent-browser), a CLI
built for exactly this — one command per action, an answer on stdout.

## Once, per machine

```bash
npm install -g agent-browser
agent-browser install
```

## Asking your own question

Start the app with `npm run dev` first. The examples below use
`http://localhost:5173`, the dev server's default address — if `npm run dev`
printed a different one, use that.

A screenshot is pixels. To verify a fix you need a yes or a no, so read the
DOM:

```bash
agent-browser open http://localhost:5173/courses
agent-browser find placeholder "Search courses..." fill "typescript"
agent-browser find role button click --name "Search"

# Did the search reach the URL?
agent-browser get url

# How many course cards came back?
agent-browser get count 'a[href^="/courses/"]'

# What does the empty state say, if there is one?
agent-browser get text main

# Did anything break?
agent-browser errors
agent-browser console
```

The commands worth knowing: `open`, `click`, `fill`,
`find <role|text|label|placeholder> …`, `wait`, `get text|html|attr|count|url`,
`is visible|enabled|checked`, `eval`, `snapshot` (the accessibility tree, with
refs), `screenshot`, `console`, `errors`, `close`. `agent-browser --help` has
the rest.

**Ask the page, do not ask the person.** A change you have not looked at is a
change you are reporting on trust.

Screenshots are PR evidence: a before and an after for a change that shows in
the UI.

## Embedding screenshots in a PR

Screenshots are evidence, not source. Never commit them to the PR branch or
store them in releases or gists — host them in a **separate orphan commit** on
a `pr-assets/<pr-name>` branch, and link them from the PR body with
`blob/<sha>/<file>.png?raw=true` URLs. The orphan commit shares no history
with the branch, so the PR diff stays clean, and pinning the SHA keeps the
links working after merge.

```bash
# Build the orphan commit with git plumbing (never touches the worktree)
export GIT_INDEX_FILE=/tmp/pr-assets-index
git read-tree --empty
for f in before after; do
  sha=$(git hash-object -w /tmp/$f.png)
  git update-index --add --cacheinfo 100644,$sha,$f.png
done
commit=$(printf "PR screenshots for <branch-name> (#<n>)\n" | git commit-tree $(git write-tree))
git branch pr-assets/<pr-name> $commit
unset GIT_INDEX_FILE
git push origin pr-assets/<pr-name>

# Reference in the PR body (markdown form renders as <img>):
# ![after](https://github.com/<owner>/<repo>/blob/<full-sha>/after.png?raw=true)
```

Verify before reporting: `curl -sIL` each URL returns `200` + `content-type:
image/png`, and the PR's rendered HTML (issues API with the
`application/vnd.github.html+json` accept header) contains `<img>` tags, not
links.

Dead ends, verified — don't retry them:

- **Releases**: user rejected; don't create them for evidence.
- **Gists via API**: GitHub no longer decodes binary content, so the raw file
  serves as `text/plain` + `nosniff` — browsers refuse to render it.
- **`releases/download/...` URLs in markdown `![…]`**: GitHub's sanitizer
  turns them into plain links, not images.
- **Relative paths in the PR body** (`docs/…`): resolve against the default
  branch, not the PR branch — broken links.
- **`![](<raw.githubusercontent…>)` from the PR branch**: renders, but
  requires committing the images into the PR branch.
- **HTML `<img>` tags** do survive the sanitizer and render `releases/download`
  URLs — but that still requires release-hosted files, so it's moot here.

## Two things that will bite you

**Hydration lags "networkidle".** The button is in the server HTML before
React attaches its `onClick`, so the first click can be a silent no-op. Poll
for the click's effect and click again, rather than waiting a fixed time.

**Vite re-optimizes on the first load.** On a fresh checkout, the first page
load discovers dependencies Vite has not pre-bundled, and pushes a full-page
reload a moment after the response has finished. Absorb it once against a
throwaway load before the real loop; otherwise it lands mid-interaction and
every click after it hits a page that is already navigating away.
