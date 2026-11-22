# Pull requests and stacked PRs

## The trunk

The working trunk is `notifications`. The repository's default branch `main`
is a stub with unrelated history, so any tool that "defaults to the default
branch" targets the wrong branch here.

Name the trunk explicitly in every PR and stack command:
`gh pr create --base notifications …`, `gh stack … --base notifications`.

This is not a style preference. gh-stack commands without `--base` assume the
default branch and will retarget real PRs to `main` as a side effect — and a
PR whose base became `main` cannot be reopened, because the histories are
unrelated (this has already bricked a PR in this repo).

## Stacked PRs with `gh stack`

The `gh stack` extension (`github/gh-stack`) is installed. A stack is two or
more PRs where each targets the branch of the PR below it and the bottom one
targets the trunk.

### Building a stack

1. Create one branch per layer, each branching off the previous layer's
   branch; the bottom one branches off `notifications`. Make each layer's
   commits reviewable as a unit before stacking.
2. `gh stack init --base notifications <bottom> <mid> <top>` — adopts
   existing branches, bottom to top.
3. `gh stack submit` — pushes all branches and opens an editor to title,
   describe, and draft each PR, then creates them chained correctly.
   Non-interactive: `gh stack submit --auto`.

Done when: one open PR per layer, each targeting the branch below it, the
bottom one targeting `notifications`, and the stack banner visible on each
PR page.

### Finding an existing stack

- `gh stack checkout` (bare) — interactive picker listing every stack:
  locally tracked ones and stacks that exist only on GitHub.
- `gh stack checkout <PR-number or URL>` — discovers the stack containing
  that PR from the GitHub API and adopts it locally.

This is the only discovery path. `view` and bare `sync`/`merge` operate on
the *locally tracked* stack and report "not part of a stack" otherwise.
Checkout only sets up local branches and tracking; it does not touch PRs.

### Merging a stack

Land bottom-up with one command:

```bash
gh stack merge <top-PR-number>          # interactive wizard
gh stack merge <top-PR-number> --yes --merge
```

Given a PR number it works without local tracking. The merge is atomic: every
PR up to that one is merged in order, or none are.

Use merge commits (`--merge`). Each layer in this repo's stacks is a single
curated commit, so squash and rebase only rewrite SHAs — and rewritten SHAs
linger inside the upper stack branches, duplicating lower-layer content into
the next PR's diff until the chain is rebased. With merge commits, upper
branches stay descendants of `notifications` after each merge, so every
retargeted PR's diff is exactly its own layer.
