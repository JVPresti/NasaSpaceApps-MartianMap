# Contributing

Every change reaches `main` the same way:

**Issue → Branch → Pull Request → Review → Merge**

Nobody commits, pushes, or merges directly to `main`, not even for a one-line fix.

## Workflow

1. **Open an issue** describing the work, or pick an existing one. Assign yourself so nobody duplicates it.
2. **Create a branch** from an up-to-date `main`:

   ```bash
   git switch main
   git pull
   git switch -c feat/thermal-layer
   ```

3. **Do the work** and push your branch.
4. **Check for merge conflicts. This step is mandatory.** Before you open the pull request, check that your branch merges into an up-to-date `main` without conflicts:

   ```bash
   git fetch origin
   git merge-tree --write-tree origin/main HEAD
   ```

   It exits with code 0 and prints no `CONFLICT` lines when the merge is clean. `git merge-tree --write-tree` needs Git 2.38 or newer; on older Git, run `git merge --no-commit --no-ff origin/main`, read the result, then `git merge --abort`.

   If there are conflicts, merge `main` into your branch, resolve them, check again and push:

   ```bash
   git merge origin/main
   # fix every file listed as conflicted, keeping the intent of both sides
   git add <files>
   git commit
   npm run lint && npm run build
   git push
   ```

   Merge `main` into your branch; do not rebase or force-push a branch that someone else may have pulled. Open the pull request only once the check is clean.
5. **Open a pull request** against `main` and link the issue in the description with `Closes #<issue-number>`.
6. **Get a review.** Any teammate other than the author can review. One approval is enough.
7. **Merge the pull request** on GitHub once it is approved. The linked issue closes automatically.

One pull request resolves one issue. If the work grows beyond the issue, open a new issue for the extra part.

## Issues

Title format: `[Type] Short description`

| Type        | Use it for                                    | Example                                        |
| ----------- | --------------------------------------------- | ---------------------------------------------- |
| `[Bug]`     | Something is broken or behaves wrong          | `[Bug] Robot arm moves in the wrong direction` |
| `[Feature]` | New functionality                             | `[Feature] Add thermal data layer to the map`  |
| `[Task]`    | Everything else: docs, refactors, setup, chores | `[Task] Document the NASA data sources`        |

Picking a template when you create the issue fills in the prefix and the sections for you.

A good issue says what is needed and how we will know it is done. Keep it small enough for one pull request.

## Branches

Format: `<type>/<short-description>`, lowercase, words separated by hyphens.

| Type       | Use it for                                      | Example                      |
| ---------- | ----------------------------------------------- | ---------------------------- |
| `feat`     | New functionality                               | `feat/thermal-layer`         |
| `fix`      | Bug fixes                                       | `fix/robot-arm-direction`    |
| `docs`     | Documentation only                              | `docs/data-sources`          |
| `style`    | Formatting or visual tweaks with no logic change | `style/map-legend-spacing`   |
| `refactor` | Restructuring code without changing behavior    | `refactor/layer-loader`      |
| `perf`     | Performance improvements                        | `perf/tile-caching`          |
| `test`     | Adding or fixing tests                          | `test/route-planner`         |
| `chore`    | Tooling, dependencies, configuration            | `chore/update-vite`          |

## Pull requests

Title format: `<type>(<scope>): <description>`

```
fix(robot): moves arm wrong
```

- **type** is one of the branch types above, and matches your branch.
- **scope** is the part of the project the change touches, as one lowercase word: `map`, `layers`, `route`, `ui`, `data`, and so on.
- **description** is short, lowercase, and has no period at the end.

More examples:

```
feat(layers): add thermal data overlay
docs(readme): explain how to run the project
refactor(map): split tile loading into a hook
```

Before asking for a review:

- The description links the issue with `Closes #<issue-number>`.
- `npm run lint` and `npm run build` pass.
- The branch has no merge conflicts with an up-to-date `main` (step 4 of the workflow).
- The pull request contains only the changes for its issue.

### Reviewing and merging

- Any teammate can review. The author cannot approve their own pull request.
- Requested changes are pushed to the same branch. Do not open a second pull request.
- `main` keeps moving while a pull request is open. Before merging, GitHub must show that the branch has no conflicts with the base branch. If it shows conflicts, the author resolves them as in step 4 and pushes again.
- After one approval, merge with **Squash and merge** so the pull request title becomes the commit on `main`.
- Delete the branch after merging.
