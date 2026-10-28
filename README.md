# Remail

Remail is a mobile-first PWA that presents `[remail]` email conversations as chat. Google Gmail and Microsoft Outlook accounts are supported. OAuth callbacks, sessions, and mail API requests run through Vercel Functions. Provider tokens are encrypted in secure, HttpOnly cookies.

Vercel automatically discovers the API handlers in `api/`. This app does not use Supabase Edge Functions; `supabase/functions/` has no handlers.

## Run locally

```bash
npm install
npm run dev
```

`npm run dev` starts the Vite-only demo with seeded conversations on port 5173. For local OAuth and Vercel Functions, set `VITE_DEMO_MODE=false` and use `npm start`, which loads `.env.local` into the function environment and runs `vercel dev` on port 3000. The local Vercel config omits the production SPA rewrite so it does not intercept Vite module requests:

```text
VITE_DEMO_MODE=false
AUTH_CALLBACK_URL=http://localhost:3000/api/auth/callback
APP_ORIGIN=http://localhost:3000
```

Add the local callback URL to each provider's OAuth app if you want to test sign-in locally.

## Configure Vercel

Link the project and deploy with the Vercel CLI:

```bash
npx vercel link --project remail --scope nzscottys-projects
npx vercel deploy --prod
```

Set these environment variables in Vercel for Production (and Preview if previews need OAuth):

| Variable | Purpose |
| --- | --- |
| `APP_ORIGIN` | `https://www.re-mail.app` |
| `AUTH_CALLBACK_URL` | `https://www.re-mail.app/api/auth/callback` |
| `SESSION_ENCRYPTION_KEY` | A random secret used to encrypt OAuth state and session cookies |
| `GOOGLE_CLIENT_ID` | Google OAuth Web client ID |
| `GOOGLE_CLIENT_SECRET` | Google OAuth Web client secret |
| `MICROSOFT_CLIENT_ID` | Microsoft Entra application client ID |
| `MICROSOFT_CLIENT_SECRET` | Microsoft Entra client secret value |
| `MICROSOFT_TENANT_ID` | `common` for work, school, and personal Microsoft accounts |

Generate a session key with `node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"`. Add secrets through the Vercel CLI with `npx vercel env add VARIABLE_NAME production`; do not put provider secrets in `VITE_` variables or commit them.

## Google Gmail OAuth

1. In Google Cloud project `remail-512203`, enable the Gmail API and configure an OAuth **Web application** client.
2. Add `https://www.re-mail.app/api/auth/callback` as an **Authorized redirect URI**. For local development, add `http://localhost:3000/api/auth/callback` as well.
3. Keep `re-mail.app` in Google Auth Platform → Branding → Authorized domains. The home page is `https://www.re-mail.app`, and the privacy policy is `https://www.re-mail.app/privacy.html`.
4. Add the OAuth client ID and secret to Vercel as `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET`.
5. The app requests `openid`, `email`, `profile`, and `https://www.googleapis.com/auth/gmail.modify`. The Gmail scope is restricted; a public release requires Google's OAuth verification and may require a security assessment.

## Microsoft Outlook OAuth

1. In Microsoft Entra, open **App registrations** and configure the app for accounts in any organizational directory and personal Microsoft accounts.
2. Under **Authentication**, add a **Web** redirect URI: `https://www.re-mail.app/api/auth/callback`. Add the localhost callback if needed for development.
3. Under **Certificates & secrets**, create a client secret and copy its **Value**. Add the application client ID, secret value, and tenant `common` to Vercel as `MICROSOFT_CLIENT_ID`, `MICROSOFT_CLIENT_SECRET`, and `MICROSOFT_TENANT_ID`.
4. The app requests delegated `User.Read`, `Mail.ReadWrite`, and `Mail.Send` permissions, plus `openid`, `profile`, `email`, and `offline_access`. Users may need to consent based on their organization's policy.

## Mail handling and cache

The Vercel API routes read Gmail or Microsoft Graph using the signed-in user's OAuth token. Refresh and access tokens are encrypted in HttpOnly cookies and are never returned to browser JavaScript. Messages are not stored on a Remail server; conversations are cached in browser local storage for offline reading and cleared when the user signs out.

## Production

Vercel builds the Vite app with `npm run build` and serves the `dist` directory. Functions under `api/` handle OAuth and mail operations. The custom domain is `https://www.re-mail.app`; `vercel.json` configures client-side routes and browser security headers.
