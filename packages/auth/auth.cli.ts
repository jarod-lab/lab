// Used only by `pnpm --filter @starter/auth generate` to emit the Drizzle auth schema.
import { createAuth } from "./src/index"

// biome-ignore lint: schema generation never touches the database
export const auth = createAuth({
  db: {} as never,
  secret: "x".repeat(32),
  baseURL: "http://localhost:3000",
  emailFrom: "Starter <auth@example.com>",
})
