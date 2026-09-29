# LAPLACE Login Sync

LAPLACE Login Sync began as a fork of [CookieCloud](https://github.com/easychen/CookieCloud). On September 29, 2026, it detached from CookieCloud's repository and became an independent project.

## Changes

- Server: Node.js -> Bun
- Server: Express.js -> Hono
- Server: Private mode - server with authentication
- Extension: Simpler UI
- Extension: i18n

## Working on the extension

```bash
# install every app and package (run from the repo root)
bun install

# dev / build / zip
bun run --filter laplace-login-sync dev
bun run --filter laplace-login-sync build
bun run --filter laplace-login-sync zip

# the Firefox build, into apps/extension/.output/firefox-mv2/
bun run --filter laplace-login-sync build:firefox
```

## Working on the server

```bash
bun install   # from the repo root
cd apps/server
bun run dev
```

## License

[AGPL-3.0-only](LICENSE), since the detach from CookieCloud on September 29, 2026. Releases made before then were GPL-3.0 and stay so.
