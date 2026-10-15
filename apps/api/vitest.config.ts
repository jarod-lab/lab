import { baseConfig } from "@starter/config/vitest.base"

// server.ts only wires env, the database and the Node listener; app.ts holds the logic.
export default baseConfig(undefined, ["src/server.ts"])
