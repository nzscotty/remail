# Remail

Remail is a mobile-first PWA that presents tagged email conversations as chat. Google Gmail and Microsoft Outlook accounts are supported. Only messages with `[remail]` in the subject appear.

## Run locally

```bash
npm install
npm run dev
```

Without Vite environment variables, the app runs in demo mode with seeded conversations. Copy `.env.example` to `.env.local` and set the Supabase project URL and anon key to enable provider sign-in.

## Configure Supabase Auth

Add the application's Supabase callback URL to each OAuth app:

```text
https://<your-supabase-project-ref>.supabase.co/auth/v1/callback
```

Add local and production `/chats` URLs under **Authentication → URL Configuration**.

### Google Gmail

Enable the Gmail API, configure a Google OAuth web client, and add the client ID and secret under **Authentication → Providers → Google**. The app requests Gmail read, send, and modify access.

For token renewal, add the same OAuth credentials as Supabase Function secrets and deploy `gmail-refresh`:

```bash
npx supabase secrets set GOOGLE_CLIENT_ID="<google-client-id>" GOOGLE_CLIENT_SECRET="<google-client-secret>" --project-ref <your-project-ref>
```

### Microsoft Outlook

1. Register an app in Microsoft Entra ID. To allow personal Outlook.com accounts and work or school accounts, choose the supported account type that includes both.
2. Add the Supabase callback URL above as a **Web** redirect URI, then create a client secret.
3. In **Authentication → Providers → Azure** in Supabase, enable Azure and set the Microsoft client ID and secret. The app requests `email offline_access User.Read Mail.ReadWrite Mail.Send`.
4. Set the same Microsoft app credentials as Supabase Function secrets so the Microsoft refresh function can exchange rotated refresh tokens:

   ```bash
   npx supabase secrets set MICROSOFT_CLIENT_ID="<microsoft-client-id>" MICROSOFT_CLIENT_SECRET="<microsoft-client-secret>" --project-ref <your-project-ref>
   ```

5. Deploy the Edge Functions with `npm run deploy:func`.

The Supabase Azure provider is named `azure` in the Auth API. `User.Read`, `Mail.ReadWrite`, and `Mail.Send` are delegated Graph permissions requested at sign-in.

## Message handling and cache

The Edge Functions proxy requests to Gmail or Microsoft Graph using the signed-in provider token. They do not write email messages into a Supabase database. Fetched conversations are cached in the browser's local storage for offline reading. Provider access and refresh tokens are held in the current tab's session storage; OAuth client secrets stay in Supabase Function secrets.

## Verify

```bash
npm run lint
npm run build
```
