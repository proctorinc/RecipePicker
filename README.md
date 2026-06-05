# Pinterest board sync MVP

This project includes TypeScript scripts to authenticate with Pinterest, list the authenticated user's boards, sync board pins into SQLite using Drizzle ORM, and extract structured recipe data from recipe pages linked by those pins.

## Setup

1. Copy `.env.example` to `.env`.
2. Set `PINTEREST_APP_ID` and `PINTEREST_APP_SECRET` from your Pinterest developer app.
3. Register the same redirect URI from `.env` in your Pinterest app. The default is `http://localhost:8085/`.
4. Install dependencies:

   ```bash
   npm install
   ```

5. Run the OAuth helper to generate and save a token:

   ```bash
   npm run oauth:pinterest
   ```

6. If you already have a token, you can set `PINTEREST_ACCESS_TOKEN` manually instead.

## Database

The SQLite schema is defined in [src/db/schema.ts](/Users/mattyp/Documents/food-picker/src/db/schema.ts:1), and SQL migrations live in `drizzle/`. It includes:

- `boards` and `pins` for Pinterest sync data
- `ratings` for per-pin scoring history
- `recipe_sources` and `recipe_extractions` for fetch/extraction history
- `recipes`, `recipe_steps`, and `recipe_ingredients` for the current extracted recipe data tied to a pin

Generate a new migration after schema changes:

```bash
npm run db:generate
```

Apply migrations manually:

```bash
npm run db:migrate
```

The board sync script also runs pending migrations automatically before writing data.

The recipe extraction script also runs pending migrations automatically before writing data.

## Usage

List the authenticated user's boards with board name and ID:

```bash
npm run list:boards
```

Refresh an existing Pinterest refresh token:

```bash
npm run refresh:pinterest-token
```

Run with the default SQLite path from `.env`:

```bash
npm run sync:board -- <board-id>
```

Override the SQLite output path:

```bash
npm run sync:board -- <board-id> ./data/custom.sqlite
```

The sync script paginates through the board, stores one row per pin keyed by `pin_id`, and updates existing rows when the same pin is seen again in later syncs.

Extract recipes for linked pins that have not been extracted yet:

```bash
npm run extract:recipes
```

Extract only one pin for debugging:

```bash
npm run extract:recipes -- --pin-id <pin-id>
```

Extract all linked pins from one board:

```bash
npm run extract:recipes -- --board-id <board-id>
```

Manually rerun extraction for pins that already have recipe data:

```bash
npm run extract:recipes -- --board-id <board-id> --rerun
```

The extractor uses structured recipe markup first, currently supporting JSON-LD and microdata/RDFa pages. It stores fetch and extraction history separately from the current `recipes` row so normal Pinterest sync does not rerun recipe parsing automatically.
