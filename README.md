# Playstack (Local)

A local-first web app to track:
- games you want to play
- games you are currently playing
- games you finished
- overall rating (1-10)
- PlayStation trophy progress synced from PSN
- Steam library + achievements
- Nintendo Switch eShop search (DE/EUR) + Nintendo legacy catalog search (optional)

## Stack
- Next.js (App Router) + TypeScript
- Prisma + SQLite
- Tailwind CSS
- `psn-api` (unofficial PSN API wrapper)

## Setup
1. Install dependencies:
   ```bash
   npm install
   ```
2. Copy env file:
   ```bash
   cp .env.example .env.local
   ```
3. Fill `.env.local`:
   - `DATABASE_URL="file:./dev.db"`
   - `PSN_NPSSO="your_npsso_token"`
   - `PSN_ACCOUNT_ID="your_psn_account_id"` (optional, defaults to `"me"`)
   - `STEAM_API_KEY="your_steam_web_api_key"` (optional)
   - `STEAM_STEAMID="your_steamid64"` (optional)
   - `RAWG_API_KEY="your_rawg_api_key"` (optional, enables legacy Nintendo catalog search)
4. Create database schema:
   ```bash
   npx prisma db push
   npx prisma generate
   ```
5. Run app:
   ```bash
   npm run dev
   ```

## Notes on Sync
- Sync runs automatically when the dashboard loads.
- You can also use the **Sync** button manually from the user menu.
- Only `PSN_NPSSO` is required for your own account.
- PlayStation catalog search uses the PlayStation Store search page (`store.playstation.com`).
- Steam catalog search uses Steam store search API.
- Nintendo store search uses Nintendo Europe endpoint (`de` locale, EUR pricing) for Switch/Switch 2.
- Nintendo legacy search uses RAWG (requires `RAWG_API_KEY`).
- Set `PSN_STORE_LOCALE` (for example `en-us`) to match your storefront locale.
- Sync caches your PSN library titles; it does not auto-add titles to a tracking category.
- Add games explicitly from **My Library** or **Store search** and choose the target category.
- If PSN env vars are missing, the app still works for manual game tracking.

## Project structure
- `src/app/page.tsx`: dashboard UI
- `src/app/api/games/route.ts`: CRUD API for games
- `src/app/api/sync/route.ts`: PSN + Steam + Nintendo sync endpoint
- `src/lib/psn.ts`: PSN integration and trophy mapping
- `src/lib/steam.ts`: Steam integration
- `src/lib/nintendo.ts`: Nintendo integration
- `prisma/schema.prisma`: database schema
