# laplace-login-sync-server

To install dependencies:

```bash
bun install
```

To run:

```bash
bun run index.js
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

This project was created using `bun init` in bun v1.0.21. [Bun](https://bun.sh) is a fast all-in-one JavaScript runtime.

## Server Benchmarks

The new server delivers a roughly 40% increase in performance. Tested on the Apple M2 Max.

```
┌─────────┬────────────────┬─────────┬────────────────────┬──────────┬─────────┐
│ (index) │ Task Name      │ ops/sec │ Average Time (ns)  │ Margin   │ Samples │
├─────────┼────────────────┼─────────┼────────────────────┼──────────┼─────────┤
│ 0       │ 'bun-hono'     │ '5,206' │ 192054.40348383566 │ '±1.12%' │ 52069   │
│ 1       │ 'bun-express'  │ '4,180' │ 239192.77248372967 │ '±0.83%' │ 41808   │
│ 2       │ 'node-express' │ '3,612' │ 276843.9688278622  │ '±0.84%' │ 36122   │
└─────────┴────────────────┴─────────┴────────────────────┴──────────┴─────────┘
```

## Crypto Benchmarks

Tested on the Apple M2 Max with bun 1.1.30 and node 22.9.0

```
┌────┬──────────────────────┬───────────┬────────────────────┬────────┬─────────┐
│    │ Task Name            │ ops/sec   │ Average Time (ns)  │ Margin │ Samples │
├────┼──────────────────────┼───────────┼────────────────────┼────────┼─────────┤
│  0 │ bun-md5              │ 943,202   │ 1060.217952700386  │ ±0.61% │ 943223  │
│  1 │ bun-sha1             │ 1,404,869 │ 711.8099945192508  │ ±0.66% │ 1404870 │
│  2 │ bun-sha256           │ 1,173,516 │ 852.1397661900472  │ ±1.04% │ 1173517 │
│  3 │ cryptojs-md5         │ 110,784   │ 9026.504165727081  │ ±0.88% │ 110785  │
│  4 │ cryptojs-sha1        │ 133,644   │ 7482.551685434771  │ ±0.78% │ 133645  │
│  5 │ cryptojs-sha256      │ 119,692   │ 8354.730596088652  │ ±1.27% │ 119731  │
│  6 │ cryptojs-encrypt-aes │ 43,410    │ 23035.699108523302 │ ±0.75% │ 43411   │
│  7 │ cryptojs-decrypt-aes │ 41,058    │ 24355.61253318571  │ ±3.97% │ 41059   │
│  8 │ crypto-sha1          │ 93,309    │ 10716.97775158177  │ ±1.95% │ 93310   │
│  9 │ crypto-sha256        │ 86,908    │ 11506.357534892395 │ ±0.94% │ 86909   │
│ 10 │ crypto-encrypt-aes   │ 45,381    │ 22035.232735444195 │ ±4.13% │ 45382   │
│ 11 │ crypto-decrypt-aes   │ 70,773    │ 14129.541682561867 │ ±3.80% │ 70785   │
│ 12 │ bun-md5-hmac         │ 685,788   │ 1458.1761912197614 │ ±1.08% │ 685789  │
│ 13 │ bun-sha1-hmac        │ 1,131,090 │ 884.1023330571871  │ ±0.94% │ 1131091 │
│ 14 │ bun-sha256-hmac      │ 1,240,778 │ 805.9458993094322  │ ±0.25% │ 1240779 │
│ 15 │ crypto-md5-hmac      │ 173,714   │ 5756.573640953068  │ ±2.72% │ 173762  │
│ 16 │ crypto-sha1-hmac     │ 139,877   │ 7149.092892575921  │ ±3.18% │ 139882  │
│ 17 │ crypto-sha256-hmac   │ 134,956   │ 7409.807034831883  │ ±2.96% │ 134957  │
└────┴──────────────────────┴───────────┴────────────────────┴────────┴─────────┘
```

## License

GPL-3.0
