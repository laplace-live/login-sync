# LAPLACE Login Sync — Browser Extension

Modern rewrite of the legacy [`extension/`](../extension) (Plasmo) project on top of [WXT](https://wxt.dev/).

## Stack

- [WXT](https://wxt.dev/) (`0.20.x`) — React module
- React 19
- Tailwind CSS v4 via `@tailwindcss/vite`
- crypto-js, pako, sonner, Radix UI, Tabler Icons
- Bun for installs and CI

## Develop

```bash
bun install
bun run dev            # Chrome
bun run dev:firefox    # Firefox
```

## Build / Package

```bash
bun run build          # .output/chrome-mv3/
bun run build:firefox  # .output/firefox-mv2/
bun run zip            # zipped artefact for Chrome Web Store
bun run zip:firefox    # zipped artefact for AMO
```

Outputs land under `.output/`.

## Folder layout

```
extension-v2/
├── assets/             shared CSS, etc.
├── components/ui/      Button, Accordion, Radio, Sonner, ...
├── entrypoints/
│   ├── background.ts   alarm scheduler + sync RPC
│   ├── content.ts      localStorage mirror for bilibili.com / laplace.live
│   └── popup/          React UI
├── lib/                sync, storage, messaging, const, types
├── public/
│   ├── _locales/       en + zh_CN messages.json (browser.i18n)
│   └── icon/           extension icons
└── wxt.config.ts       manifest + Tailwind plugin
```
