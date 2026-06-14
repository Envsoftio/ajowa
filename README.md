# AJOWA

AJOWA is a Nuxt 3 + Nitro SSR application for society management, built with PrimeVue, Pinia, Better Auth, and Supabase.

## Prerequisites

- Node.js `22.x` or newer
- npm `10.x` or newer
- Docker Desktop for local Supabase
- Supabase CLI available through `npx supabase`

## Getting Started

1. Copy `.env.example` to `.env` and fill in the required values.
2. Install dependencies with `npm install`.
3. Start the app with `npm run dev`.
4. Use `npm run db:reset` after Supabase is initialized in Phase 2.

## Scripts

- `npm run dev` starts the Nuxt development server.
- `npm run build` creates the production Nitro bundle.
- `npm run preview` serves the production build locally.
- `npm run lint` runs ESLint.
- `npm run typecheck` runs Nuxt type checking.
- `npm run db:reset` resets the local Supabase database.

## Delivery Guardrails

- Supabase service-role access is server-only via `server/utils/supabase.ts`.
- Runtime configuration is validated on Nitro startup.
- Theme preference is cookie-backed, not stored in `localStorage`.
- CI must pass install, lint, type-check, and production build before merge.
