import { Bench } from 'tinybench'

const bench = new Bench({ time: 10000 })

const param = '/get/your_token_here'

bench
  // bun run dev
  .add('bun-hono', async () => {
    await fetch(`http://localhost:8088${param}`)
  })
  // bun run index.ts
  .add('bun-express', async () => {
    await fetch(`http://localhost:8089${param}`)
  })
// PORT=8090 npm run build
// .add('node-express', async () => {
//   await fetch(`http://localhost:8090${param}`)
// })

await bench.run()

console.table(bench.table())
