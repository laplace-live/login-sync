import { Bench } from 'tinybench'

// Start the server with `bun run dev` first. PORT is read the same way the server reads it.
// your_token_here fails the auth or uuid check before any file read, so this measures per-request overhead.
const url = `http://localhost:${process.env.PORT || 8088}/get/your_token_here`

const bench = new Bench({ time: 10_000 })

bench.add('bun-hono', async () => {
  await fetch(url)
})

await bench.run()

console.table(bench.table())
