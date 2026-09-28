# AGENTS.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

LAPLACE Login Sync is a fork of [CookieCloud](https://github.com/easychen/CookieCloud): a browser extension encrypts the user's cookies (plus a narrow slice of localStorage) in the browser and uploads the ciphertext to a sync server, so a login session can be replayed on another machine or by a headless client. The server never holds the key — it stores one opaque AES blob per token id and hands it back on request.

Three shipped surfaces, released independently: `apps/extension/` (WXT + React, published to the Chrome, Edge, and Firefox stores), `apps/server/` (Bun + Hono, published as a GHCR container), and `packages/login-sync/` (the `@laplace.live/login-sync` protocol SDK, published to npm).

## Repository layout

```
apps/extension/       the shipped extension, package `laplace-login-sync` — WXT, MV3 + Firefox MV2
  entrypoints/          background.ts (alarm loop + message handler) · content.ts (localStorage mirror) · popup/ (React)
  lib/                  sync.ts (the upload path, encrypting through the SDK) · crypto.ts (sha256Hex for the dedupe hash) · sync-diff.ts (diff logging) · use-sync-config.ts · storage · const · types
  components/ui/        shadcn-style primitives — Radix + CVA + Tailwind v4
  public/_locales/      en + zh_CN messages.json, read via `browser.i18n`
apps/server/          the shipped server, package `laplace-login-sync-server` — Bun + Hono
  src/index.ts          every route lives here, decrypting through the SDK · utils/timingSafeEqual.ts
packages/login-sync/  the payload protocol SDK, package `@laplace.live/login-sync` — Web Crypto only, no dependencies
  src/                  protocol.ts (encrypt/decrypt) · detect.ts (version from the blob prefix) · v1.ts · v2.ts · credentials.ts · payload.ts
  PROTOCOL.md           the spec · vectors.json frozen known-answer vectors every implementation must pass
examples/             Playwright recipe for consuming a synced session
```

`apps/` holds what ships; `packages/` holds what the apps share.

Runtime is **Bun** everywhere. Every project is a root workspace (`apps/*`, `packages/*`) sharing one `bun.lock`, so `bun install` at the root installs everything. There is no shared build and no root lint script. Two subprojects import the SDK. The extension (`workspace:*`) bundles the SDK's TypeScript source rather than its `dist/`: an `alias` in `wxt.config.ts` points `@laplace.live/login-sync` at `packages/login-sync/src/index.ts`, and WXT applies it to both Vite and the generated `.wxt/tsconfig.json`, so the SDK never needs building first. That generated tsconfig is the only way the alias reaches `tsc`, so `compile` runs `wxt prepare` first; without a fresh one, `tsc` would check against the SDK's possibly stale `dist/`. Keep the SDK's own exports map `dist/`-only: a custom export condition could do the same job, but it would publish a pointer to `src/`, which isn't in the tarball. The server runs the SDK source too, without depending on the package: a `paths` entry in `apps/server/tsconfig.json` maps `@laplace.live/login-sync` to `../../packages/login-sync/src/index.ts`, and Bun honors `paths` at runtime, so its image carries the SDK source instead (see `docker.yml` under [Releases](#releases)). Everything else couples only through the wire format described under [Architecture](#architecture).

Open the repo root in VS Code; `.vscode/` holds the shared settings and recommended extensions. Biome runs from the root, and the root `biome.jsonc` holds the settings. Each project's own `biome.jsonc` is marked `"root": false` and `"extends": "//"`, so it inherits them and overrides only what differs: the server and the SDK switch off the `next` and `react` rule domains. Leave `"root": false` in place — without it Biome finds two root configurations and refuses to run from the root, which breaks the editor integration.

## Commands

```sh
bun install      # from the repo root: every app and package, one lockfile

# extension — from the repo root; or cd apps/extension and drop the --filter
bun run --filter laplace-login-sync dev          # Chrome, MV3
bun run --filter laplace-login-sync dev:firefox  # Firefox, MV2
bun run --filter laplace-login-sync build        # → apps/extension/.output/chrome-mv3/  · build:firefox
bun run --filter laplace-login-sync zip          # store artefact                   · zip:firefox
bun run --filter laplace-login-sync compile      # wxt prepare, then tsc --noEmit — the only typecheck gate

# server — from apps/server/
bun run dev      # bun --hot src/index.ts, port 8088 (PORT overrides)
bun test         # src/index.test.ts: every password route against v1 and v2 blobs  ·  utils/timingSafeEqual.test.ts
bun run start    # what the container runs
bun run src/bench-http.ts   # request throughput against a running `bun run dev`
docker buildx bake --allow=fs.read=../..   # the image, built from the repo root (see docker.yml under Releases)

# sdk — from packages/login-sync/
bun test          # vectors.json both ways, every error code, and a node:crypto reference reader
bun run compile   # tsc --noEmit
bun run build     # → dist/ through tsconfig.build.json, which has no Bun types; `npm pack`/`publish` run it too
bun run smoke     # the built dist/ under Node

# any project, run from inside it — Biome is a local dep with no npm script
bunx biome check .          # lint + format + import sort
bunx biome check --write .

bunx changeset   # from the root; adds a changeset for the extension or the SDK
```

`dev` launches a browser with the extension loaded and hot-reloads it. The popup is the whole UI, so that's where nearly every change gets verified.

### Which checks to run

Match the gate to the surface you touched.

| You changed                            | Run                                                                                                                                                                           |
| -------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| any extension source                   | `bun run --filter laplace-login-sync compile`                                                                                                                                 |
| extension UI or sync behavior          | `dev`, then exercise the popup in a real browser — nothing is unit-tested                                                                                                     |
| any server source                      | `bun test` in `apps/server/`                                                                                                                                                  |
| the crypto or payload path either side | round-trip against the other side (`bun test` in `apps/server/`, or a real sync)                                                                                              |
| the SDK                                | `bun test`, `compile`, `build` and `smoke` in `packages/login-sync/`, the extension's `compile` and `bun test` in `apps/server/` (both run SDK source), plus `bunx changeset` |
| any file                               | `bunx biome check .` inside that subproject                                                                                                                                   |
| user-facing extension behavior         | `bunx changeset` in the same commit                                                                                                                                           |

The extension has no test suite. Treat `compile` plus a manual popup pass as the gate, and be correspondingly careful in `lib/sync.ts`.

## Architecture

### The payload contract binds three clients

One implementation of the format lives here, the SDK in `packages/login-sync/`, which the extension encrypts through and the server decrypts through. laplace-workers and laplace-cf-workers still carry their own copies until they adopt the SDK, and v1 has no version field and no negotiation, so **changing any of the following breaks those copies silently** — a mismatched key just yields garbage that fails `JSON.parse`:

- **Key derivation**: `MD5(uuid + '-' + password)` as a hex string, first 16 characters. That 16-char string is then the _passphrase_ (not the key) fed to EVP_BytesToKey below.
- **Cipher**: `CryptoJS.AES.encrypt` defaults — OpenSSL `Salted__` envelope, EVP_BytesToKey with MD5 and 3 rounds, AES-256-CBC, PKCS7, base64. crypto-js itself is gone: the SDK's `v1.ts` builds the format on Web Crypto, with a hand-rolled MD5 because Web Crypto has none (its constant table is written out, not derived from `Math.sin`, whose precision engines don't guarantee).
- **Plaintext shape**: `{ cookie_data, local_storage_data }` — snake_case, and `/remove` uses the presence of `cookie_data` after decryption as proof the caller knows the password.
- **Transport**: the extension gzips the JSON `{ uuid, encrypted }` with the built-in `CompressionStream` and POSTs it as a raw body with `Content-Encoding: gzip`; the server decompresses it with `node:zlib`'s `unzipSync`.

`uuid` is not a UUID — it's a `short-uuid` token, validated as `/^[a-zA-Z0-9]+$/`. That regex is the path-traversal guard, because the token becomes the filename.

**`packages/login-sync` is the versioned successor.** The extension writes through it, in v1 (`PAYLOAD_VERSION` in `lib/const.ts`), and the server reads through it, in either version. Its `PROTOCOL.md` specifies v1 (exactly the format above) and v2: PBKDF2-SHA256 over the full password with a uuid-bound salt, AES-256-GCM with the uuid as additional data, stored as `v2:` + base64(nonce ‖ ciphertext ‖ tag). Readers tell versions apart by prefix — `U2FsdGVkX1` is v1, `v2:` is v2 — so the SDK reads both. Nothing may write v2 until every other reader (laplace-workers, laplace-cf-workers) decrypts through the SDK or passes its `vectors.json`: detection lets a new reader open old blobs, never an old reader open new ones. Keep v2 at 100,000 PBKDF2 iterations or fewer — Cloudflare Workers rejects more in production only, and no local runtime reproduces it. `vectors.json` is frozen; add vectors, never edit them.

### Server: flat files, four routes, one module

Everything lives in `apps/server/src/index.ts`; storage is `apps/server/data/<uuid>.json` holding `{ encrypted }` (gitignored, a Docker volume in production). No database.

- `POST /update` — 4 MB `bodyLimit`, writes the file and reads it back to confirm.
- `GET /get/:uuid` — returns the ciphertext untouched, `Cache-Control: private, max-age=5`.
- `POST /get/:uuid` — same, plus an optional `password` that makes the _server_ decrypt and return plaintext (a wrong one answers 403). Convenience for trusted callers; it means the password crosses the wire.
- `POST /remove` — form-encoded `uuid` + `token`; deletes only if `token` decrypts the blob.

**Private mode** (this fork's addition) requires both `LAPLACE_LOGIN_SYNC_AUTH_MODE` and `LAPLACE_LOGIN_SYNC_AUTH_KEY`. The mode variable is checked for _presence_, not truthiness — setting it to `false` still enables auth. Comparison goes through `utils/timingSafeEqual.ts`. Note the gate covers only the two `/get` routes: `/update` and `/remove` stay open, since both already require knowing the password.

`src/handlers/update.ts` is dead — superseded by the inline handler, and its `dataDir` is wrong. Don't wire it back up.

### Extension: a one-minute alarm on a phase-locked schedule

`background.ts` creates a single `bg_1_minute` alarm on install/update. Each tick computes minutes-since-month-start and syncs when `minuteCount % config.interval === 0`, so the schedule is phase-locked to the wall clock rather than to a per-user timer — changing `interval` shifts _when_ syncs land, not just how often.

Two things suppress an upload: `type === 'pause'`, and the dedupe check — SHA256 over `uuid-password-endpoint-payload` matching the last successful upload within `SYNC_DEDUPE_WINDOW_MS` (20 min). The popup's manual sync sets `forceUpdate` to bypass it. `lib/sync-diff.ts` is pure observability hung off that path: it fingerprints cookies per name/field so the logs can attribute a hash change to a specific rotating cookie. It never affects what gets uploaded.

`keep_live` lines are `url|interval`; on a matching tick the background opens a pinned inactive tab for 5 s (or reloads an existing unfocused one) to refresh a session.

**Popup → background messaging returns a Promise**, never `return true` + `sendResponse`. Firefox tears the channel down with "Promised response … went out of scope" if the async work rejects first. Same class of problem as `showBadge`, which resolves `browser.action ?? browser.browserAction` because WXT still builds MV2 for Firefox.

### What's configurable is narrower than it looks

`lib/const.ts` hardcodes `STATIC_DOMAINS` — `bilibili.com` (cookies only) and `laplace.live` (cookies plus localStorage keys prefixed `loginSyncOption`). Several `ConfigProps` fields are inert upstream leftovers kept for storage compatibility: `domains` and `blacklist` are bypassed by `STATIC_DOMAINS`, `sync_laplace_live` is read nowhere, and `endpoint` feeds the dedupe hash but not the request — uploads always go to `DEFAULT_SYNC_SERVER`. The `'down'` branch in `content.ts` is likewise unreachable, since `Action` is `'up' | 'pause'`. Delete-vs-keep is a judgement call, but don't add UI for any of them without wiring them through first.

localStorage can't be read from the background, so `content.ts` mirrors each host's localStorage into extension storage under `LS-<host>` on page load, and `sync.ts` reads that mirror.

### Popup state lives in one hook

`use-sync-config.ts` owns load → edit → persist → push, plus the reset-and-undo path (`STORAGE_KEY_CONFIG_PREVIOUS`). Two invariants the code comments defend at length, worth preserving: `isConfigured` means _user-configured_, not _written to storage_ (reset writes defaults, and the "not initialized" warning must survive it), and `loadError` disables every destructive action — when the initial read fails, the visible config is freshly-generated defaults that would otherwise overwrite intact credentials.

## Conventions

- **Bun, not Node.** `bun <file>`, `bun test`, `bun install`, `bun run <script>`, `bunx <pkg>`. Prefer `Bun.file`/`Bun.write` over `node:fs`, `Bun.$` over execa, `bun:sqlite`/`Bun.redis`/`Bun.sql` over their npm equivalents. `.env` loads automatically — never add `dotenv`. The SDK is an exception in the other direction: its `src/` must stay web-platform only (no `Buffer`, no `node:*`, no `Bun.*`) so it runs in the extension and on Cloudflare Workers, and `tsconfig.build.json` fails the build if it doesn't. Only its tests may use Node APIs.
- **Biome is the only linter and formatter** — no ESLint, no Prettier. Single quotes, no semicolons, 120 columns, 2-space, `arrowParentheses: asNeeded`, ES5 trailing commas. Import grouping is configured in the root `biome.jsonc`; run the assist instead of hand-sorting. The root config inherits `next`/`react` domains from a shared template — its Next.js rules are inert here, don't read them as signal.
- **Every user-facing extension change, and every SDK change, ships with a changeset in the same commit.** Changesets version the extension and the SDK. The server is a workspace package too, but `.changeset/config.json` ignores it, so it ships continuously from `master` and its `package.json` version is bumped by hand. Never hand-edit a changesets-managed `CHANGELOG.md`.
- **Conventional commits** — `feat:`, `fix:`, `chore(deps):`.
- **New user-facing strings go in `public/_locales/{en,zh_CN}/messages.json`** and are read with `browser.i18n.getMessage`. Existing toast and validation strings in `App.tsx` and `use-sync-config.ts` are still hardcoded Chinese; that's debt, not the pattern to copy.
- **Comments carry the non-obvious why.** This codebase leans on them for browser-quirk workarounds and state invariants (the Firefox messaging channel, the MV2/MV3 badge API, `isConfigured` vs persisted) — those are load-bearing, keep them. Don't add comments that restate a name or a signature, and never touch `@ts-expect-error`, `biome-ignore`, `TODO`/`FIXME`, or license headers while editing nearby code.

## Releases

Four workflows; the first three are chained by tags:

- `release.yml` — changesets on every `master` push, opening or updating the "Version Packages" PR. Merging it pushes tag `laplace-login-sync@<version>` with a laplace-release-bot GitHub App token; the default `GITHUB_TOKEN` cannot trigger downstream workflows, so a tag pushed with it would go nowhere. The same `changeset publish` publishes `@laplace.live/login-sync` to npm through trusted publishing (OIDC via `id-token: write`, which needs Node ≥ 22.14 and npm ≥ 11.5.1, hence `setup-node`). Its tags, `@laplace.live/login-sync@<version>`, match no other workflow.
- `extension.yml` — builds both zips on `master` and on PRs touching `apps/extension/` or the SDK it bundles. On a `laplace-login-sync@*` tag it also runs `wxt submit` to Chrome, Edge, and Firefox and attaches the zips to the GitHub Release. The artifact upload needs `include-hidden-files: true` because WXT writes to `.output/`.
- `docker.yml` — buildx bake to `ghcr.io/laplace-live/login-sync-server` on `master` and `v*` tags. The build context is the repo root, not `apps/server/`, because the image needs the root `bun.lock` and the SDK source: `docker-bake.hcl` sets `context = "../.."`, which Bake only reads with the `allow: fs.read=../..` entitlement, and `apps/server/Dockerfile.dockerignore` trims the context to the lockfile, the workspace manifests, `apps/server/` and `packages/login-sync/src`. The install stage runs `bun install --frozen-lockfile --linker hoisted --filter laplace-login-sync-server`: every workspace manifest must be present for the frozen check, but only the server's dependencies install, as plain directories that move into `/app/node_modules`. In the image the server stays at `/app`, so its data directory is still `/app/data`, where deployments mount their volume, and the SDK sits at `/packages/login-sync/src`: `tsconfig.json`'s `../../packages` lands there from `/app`, since the filesystem root is its own parent.
- `sdk.yml` — lint, typecheck, tests, build, and a Node smoke run of `dist/` on pushes and PRs touching `packages/login-sync/`.

The Firefox add-on id in `wxt.config.ts` is pinned to the existing AMO listing — changing it orphans every installed user. The `data_collection_permissions: ['authenticationInfo']` next to it is mandatory for AMO submissions from 2025-11-03 onward.

## Editing these instructions

`CLAUDE.md` is a symlink to `AGENTS.md` — **edit the real file.**

Keep each rule here self-contained: a reader who never opens the file being described should still not break anything. Install-and-run basics belong in the per-subproject `README.md`; this file covers what those can't say — the cross-project contracts, the gotchas, and which gate to run.
