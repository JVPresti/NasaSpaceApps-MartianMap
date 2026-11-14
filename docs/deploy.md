# Deploy

The app runs on Cloudflare Workers as a static site. There is no Worker code. Cloudflare serves the `dist/` folder that `npm run build` produces, configured in [`wrangler.jsonc`](../wrangler.jsonc).

Production: https://martian-map.fernando-haro-c.workers.dev

## How it deploys

Workers Builds, Cloudflare's CI, watches this repository through the Cloudflare GitHub app.

- A merge to `main` runs `npm run build`, then `npx wrangler deploy`. The production URL updates about a minute later.
- A pull request runs `npm run build`, then `npx wrangler preview`. Cloudflare posts a comment on the pull request with the preview URL and updates it on every push to the branch. Open that link to review a change without checking out the branch.
- A failed build shows up as a failed check on the pull request or the commit. The build log is linked from that check.

Unknown paths return `index.html` with status 200 (`not_found_handling: "single-page-application"`), so client-side routes work on reload.

## Limits that matter here

These are the Workers Free plan limits as of November 2026.

- 25 MiB per file. Our largest served file is 2.4 MB.
- 20,000 files per deploy. We serve about 50.
- 3,000 build minutes per month, 1 build at a time, 20 minutes per build. A build takes under a minute.
- Requests for static files are free and unlimited.

## Git LFS

Only `blender/**` belongs in Git LFS (#7). Keep every file under `public/` as a regular Git file, including `.glb` models. The build does not run `git lfs pull`, so an LFS-tracked file under `public/` would deploy as a 130-byte pointer and the model would fail to load. If a served file ever has to move to LFS, change the build command in the Cloudflare dashboard to `git lfs pull && npm run build`.

## Access

The Cloudflare account belongs to Scalaptia. Account members:

| Person | Role |
| --- | --- |
| Scalaptia | Super Administrator |
| JVPresti | Super Administrator |

Super Administrators can change settings and invite members. Workers Platform Read-only lets a teammate see deploys and build logs without changing anything. Ask a Super Administrator for an invite.

The GitHub side of the connection is the Cloudflare GitHub app, which JVPresti installed on this repository as its owner.

## Redeploy

- Retry a failed build: Cloudflare dashboard, Workers & Pages, `martian-map`, Deployments, then Retry build on the failed entry.
- Roll back production: same Deployments page, pick an older version, then Rollback.
- Deploy by hand from a machine logged in with `npx wrangler login`: `npm run build && npx wrangler deploy`. Use this only when Workers Builds is down, because it deploys whatever is in your working tree.
