# Project Architecture & Rules

- Tech Stack: React 19 (SPA), Vite, Supabase (PostgreSQL + Auth), Vercel Serverless Functions
- Styling & UI: React functional components with JSX

## Code Guidelines

- Frontend communicates with Supabase using `@supabase/supabase-js` (supabase.js).
- Row Level Security (RLS) is active; always handle Auth states properly using Supabase Auth.
- Serverless functions reside in `/api` (or Vercel routes like `official-ygo.js`).
- Do NOT expose secret API keys on the client side; proxy through Vercel Functions.
