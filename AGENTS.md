# Agent instructions

## Git workflow (mandatory)

Every change reaches `main` through **Issue → Branch → Pull Request → Review → Merge**, as defined in [CONTRIBUTING.md](CONTRIBUTING.md).

Never commit, push, or merge directly to `main`, not even for a one-line fix. A commit is only half the job: when you commit, you must also open the pull request.

1. **Issue first.** Create a new issue or pick an existing one and assign it. Title format: `[Bug]`, `[Feature]` or `[Task]` plus a short description.
2. **Branch** from an up-to-date `main`: `git switch main && git pull && git switch -c <type>/<short-description>`.
   Types: `feat`, `fix`, `docs`, `style`, `refactor`, `perf`, `test`, `chore`.
3. **Commit** on the branch.
4. **Check for merge conflicts (mandatory) before marking the PR ready for review.** Run `git fetch origin && git merge-tree --write-tree origin/main HEAD`. Exit code 0 with no `CONFLICT` lines means the branch merges cleanly. If there are conflicts, run `git merge origin/main` (never rebase or force-push a shared branch), resolve them keeping both sides' intent, run `npm run lint` and `npm run build` again, push, and check again. Mark the PR ready for review only when the check is clean.
5. **Pull request** against `main`. Title format: `<type>(<scope>): <description>`, for example `feat(layers): add thermal data overlay`. The description links the issue with `Closes #<issue-number>`. While the work is in progress, open it as a draft (`gh pr create --draft`), and run `gh pr ready` once it is finished and the checks pass. If a PR that is ready needs more work, for example to resolve conflicts, convert it back first with `gh pr ready --undo`.
6. **Review.** One approval from a teammate other than the author. The author cannot approve their own PR.
7. **Merge** with **Squash and merge** on GitHub, then delete the branch. Never merge a draft.

Before asking for review: `npm run lint` and `npm run build` must pass, the branch has no merge conflicts with an up-to-date `main`, and the PR contains only the changes for its issue. One PR resolves one issue.

## Environment notes (this machine)

`git` and `gh` are installed outside the system PATH:

- Git: `%LOCALAPPDATA%\Programs\PortableGit\cmd\git.exe`
- GitHub CLI: `%LOCALAPPDATA%\Programs\gh\bin\gh.exe` (authenticated as `JVPresti`, `gh auth setup-git` already configured)
