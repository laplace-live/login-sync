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
