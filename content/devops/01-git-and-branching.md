# 1. Git & Branching Strategy

---

## 1.1 The model: three trees plus the object store

```
Working directory  ──git add──►  Staging (index)  ──git commit──►  Local repo (HEAD)
                                                                     │ git push
                                                                     ▼
                                                                Remote repo
```

Git stores **snapshots**, not diffs. Every commit is an object containing a tree hash, parent hash(es), author, message — and its own SHA is derived from all of that, which is why rewriting any commit changes every commit after it.

```bash
git cat-file -p HEAD          # see the raw commit object
git log --oneline --graph --all --decorate
git reflog                    # every position HEAD has held — your undo history for 90 days
```

**`reflog` is the answer to almost every "I destroyed my work" panic.** Nothing reachable from reflog is really gone.

> **Asked as:** "What's the difference between the working tree, the index, and HEAD?" · "Does Git store diffs?" · "How do you recover a commit you deleted?"

---

## 1.2 The commands people get wrong

```bash
# reset: move the branch pointer
git reset --soft  HEAD~1     # undo the commit, keep changes STAGED
git reset --mixed HEAD~1     # undo the commit, keep changes in the WORKING TREE (default)
git reset --hard  HEAD~1     # undo the commit and DISCARD the changes  ← the dangerous one

# revert: a NEW commit that undoes an old one — safe on shared branches
git revert <sha>

# restore / switch (modern, clearer than the overloaded `checkout`)
git restore --staged file.py     # unstage
git restore file.py              # discard working-tree changes
git switch -c feature/x          # create and switch branch

# stash
git stash push -m "wip: refactor" -- src/
git stash list && git stash pop

# cherry-pick a single commit onto the current branch
git cherry-pick <sha>

# interactive rebase: squash, reword, reorder, drop before opening a PR
git rebase -i HEAD~5
git rebase --onto main feature-base feature   # move a branch to a new base

# who broke it, in log(n) steps
git bisect start && git bisect bad && git bisect good v1.4.0
```

**Merge vs rebase:**

| | Merge | Rebase |
|---|---|---|
| History | Preserves the true topology; adds a merge commit | Linear, replayed commits |
| Safety | Safe on shared branches | **Never rebase a branch others have pulled** — it rewrites SHAs |
| Conflict resolution | Once | Potentially per commit |
| Use for | Integrating a feature into `main` | Tidying your own branch before review |

The common team rule: **rebase your feature branch onto `main` to keep it current, merge (or squash-merge) it into `main`.**

> **Asked as:** "`reset` vs `revert`." · "`--soft` vs `--mixed` vs `--hard`." · "Merge vs rebase — when is rebase dangerous?" · "How do you find the commit that introduced a bug?"

---

## 1.3 Branching strategies

| Strategy | Shape | Fits |
|---|---|---|
| **Trunk-based** | Short-lived branches (<1 day) merged to `main`; release behind feature flags | Teams deploying daily+; the CD default |
| **GitHub Flow** | `main` + feature branches + PR + deploy on merge | Most web products |
| **GitLab Flow** | GitHub Flow + environment branches (`staging`, `production`) | Teams with gated environments |
| **Git Flow** | `develop`, `release/*`, `hotfix/*`, `feature/*` | Versioned/on-prem software with parallel releases; heavyweight for SaaS |

**Trunk-based + feature flags** is the mainstream answer in 2026: long-lived branches accumulate merge pain and hide integration problems until the end. Flags decouple *deploy* from *release*, which is also what makes canaries and instant rollback possible.

```python
if flags.enabled("new-billing-engine", user=request.user):
    return new_billing.calculate(order)
return legacy_billing.calculate(order)
```

Remove flags once rolled out — a codebase full of stale flags is its own kind of debt.

> **Asked as:** "Which branching strategy and why?" · "What problem do feature flags solve?" · "Why are long-lived branches bad?"

---

## 1.4 Commits, PRs, and history hygiene

**Conventional Commits** — machine-readable, drives changelogs and semantic versioning:

```
feat(billing): support partial refunds

Refunds can now be issued for a subset of order lines. The gateway call is
idempotent on (order_id, line_ids) so retries are safe.

Closes #482
BREAKING CHANGE: RefundRequest.amount is now required
```

Types: `feat`, `fix`, `docs`, `refactor`, `perf`, `test`, `build`, `ci`, `chore`. `feat` → minor bump, `fix` → patch, `BREAKING CHANGE` → major.

