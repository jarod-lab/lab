// Used only by `pnpm --filter @starter/auth generate` to emit the Drizzle auth schema.
import { createAuth } from "./src/index"

const placeholder = (prefix: string) => `${prefix}_generate_only`

// `db` is a stand-in: schema generation never touches the database.
export const auth = createAuth({
  db: {} as never,
  secret: "x".repeat(32),
  baseURL: "https://localhost:3000",
  emailFrom: "Starter <auth@example.com>",
  // Placeholders so the stripe tables are generated. Nothing here reaches Stripe: generation makes no calls.
  stripe: {
    secretKey: placeholder("sk_test"),
    webhookSecret: placeholder("whsec"),
    plans: [{ name: "placeholder", priceId: placeholder("price") }],
  },
})
