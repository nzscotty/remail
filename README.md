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

Set the production site URL to `https://<your-domain>` and add both the local and production `/chats` URLs under **Authentication → URL Configuration → Redirect URLs**. The OAuth callback above belongs in each provider's OAuth app; `/chats` is Supabase's post-login redirect.

### Google Gmail

1. Enable the Gmail API in the Google Cloud project and configure an OAuth **Web application** client. Add the Supabase callback URL above as an authorized redirect URI.
2. In **Google Auth Platform → Branding**, set the app name to `Remail`, select a support email, and add the public app home page and `/privacy.html` URLs once the production domain is available. Add the domain shown by the Supabase callback under **Authorized domains**. The Remail login page links to the privacy policy.
3. In **Google Auth Platform → Data Access**, declare `https://www.googleapis.com/auth/gmail.modify`. In **Audience**, keep the app in **Testing** while developing and add the Gmail accounts that may sign in as test users. Testing mode is limited to 100 users and grants expire after seven days.
4. In **Supabase → Authentication → Sign In / Providers → Google**, enable Google and enter the OAuth client ID and client secret. The app requests only `https://www.googleapis.com/auth/gmail.modify`, which supports reading, sending, and marking mail as read.

For token renewal, add the same OAuth credentials as Supabase Function secrets and deploy `gmail-refresh`:

```bash
npx supabase secrets set GOOGLE_CLIENT_ID="<google-client-id>" GOOGLE_CLIENT_SECRET="<google-client-secret>" --project-ref <your-project-ref>
```

`gmail.modify` is a restricted Gmail scope. A public app must complete Google's restricted-scope verification. Because the current Edge Functions receive and proxy Gmail data, an independent security assessment is also required unless the app qualifies for a Google exception; plan for ongoing reassessment. See Google's [Gmail scope classifications](https://developers.google.com/workspace/gmail/api/auth/scopes) and [restricted-scope verification requirements](https://developers.google.com/identity/protocols/oauth2/production-readiness/restricted-scope-verification).

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

The Edge Functions proxy requests to Gmail or Microsoft Graph using the signed-in provider token. They do not write email messages into a Supabase database. Fetched conversations are cached in the browser's local storage for offline reading and cleared on sign-out. Supabase Auth sessions and mail provider tokens are held in the current tab's session storage. OAuth client secrets stay in Supabase Function secrets and must never be committed to the repository.

## Production build and launch

Remail is prepared for **Vercel**. Import `nzscotty/remail` from GitHub; Vercel detects Vite and builds the site when commits are pushed. Set the Node.js version to 22.x, the build command to `npm run build`, and the output directory to `dist`. The `vercel.json` file configures client-side routes and basic browser security headers. Vercel creates preview deployments for other branches; add their URLs to Supabase Auth only if you need OAuth sign-in on previews.

Set `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` as Vercel build variables for production and preview builds; production builds intentionally fail if either is missing. Only use a Supabase anon/publishable key here. Vercel initially provides a `vercel.app` URL; add a custom domain when one is selected. Then set the production site URL and `/chats` redirect URL in Supabase Auth, configure both provider OAuth apps with the Supabase callback URL, set the Google consent-screen home page and privacy policy URLs, and deploy the Edge Functions after setting provider secrets.

Only the Supabase anon/publishable key belongs in `VITE_SUPABASE_ANON_KEY`; never put a Supabase `service_role` key or OAuth client secret in a `VITE_` variable or browser bundle. If an OAuth client secret was committed, revoke it at its provider and replace it in Supabase Auth and Function secrets; removing a file from the latest commit does not remove it from Git history.

## Verify

```bash
npm run lint
npm run build
```