**A good commit** is one logical change that builds and passes tests on its own. A good PR is **small** (under ~400 lines changed is where review quality falls off a cliff), has a description that says *why*, and links to the issue.

**Merge strategies:**
- **Squash merge** — one clean commit per PR. Simple `main` history; loses intermediate commits.
- **Merge commit** — preserves the branch's commits and the topology.
- **Rebase merge** — linear history, no merge commit, keeps individual commits.

Pick one per repo and enforce it in branch protection.

**Branch protection you should always turn on:** require PR review, require status checks (build/test/lint/security) to pass, require branches to be up to date, block force-push to `main`, and require signed commits for anything regulated.

> **Asked as:** "What makes a good commit message?" · "Squash vs merge commit." · "How big should a PR be?"

---

## 1.5 Conflicts, and recovering from mistakes

```bash
# During a conflict
git status                         # which files
git diff --name-only --diff-filter=U
# edit files, remove <<<<<<< ======= >>>>>>> markers
git add resolved.py && git rebase --continue    # or: git merge --continue
git rebase --abort                 # bail out entirely

# Make Git remember how you resolved a recurring conflict
git config --global rerere.enabled true

# I committed to the wrong branch
git reset --soft HEAD~1 && git stash && git switch correct-branch && git stash pop

# I need to undo a bad merge already pushed to main
git revert -m 1 <merge-sha>        # -m 1 = keep the first parent (main)

# I force-pushed over a colleague's work
git reflog                         # find the old SHA
git push --force-with-lease origin <sha>:main   # ALWAYS --force-with-lease, never --force

# I committed a secret
# 1. ROTATE THE SECRET IMMEDIATELY — it's public the moment it's pushed
# 2. Then purge history:
git filter-repo --path config/secrets.yml --invert-paths
```

`--force-with-lease` refuses the push if the remote moved since you fetched — it's the difference between "I'm rewriting my branch" and "I just deleted someone's afternoon".

> **Asked as:** "How do you resolve a merge conflict?" · "You pushed a secret to a public repo — what now?" · "`--force` vs `--force-with-lease`." · "How do you undo a pushed merge?"

---

## 1.6 Repo hygiene

```gitignore
# .gitignore — never commit these
.env
.env.*
*.pem
node_modules/
__pycache__/
dist/
.DS_Store
```

- **Never commit secrets, build artifacts, or dependencies.** Add a pre-commit hook with `gitleaks`/`detect-secrets` plus a CI scan — humans forget.
- **Lockfiles ARE committed** (`package-lock.json`, `uv.lock`, `Cargo.lock` for binaries) — they're what makes builds reproducible.
- **Large files** → Git LFS, or better, object storage. A 200 MB binary in history is in every clone forever.
- **Pre-commit hooks** (the `pre-commit` framework) for format, lint, and secret scanning — fast checks locally, the full suite in CI.
- **Monorepo vs polyrepo**: monorepo gives atomic cross-project changes and one version of the truth, at the cost of needing tooling (Nx, Turborepo, Bazel) to avoid rebuilding everything; polyrepo gives independence at the cost of cross-cutting changes becoming multi-PR dances.
- **`CODEOWNERS`** to auto-request the right reviewers.

> **Asked as:** "What should never be in Git?" · "Do you commit lockfiles?" · "Monorepo or polyrepo?"

---

## 1.7 Rapid-fire answers

| Question | Answer |
|---|---|
| `fetch` vs `pull` | Download refs vs download + merge/rebase into the current branch |
| Fast-forward merge | Pointer move when there's no divergence; `--no-ff` forces a merge commit |
| Detached HEAD | HEAD points at a commit, not a branch — commit there and you must create a branch or lose it |
| `git clean -fd` | Delete untracked files and directories (dry run with `-n` first) |
| Tag vs branch | Immutable pointer to a release vs moving pointer |
| Annotated tag | `git tag -a v1.2.0 -m "..."` — has an author, date, message; use for releases |
| Submodule vs subtree | Pointer to another repo (fiddly) vs vendored copy (simpler, larger) |
| `.gitattributes` | Line endings, diff drivers, LFS filters, `linguist` overrides |
| Shallow clone | `--depth 1` for fast CI checkouts |
| Signed commits | GPG/SSH/Sigstore signing so provenance is verifiable — increasingly required by supply-chain policy |
