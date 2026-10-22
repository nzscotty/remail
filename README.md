# Remail

Remail is a mobile-first PWA that makes tagged Gmail conversations feel like messaging. Only messages with `[remail]` in the subject are shown.

## Run locally

```bash
npm install
npm run dev
```

Without Vite environment variables, the app runs in demo mode with seeded conversations. Copy `.env.example` to `.env.local` and set the Supabase values to enable Google sign-in.

## Supabase setup

### Configure Google OAuth

The Supabase error `At least one Client ID is required when Google sign-in is enabled` means the provider is enabled before its Google OAuth credentials have been entered.

1. In Google Cloud Console, create or select a project.
2. Enable the Gmail API.
3. Configure the OAuth consent screen and add the Gmail scopes requested by the app.
4. Create an OAuth client with application type **Web application**.
5. Add your local origin (`http://localhost:5173`) and production origin under **Authorized JavaScript origins**.
6. Add this redirect URI under **Authorized redirect URIs**:

   ```text
   https://<your-supabase-project-ref>.supabase.co/auth/v1/callback
   ```

7. In Supabase, open **Authentication → Providers → Google**, enable Google, and paste the Google **Client ID** and **Client Secret**. The red Client IDs validation message disappears once the Client ID is saved.
8. In **Authentication → URL Configuration**, add `http://localhost:5173/chats` and your production `/chats` URL to the allowed redirect URLs.
9. Deploy the functions in `supabase/functions/gmail-conversations` and `supabase/functions/gmail-send`.

For automatic Gmail access-token renewal, also set the Google OAuth credentials as Supabase Function secrets and deploy `gmail-refresh`:

```bash
npx supabase secrets set GOOGLE_CLIENT_ID="<google-client-id>" GOOGLE_CLIENT_SECRET="<google-client-secret>" --project-ref dczjflhjxqxyvtukuxji
npx supabase functions deploy gmail-refresh --project-ref <your-project-ref>
```

The refresh token stays in the browser's authenticated session storage; the Google client secret stays in Supabase Functions secrets.

If Google shows an unverified-app warning, add the test Google accounts in the OAuth consent screen while the app is in testing. Gmail access scopes may require Google verification before public launch.

The browser keeps the Google provider access token and refresh token in the current tab's session storage. The `gmail-refresh` Edge Function uses the refresh token and server-side Google credentials to obtain a new access token; Remail does not store Google tokens in its database.

## Verify

```bash
npm run lint
npm run build
```
