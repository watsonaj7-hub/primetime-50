# PrimeFit 50+

Production-ready Next.js and TypeScript MVP for adults 50+ who want safer strength, fat loss, mobility, nutrition, and AI coaching!

## Run Locally

```bash
npm install
npm run dev
```

Copy `.env.example` to `.env.local` and add Supabase, OpenAI, and Stripe keys.

## Supabase

Run the SQL in `supabase/schema.sql`, then seed starter exercises with `supabase/seed.sql`.

## Included

- Mobile-first Next.js app router screens
- Supabase auth helpers, protected route middleware, SQL schema, RLS policies, indexes, and seed data
- AI coaching route with structured JSON response guardrails
- Stripe checkout and webhook routes
- shadcn-style UI primitives
- Workout, nutrition, progress, habits, subscription, settings, and admin surfaces
