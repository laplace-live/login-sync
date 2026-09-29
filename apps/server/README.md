# laplace-login-sync-server

To install dependencies, from the repo root:

```bash
bun install
```

To run, from this directory:

```bash
bun run dev
```

## Container

```yaml
laplace-login-sync:
  image: ghcr.io/laplace-live/login-sync-server:latest
  restart: always
  env_file: ./laplace-login-sync.env
  volumes:
    - laplace-login-sync-vol:/app/data
```

The server decrypts through `@laplace.live/login-sync`, taken from its source in `../../packages/login-sync` rather than from npm, so the image builds from the repo root. To build it locally, run either of these from this directory:

```bash
docker buildx bake --allow=fs.read=../..
docker compose build
```

This project was created using `bun init` in bun v1.0.21. [Bun](https://bun.sh) is a fast all-in-one JavaScript runtime.

## Server Benchmarks

Start the server with `bun run dev`, then run `bun run src/bench-http.ts`.

Replacing the Express server with Hono gave a roughly 40% increase in performance. Tested on the Apple M2 Max:

```
┌─────────┬────────────────┬─────────┬────────────────────┬──────────┬─────────┐
│ (index) │ Task Name      │ ops/sec │ Average Time (ns)  │ Margin   │ Samples │
├─────────┼────────────────┼─────────┼────────────────────┼──────────┼─────────┤
│ 0       │ 'bun-hono'     │ '5,206' │ 192054.40348383566 │ '±1.12%' │ 52069   │
│ 1       │ 'bun-express'  │ '4,180' │ 239192.77248372967 │ '±0.83%' │ 41808   │
│ 2       │ 'node-express' │ '3,612' │ 276843.9688278622  │ '±0.84%' │ 36122   │
└─────────┴────────────────┴─────────┴────────────────────┴──────────┴─────────┘
```

## License

AGPL-3.0-only
