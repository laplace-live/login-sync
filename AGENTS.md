# AGENTS.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

LAPLACE Login Sync is a fork of [CookieCloud](https://github.com/easychen/CookieCloud): a browser extension encrypts the user's cookies (plus a narrow slice of localStorage) in the browser and uploads the ciphertext to a sync server, so a login session can be replayed on another machine or by a headless client. The server never holds the key — it stores one opaque AES blob per token id and hands it back on request.

Two shipped surfaces, released independently: `extension/` (WXT + React, published to the Chrome, Edge, and Firefox stores) and `server/` (Bun + Hono, published as a GHCR container). `extension-v1/` (Plasmo) and `server-express/` (Express) are the superseded implementations — reference only, kept because Dependabot still bumps them.

## Repository layout

```
extension/       the shipped extension, package `laplace-login-sync` — WXT, MV3 + Firefox MV2
  entrypoints/     background.ts (alarm loop + message handler) · content.ts (localStorage mirror) · popup/ (React)
  lib/             sync.ts (the upload path) · sync-diff.ts (diff logging) · use-sync-config.ts · storage · const · types
  components/ui/   shadcn-style primitives — Radix + CVA + Tailwind v4
  public/_locales/ en + zh_CN messages.json, read via `browser.i18n`
server/          the shipped server, package `laplace-login-sync-server` — Bun + Hono
  src/index.ts     every route lives here · lib/crypto.ts (CryptoJS-compatible AES) · utils/timingSafeEqual.ts
client-python/   standalone Python reader for the same encrypted payload
examples/        Playwright recipe for consuming a synced session
benchmarks/      hono vs express throughput comparison (node + pnpm, outside the build)
extension-v1/    legacy Plasmo extension. All users already migrated to the new extension — reference only, do not develop
server-express/  legacy Express server. No longer deployed — reference only, do not develop
```

Runtime is **Bun** everywhere. Each subproject installs and runs on its own: only `extension/` is a root workspace, so `bun install` at the root covers the extension, while `server/` keeps its own `bun.lock` and needs its own install. There is no shared build, no root lint script, and no cross-project dependency — the only coupling is the wire format described under [Architecture](#architecture).

Open `laplace-login-sync.code-workspace` in VS Code rather than the plain folder: each subproject has to be its own workspace root for the Biome extension to find the local `biome.jsonc` and binary (the repo root has neither).

## Commands

```sh
# extension — from the repo root; or cd extension and drop the --filter
bun install
bun run --filter laplace-login-sync dev          # Chrome, MV3
bun run --filter laplace-login-sync dev:firefox  # Firefox, MV2
bun run --filter laplace-login-sync build        # → extension/.output/chrome-mv3/  · build:firefox
bun run --filter laplace-login-sync zip          # store artefact                   · zip:firefox
bun run --filter laplace-login-sync compile      # tsc --noEmit — the only typecheck gate

# server — from server/
bun install
bun run dev      # bun --hot src/index.ts, port 8088 (PORT overrides)
bun test         # src/index.test.ts
bun run start    # what the container runs
bun run src/bench.ts   # crypto benchmarks  ·  bun run src/aes.ts  round-trips CryptoJS ↔ lib/crypto.ts

# either project, run from inside it — Biome is a local dep with no npm script
bunx biome check .          # lint + format + import sort
bunx biome check --write .

bunx changeset   # from the root; adds a changeset for the extension
```

`dev` launches a browser with the extension loaded and hot-reloads it. The popup is the whole UI, so that's where nearly every change gets verified.

### Which checks to run

Match the gate to the surface you touched.

| You changed                            | Run                                                                      |
| -------------------------------------- | ------------------------------------------------------------------------ |
| any extension source                  | `bun run --filter laplace-login-sync compile`                            |
| extension UI or sync behavior         | `dev`, then exercise the popup in a real browser — nothing is unit-tested |
| any server source                     | `bun test` in `server/`                                                   |
| the crypto or payload path either side | round-trip against the other side (`bun run src/aes.ts`, or a real sync)  |
| any file                              | `bunx biome check .` inside that subproject                              |
| user-facing extension behavior        | `bunx changeset` in the same commit                                      |

The extension has no test suite. Treat `compile` plus a manual popup pass as the gate, and be correspondingly careful in `lib/sync.ts`.

## Architecture

### The payload contract binds three clients

The extension, the server, and `client-python/` all implement the same format by hand, with no version field and no negotiation. **Changing any of the following breaks the other two silently** — a mismatched key just yields garbage that fails `JSON.parse`:

- **Key derivation**: `MD5(uuid + '-' + password)` as a hex string, first 16 characters. That 16-char string is then the *passphrase* (not the key) handed to CryptoJS.
- **Cipher**: `CryptoJS.AES.encrypt` defaults — OpenSSL `Salted__` envelope, EVP_BytesToKey with MD5 and 3 rounds, AES-256-CBC, PKCS7, base64. `server/src/lib/crypto.ts` reimplements exactly that on `node:crypto` (three MD5 rounds → key = hash0‖hash1, iv = hash2) because it is ~10× faster than CryptoJS; `client-python/PyCryptoJS.py` is the third copy.
- **Plaintext shape**: `{ cookie_data, local_storage_data }` — snake_case, and `/remove` uses the presence of `cookie_data` after decryption as proof the caller knows the password.
- **Transport**: the extension gzips (`pako`) the JSON `{ uuid, encrypted }` and POSTs it as a raw body with `Content-Encoding: gzip`; the server `pako.inflate`s it back.

`uuid` is not a UUID — it's a `short-uuid` token, validated as `/^[a-zA-Z0-9]+$/`. That regex is the path-traversal guard, because the token becomes the filename.

### Server: flat files, four routes, one module

Everything lives in `server/src/index.ts`; storage is `server/data/<uuid>.json` holding `{ encrypted }` (gitignored, a Docker volume in production). No database.

- `POST /update` — 4 MB `bodyLimit`, writes the file and reads it back to confirm.
- `GET /get/:uuid` — returns the ciphertext untouched, `Cache-Control: private, max-age=5`.
- `POST /get/:uuid` — same, plus an optional `password` that makes the *server* decrypt and return plaintext. Convenience for trusted callers; it means the password crosses the wire.
- `POST /remove` — form-encoded `uuid` + `token`; deletes only if `token` decrypts the blob.

**Private mode** (this fork's addition) requires both `LAPLACE_LOGIN_SYNC_AUTH_MODE` and `LAPLACE_LOGIN_SYNC_AUTH_KEY`. The mode variable is checked for *presence*, not truthiness — setting it to `false` still enables auth. Comparison goes through `utils/timingSafeEqual.ts`. Note the gate covers only the two `/get` routes: `/update` and `/remove` stay open, since both already require knowing the password.

`src/handlers/update.ts` is dead — superseded by the inline handler, and its `dataDir` is wrong. Don't wire it back up.

### Extension: a one-minute alarm on a phase-locked schedule

`background.ts` creates a single `bg_1_minute` alarm on install/update. Each tick computes minutes-since-month-start and syncs when `minuteCount % config.interval === 0`, so the schedule is phase-locked to the wall clock rather than to a per-user timer — changing `interval` shifts *when* syncs land, not just how often.

Two things suppress an upload: `type === 'pause'`, and the dedupe check — SHA256 over `uuid-password-endpoint-payload` matching the last successful upload within `SYNC_DEDUPE_WINDOW_MS` (20 min). The popup's manual sync sets `forceUpdate` to bypass it. `lib/sync-diff.ts` is pure observability hung off that path: it fingerprints cookies per name/field so the logs can attribute a hash change to a specific rotating cookie. It never affects what gets uploaded.

`keep_live` lines are `url|interval`; on a matching tick the background opens a pinned inactive tab for 5 s (or reloads an existing unfocused one) to refresh a session.

**Popup → background messaging returns a Promise**, never `return true` + `sendResponse`. Firefox tears the channel down with "Promised response … went out of scope" if the async work rejects first. Same class of problem as `showBadge`, which resolves `browser.action ?? browser.browserAction` because WXT still builds MV2 for Firefox.

### What's configurable is narrower than it looks

`lib/const.ts` hardcodes `STATIC_DOMAINS` — `bilibili.com` (cookies only) and `laplace.live` (cookies plus localStorage keys prefixed `loginSyncOption`). Several `ConfigProps` fields are inert upstream leftovers kept for storage compatibility: `domains` and `blacklist` are bypassed by `STATIC_DOMAINS`, `sync_laplace_live` is read nowhere, and `endpoint` feeds the dedupe hash but not the request — uploads always go to `DEFAULT_SYNC_SERVER`. The `'down'` branch in `content.ts` is likewise unreachable, since `Action` is `'up' | 'pause'`. Delete-vs-keep is a judgement call, but don't add UI for any of them without wiring them through first.

localStorage can't be read from the background, so `content.ts` mirrors each host's localStorage into extension storage under `LS-<host>` on page load, and `sync.ts` reads that mirror.

### Popup state lives in one hook

`use-sync-config.ts` owns load → edit → persist → push, plus the reset-and-undo path (`STORAGE_KEY_CONFIG_PREVIOUS`). Two invariants the code comments defend at length, worth preserving: `isConfigured` means *user-configured*, not *written to storage* (reset writes defaults, and the "not initialized" warning must survive it), and `loadError` disables every destructive action — when the initial read fails, the visible config is freshly-generated defaults that would otherwise overwrite intact credentials.

## Conventions

- **Bun, not Node.** `bun <file>`, `bun test`, `bun install`, `bun run <script>`, `bunx <pkg>`. Prefer `Bun.file`/`Bun.write` over `node:fs`, `Bun.$` over execa, `bun:sqlite`/`Bun.redis`/`Bun.sql` over their npm equivalents. `.env` loads automatically — never add `dotenv`. `node:crypto` is a deliberate exception in `server/src/lib/crypto.ts` (CryptoJS byte-compatibility).
- **Biome is the only linter and formatter** — no ESLint, no Prettier. Single quotes, no semicolons, 120 columns, 2-space, `arrowParentheses: asNeeded`, ES5 trailing commas. Import grouping is configured in each `biome.jsonc`; run the assist instead of hand-sorting. The extension config inherits `next`/`react` domains from a shared template — its Next.js rules are inert here, don't read them as signal.
- **Every user-facing extension change ships with a changeset in the same commit.** Only the extension is versioned by changesets (it's the sole workspace package); the server ships continuously from `master` and its `package.json` version is bumped by hand. Never hand-edit `extension/CHANGELOG.md`.
- **Conventional commits** — `feat:`, `fix:`, `chore(deps):`.
- **New user-facing strings go in `public/_locales/{en,zh_CN}/messages.json`** and are read with `browser.i18n.getMessage`. Existing toast and validation strings in `App.tsx` and `use-sync-config.ts` are still hardcoded Chinese; that's debt, not the pattern to copy.
- **Comments carry the non-obvious why.** This codebase leans on them for browser-quirk workarounds and state invariants (the Firefox messaging channel, the MV2/MV3 badge API, `isConfigured` vs persisted) — those are load-bearing, keep them. Don't add comments that restate a name or a signature, and never touch `@ts-expect-error`, `biome-ignore`, `TODO`/`FIXME`, or license headers while editing nearby code.

## Releases

Three workflows, chained by tags:

- `release.yml` — changesets on every `master` push, opening or updating the "Version Packages" PR. Merging it pushes tag `laplace-login-sync@<version>` using `RELEASE_PAT`; the default `GITHUB_TOKEN` cannot trigger downstream workflows, so a tag pushed with it would go nowhere.
- `extension.yml` — builds both zips on `master` and on PRs touching `extension/`. On a `laplace-login-sync@*` tag it also runs `wxt submit` to Chrome, Edge, and Firefox and attaches the zips to the GitHub Release. The artifact upload needs `include-hidden-files: true` because WXT writes to `.output/`.
- `docker.yml` — buildx bake to `ghcr.io/laplace-live/login-sync-server` on `master` and `v*` tags.

The Firefox add-on id in `wxt.config.ts` is pinned to the existing AMO listing — changing it orphans every installed user. The `data_collection_permissions: ['authenticationInfo']` next to it is mandatory for AMO submissions from 2025-11-03 onward.

## Editing these instructions

`CLAUDE.md` is a symlink to `AGENTS.md` — **edit the real file.**

Keep each rule here self-contained: a reader who never opens the file being described should still not break anything. Install-and-run basics belong in the per-subproject `README.md`; this file covers what those can't say — the cross-project contracts, the gotchas, and which gate to run.
