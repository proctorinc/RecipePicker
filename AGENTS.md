Never manually edit migration files under /drizzle. Instead, if migrations are necessary run `npx drizzle-kit generate` to create the migration.

If an update requires changes to the Vercel environment via APIs, environment variables, or anything, display a checklist of items that I need to complete before this feature can go live to production.

For every new Lucide icon, use `Icon` from `@/components/ui/icon` instead of rendering a Lucide component directly. Pick a named size: `xs` (14px), `sm` (16px), `md` (20px, the default), `lg` (24px), or `xl` (28px). Do not set arbitrary `h-*`/`w-*` classes on new icons. The icon inherits its color from the parent; give the parent an explicit text color when contrast is not already clear.
