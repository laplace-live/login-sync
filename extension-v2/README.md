# LAPLACE Login Sync

LAPLACE Login Sync browser extension

## Stack

- [WXT](https://wxt.dev/)
- React
- Tailwind CSS
- crypto-js, pako, sonner, Radix UI, Tabler Icons

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
