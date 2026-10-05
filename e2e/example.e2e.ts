// Run `pnpm exec e2e init` to generate config (engine, model provider), then write tests here.
import { test } from "e2e"

test.skip("example", async ({ app, agent }) => {
  await app.open("/")
  await agent.assert("the home page renders")
})
