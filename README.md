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
- `CLERK_PUBLISHABLE_KEY`
- `CLERK_SECRET_KEY`
- `PINTEREST_APP_ID`
- `PINTEREST_APP_SECRET`
- `PINTEREST_REDIRECT_URI`
- `PINTEREST_TOKEN_ENCRYPTION_KEY`
- `LOG_LEVEL`
- `LOG_INCLUDE_DEBUG_SQLITE_TARGETS`

The default Pinterest callback route is `http://localhost:3000/api/pinterest/callback`.

`APP_URL` should be the full origin for the deployed app, for example `http://localhost:3000` in development or `https://your-app.example.com` in production. It is used by server actions to re-enqueue background recipe parse chunks through the internal worker route.

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
