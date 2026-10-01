# Yu-Gi-Oh Card App: Copilot Instructions

## Project Overview

This repository contains a Korean-language, multi-game trading card catalog and collection manager. The SPA supports Yu-Gi-Oh!, Pokemon, and One Piece cards. Users can search cards, browse releases, inspect card details, save favorites, and manage inventory and sales history. Personal data is tied to the signed-in Supabase user.

The app is a React 19 + Vite JavaScript/JSX application. Supabase provides authentication and PostgreSQL storage. Vercel hosts the SPA and serverless API routes. Card data is obtained from the Korean official game sites and normalized by this app; do not assume an external paid TCG API is in use.

## Architecture and Important Files

- `src/main.jsx`: mounts the app and imports the global styles.
- `src/App.jsx`: top-level UI state, active game and tab, browser history restoration, Supabase auth, card search/detail/release flows, favorites, inventory, and sales transactions. Keep state changes and data flows consistent with its existing patterns.
- `src/components/`: UI components. `CardResult.jsx` and `CardDetail.jsx` render cards; `ManagementTabs.jsx` switches search/release/inventory/favorites views; `InventoryConsole.jsx` handles inventory operations and spreadsheet import/export; `SalesHistory.jsx` displays and manages sales history.
- `src/lib/cardGames.js`: supported game IDs, labels, card-back paths, and game-specific field labels. Use these shared values instead of duplicating game lists or labels.
- `src/lib/tcgApi.js`: game-aware API facade. Yu-Gi-Oh requests use `officialCardApi.js`; Pokemon and One Piece requests use `/api/cards`.
- `src/lib/officialCardApi.js`: Yu-Gi-Oh official-site search/detail/release parsing, rarity normalization, and preview hydration. In production (or when `VITE_USE_CARD_API=true`) it uses `/api/cards`; local Vite development otherwise uses `/official-ygo`.
- `src/lib/supabase.js`: nullable Supabase client initialized from `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`.
- `api/cards.js`: GET-only card API, request validation, game routing, catalog/search cache, and response handling. It uses the server-side Supabase admin helper when configured.
- `api/official-ygo.js` and `api/official-ygo/[...path].js`: official Yu-Gi-Oh site proxy routes. `vercel.json` rewrites `/official-ygo/*` requests to the proxy.
- `api/_lib/`: server-side HTML parsers for Yu-Gi-Oh, Pokemon Korea, and One Piece Korea, plus Supabase admin access. Official-site markup and selectors can change; preserve parser output compatibility with the card UI.
- `supabase-schema.sql` and `supabase-migration-*.sql`: database schema, RLS policies, and incremental changes. Apply migrations in the documented order for the target database; do not assume the base schema alone represents every current column or constraint.
- `public/card-backs/`: optional game card-back images. `public/templates/` contains downloadable templates.
- `scripts/deploy.ps1`: deployment helper.

## Data and Feature Rules

- Game IDs are `yugioh`, `pokemon`, and `onepiece`; Yu-Gi-Oh is the default. When handling a card across games, preserve its `game` where available and never assume card IDs are globally unique across games.
- Keep card results compatible with the shared card shape used by the UI: `id`, `cardId`, `name`, `card_images`, `koreanData`, `card_sets`, and `isDetailLoaded`. Game parsers may add a `game` field. Preserve useful upstream fields when normalizing data.
- Search results may be lightweight previews. Load detail data through `fetchGameCardById` when needed instead of duplicating game-specific fetch logic in components.
- Release browsing should use `fetchGameReleaseList` and `fetchGameReleaseCards`. Yu-Gi-Oh previews may need hydration to get set/rarity variants; do not assume all games return identical release metadata.
- Inventory is variant-aware. A stored variant is identified by user, card, set code, and rarity code; preserve this composite identity in reads, writes, imports, edits, and deduplication. Do not merge distinct printings just because their card IDs match.
- Favorites, inventory items, and inventory transactions are user data protected by Supabase RLS. Follow the existing auth checks and include user ownership filters where the surrounding code does so.
- Inventory changes should keep quantities and transaction history consistent. Sales history in the current UI is based on `inventory_transactions`; inspect active call sites before using similarly named legacy `sales` or `sale_items` tables from the base schema.
- Spreadsheet import is `.xlsx`-based and has size/row limits in `InventoryConsole.jsx`. Preserve validation and limits when changing that workflow.

## Coding Conventions

- Use JavaScript ES modules and React function components with hooks. This repository uses `.jsx` for React UI and camelCase for variables/functions; use PascalCase for component filenames and component functions.
- Keep UI components focused and reuse the existing API facade, shared game metadata, and card-shape conventions. Avoid adding a new state-management or data-fetching library without a clear need.
- Keep styling in the existing `src/App.css` and `src/index.css` patterns. Use the installed `lucide-react` icons where the surrounding UI does so, and retain the app's Korean labels and terminology.
- Make asynchronous loading and error states explicit. Follow existing `try`/`catch`/`finally` patterns, surface actionable errors through the current UI error state, and check Supabase `{ data, error }` results instead of silently ignoring failures.
- Treat official-site HTML parsing as an integration boundary: tolerate missing elements, normalize optional values, and keep parser output aligned with the card shape consumed by `src/lib` and components.
- Keep changes scoped. Do not reformat unrelated code, introduce TypeScript, or enable React Compiler unless explicitly requested.

## Security and Supabase

- Never expose `SUPABASE_SERVICE_ROLE_KEY` or third-party secrets to browser code. Only the public Supabase URL and anon key use the `VITE_` prefix. Server-only credentials belong in Vercel environment variables and serverless code.
- Browser database access goes through `src/lib/supabase.js` and `@supabase/supabase-js`. The client can be `null` when environment variables are absent; preserve graceful unauthenticated and unconfigured states.
- Respect Row Level Security. Do not weaken or bypass policies to make a client operation work. Add or update SQL migrations when a schema change is required, and keep ownership checks consistent with existing policies.
- OAuth session state is managed through Supabase Auth in `App.jsx`; unsubscribe from auth listeners and clean up event listeners/effects when changing lifecycle code.

## API and Local Development

- Keep browser requests routed through the existing clients and `/api/cards` or `/official-ygo` proxy. Do not fetch protected third-party APIs directly from the browser.
- `/api/cards` supports GET requests and routes by game plus query parameters such as `q`, `id`, `releases`, and `setId`. Preserve input validation and useful non-2xx error messages when changing it.
- Standard `npm run dev` starts Vite, not Vercel serverless functions. For local testing of `/api/*`, use `vercel dev`; Yu-Gi-Oh's `/official-ygo` path also has a Vite development proxy.
- Required browser Supabase variables are `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`. The shared catalog cache additionally requires server-only `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` in Vercel. Consult `README.md` before changing deployment or migration setup.

## Verification

- Run `npm run lint` after JavaScript/JSX changes.
- Run `npm run build` after changes that affect bundling, environment access, or frontend integration.
- For API/parser or SQL changes, also verify the corresponding request/data shape and migration requirements; do not claim serverless or Supabase behavior was tested by a Vite-only build.
- There is no dedicated test script in `package.json` currently. Do not invent test commands; report any verification that could not be run.
