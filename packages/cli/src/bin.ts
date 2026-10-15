import { main } from "./main"

// The process entry point. Everything testable lives in main.ts.
const chunks: Buffer[] = []
const code = await main(process.argv.slice(2), {
  env: process.env,
  deps: {
    fetch: (request) => fetch(request),
    sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
    now: () => Date.now(),
  },
  io: {
    stdout: (text) => {
      process.stdout.write(text)
    },
    stderr: (text) => {
      process.stderr.write(text)
    },
    readStdin: async () => {
      for await (const chunk of process.stdin) chunks.push(Buffer.from(chunk))
      return Buffer.concat(chunks).toString("utf8")
    },
  },
})
process.exitCode = code
