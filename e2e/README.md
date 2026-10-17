# e2e

Browser tests with [e2e](https://e2e.tester.army/docs) (tester-army). Config: `e2e.config.ts` at the repo root. Tests: `e2e/**/*.e2e.ts`.

## Run

```bash
docker compose up -d db        # optional for the smoke test; the web app does not need it
pnpm e2e                        # all tests on every target (desktop, phone)
pnpm exec e2e run e2e/smoke.e2e.ts --headed
pnpm exec e2e list              # print the tests a run would select, no browser
```

The runner starts the web dev server itself on a free port (`app.command`, `{port}`). A running `pnpm dev` is not reused. Reports and screenshots go to `.e2e/` (git-ignored); the failure report is `.e2e/report.json`.

## Required environment

| Variable | Needed for | Read by |
| --- | --- | --- |
| `AI_GATEWAY_API_KEY` | `agent.*` steps only (the smoke test has none) | `gateway()` from `ai`, in the runner's own process environment, not `packages/env`. Put it in `.env`, which mise loads into the shell. Without it, the first model call fails with `MODEL_PROVIDER_FAILED`. |

The app under test gets only `PATH`, `HOME` and the temp-dir variables from the runner, plus whatever `app.command.env` names. Anything the app needs at boot (such as `DATABASE_URL`) must be passed there from the config.

## Rules

- Deterministic first: locators and `expect`. Add an `agent.act` step only when the flow needs judgement.
- Import `test` from `@e2e-dev/web` (it provides `app`, `screen`, `browser`); import `expect` from `e2e`.
- No `sleep`. Use matchers, which retry.

## Admin account

The `/admin` journey (`e2e/admin.e2e.ts`) signs in as a platform admin. Admin is a database role, and the suite
can't change the database, so:

1. Sign up a normal account (any way: `/sign-up`, or the API).
2. Promote it once, in the database the e2e stack uses (`DATABASE_URL`):

   ```sql
   update "user" set role = 'admin' where email = 'admin@example.com';
   ```

3. Leave two-factor off on that account, or sign-in stops at `/two-factor` and the journey can't continue.
4. Pass its credentials to the run:

   ```bash
   E2E_ADMIN_EMAIL=admin@example.com E2E_ADMIN_PASSWORD=... pnpm exec e2e run e2e/admin.e2e.ts
   ```

   The password is read through a function in `e2e.config.ts` and is never a string in the environment the
   model sees. Without both variables the admin journey is skipped with a message; the other two `/admin`
   checks (signed out, and a non-admin gets "Not available") always run.

The runner also accepts `E2E_USER_ADMIN_USERNAME` and `E2E_USER_ADMIN_PASSWORD` (the credential name, uppercased).
