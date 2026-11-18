<div align="center">
<img width="1200" height="475" alt="GHBanner" src="https://ai.google.dev/static/site-assets/images/share-ais-513315318.png" />
</div>

# Run and deploy your AI Studio app

This contains everything you need to run your app locally.

View your app in AI Studio: https://ai.studio/apps/eb58e742-2ce5-4702-ab7b-3fb4e00b5754

## Run Locally

**Prerequisites:**  Node.js


1. Install dependencies:
   `npm install`
2. Set the `GEMINI_API_KEY` in [.env.local](.env.local) to your Gemini API key
3. Run the app:
   `npm run dev`
Pre-launch hardening deployed.

## Password reset Edge Function

The function uses only Deno and the Supabase/Brevo HTTP APIs so its `index.ts` can
be deployed without resolving external modules. To test it locally without
calling Supabase or sending email:

```sh
deno test supabase/functions/password-reset/index_test.ts
```

Apply the password-reset recovery email migration before deploying the function.
To deploy via the Supabase CLI:

```sh
supabase functions deploy password-reset --project-ref <project-ref> --no-verify-jwt
```

JWT verification must stay disabled for this function because users request
password resets before signing in. Configure `BREVO_API_KEY`,
`BREVO_SENDER_EMAIL` (a verified sender), and `APP_URL` in Edge Function secrets.
`APP_URL` should point to the deployed app and be allowed in Auth redirect settings.
To test email delivery, use a test account's Matric Number, Staff ID, registered
phone number, GSU sign-in email, or uniquely assigned recovery email. A shared
recovery email requires the sign-in ID. The link always goes to the recovery email
on file.
