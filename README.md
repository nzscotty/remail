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

1. In the [Microsoft Entra admin center](https://entra.microsoft.com/), open **Identity → Applications → App registrations → New registration**. Give the app a name such as `remail` and select **Accounts in any organizational directory and personal Microsoft accounts** to support both work/school and Outlook.com accounts. Leave **Redirect URI** blank on this first screen and register the app.
2. On the app's **Overview** page, copy the **Application (client) ID**. Under **Authentication**, add a **Web** platform redirect URI using the Supabase callback URL above:

   ```text
   https://<your-supabase-project-ref>.supabase.co/auth/v1/callback
   ```

   This is the OAuth callback for Supabase. The app's `http://localhost:5173/chats` or production `/chats` URL is the post-login destination; configure those separately in Supabase under **Authentication → URL Configuration**.

3. Under **Certificates & secrets → Client secrets**, create a new client secret and copy its **Value** immediately (not the Secret ID). Keep it private. The secret expires, so renew it before expiry and update both Supabase locations below.
4. In the Supabase dashboard for the project, open **Authentication → Sign In / Providers → Azure**, enable the provider, and enter the Entra **Application (client) ID** and client secret **Value**, then save. Supabase Auth uses the provider name `azure`. If Azure is not enabled here, sign-in returns `Unsupported provider: provider is not enabled`. Leave **Azure Tenant URL** at its default (`https://login.microsoftonline.com/common`) for the account type above; this permits work/school and personal Microsoft accounts.
5. The app requests `email offline_access User.Read Mail.ReadWrite Mail.Send` at sign-in. `email` is required by Supabase Auth. The Graph scopes are delegated permissions for reading, modifying, and sending the signed-in user's mail; users may need to consent during sign-in, depending on their organization's consent policy.
6. Set the same Microsoft app credentials as Supabase Function secrets so the Microsoft refresh function can exchange rotated refresh tokens:

   ```bash
   npx supabase secrets set MICROSOFT_CLIENT_ID="<microsoft-client-id>" MICROSOFT_CLIENT_SECRET="<microsoft-client-secret>" --project-ref <your-project-ref>
   ```

7. Deploy the Edge Functions with `npm run deploy:func`.

The Azure credentials in Supabase Auth enable login; the Function secrets are used for Microsoft token refresh. Both must be configured for the complete Outlook sign-in and mail flow.
## Message handling and cache

The Edge Functions proxy requests to Gmail or Microsoft Graph using the signed-in provider token. They do not write email messages into a Supabase database. Fetched conversations are cached in the browser's local storage for offline reading. Provider access and refresh tokens are held in the current tab's session storage; OAuth client secrets stay in Supabase Function secrets.

## Verify

```bash
npm run lint
npm run build
```
