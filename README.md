# LAPLACE Login Sync

LAPLACE Login Sync began as a fork of [CookieCloud](https://github.com/easychen/CookieCloud). On September 29, 2026, it detached from CookieCloud's repository and became an independent project.

## Changes

- Server: Node.js -> Bun
- Server: Express.js -> Hono
- Server: Private mode - server with authentication
- Extension: Simpler UI
- Extension: i18n

## Browser support

- Chrome 148+ (Windows 10+, macOS 12+)
- Microsoft Edge 148+ (Windows 10+, macOS 12+)
- Firefox 140+ (Windows 10+, macOS 10.15+)

The systems in parentheses are the oldest those browser versions run on. Other Chromium-based browsers need Chromium 148 or later. Safari and Firefox for Android aren't supported.

- Chrome and Edge 148 are the first versions where the background script can reply to the popup by returning a Promise. On older versions the reply never arrives, so a manual sync from the popup shows an error even though the upload still runs.
- Firefox 140 is the first version whose install prompt asks for consent to the data the extension collects, its authentication info. Older versions install it without asking, or refuse it as corrupted.

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
