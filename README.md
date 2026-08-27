# Food Picker

Food Picker is a Next.js app for browsing Pinterest-sourced recipes, syncing selected boards, and extracting structured recipe data from linked pages.

## What changed

The app now uses:

- Clerk for authentication
- shared household workspaces for recipe data
- household-scoped Pinterest OAuth connections
- encrypted Pinterest token storage in SQLite
- owner/member roles plus shareable invite links

## Environment

Use environment-specific files:

- `.env.development`
- `.env.test`
- `.env.production`

Starter templates live in:

- `.env.development.example`
- `.env.test.example`
- `.env.production.example`

Shared app settings include:

- `APP_URL`
- `INNGEST_DEV` for local Inngest development
- `CLERK_PUBLISHABLE_KEY`
- `CLERK_SECRET_KEY`
- `PINTEREST_APP_ID`
- `PINTEREST_APP_SECRET`
- `PINTEREST_REDIRECT_URI`
- `PINTEREST_TOKEN_ENCRYPTION_KEY`
- `LOG_LEVEL`
- `LOG_INCLUDE_DEBUG_SQLITE_TARGETS`

The default Pinterest callback route is `http://localhost:3000/api/pinterest/callback`.

`APP_URL` should be the full origin for the deployed app, for example `http://localhost:3000` in development or `https://your-app.example.com` in production.

Bulk recipe parsing runs through Inngest. The app only creates the database job; an Inngest worker must receive the event before any recipe can be parsed. For local development, set `INNGEST_DEV=1`, run the Next.js app, and in a second terminal run `npm run dev:inngest`. If the Dev Server is not running, a job will remain queued at 0.

In production on Vercel, install the official Inngest integration and confirm that `INNGEST_EVENT_KEY` and `INNGEST_SIGNING_KEY` are available to the deployment. The integration must also sync `/api/inngest` successfully; sending an event alone does not register the worker function.

Database settings depend on the environment:

- `development`: `SQLITE_PATH`
- `test`: `TURSO_DATABASE_URL`, `TURSO_AUTH_TOKEN`
- `production`: `TURSO_DATABASE_URL`, `TURSO_AUTH_TOKEN`

## Local setup

```bash
npm install
npm run dev
```

Then:

1. Sign in with Clerk.
2. The app will create a household automatically for the first signed-in user.
3. Open Settings and connect Pinterest.
4. Choose which boards should sync into the household.

## Database

The schema is defined in [src/db/schema.ts](/Users/mattyp/Documents/food-picker/src/db/schema.ts:1).

Generate migrations with:

```bash
npm run db:generate
```

Apply migrations with:

```bash
npm run db:migrate
```

The app also runs pending Drizzle migrations automatically when it opens the
database in non-production environments.

In production, apply migrations as part of deployment instead of relying on the
web app runtime. If you intentionally want the app server to run migrations at
startup, set `DB_AUTO_MIGRATE=true`.

## Scripts

Sync one household board:

```bash
npm run sync:board -- <household-id> <board-id>
```

Extract recipes for one household:

```bash
npm run extract:recipes -- --household-id <household-id>
```

Target one recipe:

```bash
npm run extract:recipes -- --household-id <household-id> --recipe-id <recipe-id>
```

### Pinterest source-URL remediation

Pinterest imports use the full Pinterest Pin ID as their primary identity and a
normalized destination URL as a second, household-scoped identity. A later Pin
with the same normalized URL does not replace the original recipe, its edits,
or its Pinterest folder membership. Before cleanup, deploy the migration that
adds `household_pins.source_url_key`, pause Pinterest syncing, and create a
reviewed dry-run report:

```bash
npm run remediate:pinterest-sources -- --report /secure/location/pinterest-source-dry-run.json
```

The report includes source-key backfills as well as source-URL duplicate groups.
It makes no database changes unless both `--apply` and `--confirm` are supplied.
Apply only the exact dry-run report you reviewed:

```bash
npm run remediate:pinterest-sources -- --apply --confirm \
  --reviewed-report /secure/location/pinterest-source-dry-run.json \
  --report /secure/location/pinterest-source-applied.json
```

The command blocks groups whose earliest recipe timestamps tie, deletes later
duplicate recipes and their dependent rows in a transaction, and backfills keys
without transferring duplicate data to the retained recipe. Do not add the
partial unique source-key index until a reviewed cleanup reports zero groups.
