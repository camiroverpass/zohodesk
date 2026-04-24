# Zoho Desk Dashboard

Password-gated dashboard that lists Zoho Desk tickets for the Customer Success department and lets you bulk-update the "Problem" multi-select custom field.

## Features

- Table of tickets: number, subject, customer, date, problem tags
- Filter by problem (including "-None-" for tickets with no problem set)
- Search by subject, ticket #, customer name or email
- Bulk select + bulk change of `cf_problem` (including clearing it)

## Local development

```bash
npm install
npm run dev
```

Open http://localhost:3000 — log in with the password from `DASHBOARD_PASSWORD`.

## Environment variables

Copy `.env.example` to `.env.local` and fill in:

| Var | Description |
| --- | --- |
| `ZOHO_CLIENT_ID` | From the Zoho API Console self-client |
| `ZOHO_CLIENT_SECRET` | From the Zoho API Console self-client |
| `ZOHO_REFRESH_TOKEN` | Exchange the grant code for a refresh token (scopes: `Desk.tickets.READ,Desk.tickets.UPDATE,Desk.search.READ`) |
| `ZOHO_ORG_ID` | Zoho Desk org id |
| `ZOHO_DEPARTMENT_ID` | Optional — scope tickets to one department |
| `DASHBOARD_PASSWORD` | Password required to access the dashboard |

## Deploy to Vercel

1. `git add . && git commit -m "initial" && git push`
2. On https://vercel.com/new, import the `camiroverpass/zohodesk` repo.
3. Framework preset will auto-detect Next.js. No build command changes needed.
4. Under **Environment Variables**, add all the vars from `.env.local` to the **Production**, **Preview**, and **Development** environments.
5. Click **Deploy**.

After the first deploy you can also use the CLI:

```bash
npx vercel           # preview deploy
npx vercel --prod    # production
```
