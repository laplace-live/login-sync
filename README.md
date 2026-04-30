# LAPLACE Login Sync

LAPLACE Login Sync based on CookieCloud. View the [source repo](https://github.com/easychen/CookieCloud) for the original info.

## Changes

- Server: Node.js -> Bun
- Server: Express.js -> Hono
- Server: Private mode - server with authentication
- Extension: Simpler UI
- Extension: i18n

## Working on the extension

```bash
# install (run from the repo root, the extension lives in the workspace)
bun install

# dev / build / zip
bun run --filter laplace-login-sync dev
bun run --filter laplace-login-sync build
bun run --filter laplace-login-sync zip
```

## Working on the server

```bash
cd server
bun install
bun run dev
```

## Releasing the extension

When you make a user-visible change to the extension, add a changeset in the same PR:

```bash
bun changeset
```

When the PR lands on `master`, the `Release` workflow opens a "Version Packages" PR that bumps `extension-v2/package.json` and updates its `CHANGELOG.md`. Merging that PR creates the tag `laplace-login-sync@<version>`, which triggers `extension-v2.yml` to:

1. Build Chrome / Firefox / Edge zips
2. Submit them to the stores via `wxt submit`
3. Attach them to the corresponding GitHub Release (whose body is the new changelog entry)
