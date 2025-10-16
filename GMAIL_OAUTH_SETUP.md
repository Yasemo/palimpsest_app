# Gmail OAuth 2.0 Setup Guide

This guide will walk you through obtaining Gmail OAuth credentials for the Palimpsest app.

## 📋 What You'll Get

By the end of this guide, you'll have:
- **Client ID** - Your application's public identifier
- **Client Secret** - Your application's password (keep secret!)
- **Refresh Token** - Long-lived token for ongoing access

## 🚀 Step-by-Step Setup

### Step 1: Access Google Cloud Console

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Sign in with your Google account
3. You may need to agree to terms of service if this is your first time

### Step 2: Create a New Project (or Select Existing)

1. Click the **project dropdown** at the top of the page
2. Click **"New Project"**
3. Enter project name: `Palimpsest PR App` (or your choice)
4. Click **"Create"**
5. Wait for the project to be created (may take a few seconds)
6. Select your newly created project from the dropdown

### Step 3: Enable Gmail API

1. In the left sidebar, navigate to **APIs & Services > Library**
   - Or use the search bar and search for "API Library"
2. Search for **"Gmail API"**
3. Click on **Gmail API** in the results
4. Click the **"Enable"** button
5. Wait for it to enable (usually instant)

### Step 4: Configure OAuth Consent Screen

1. Go to **APIs & Services > OAuth consent screen** (left sidebar)
2. Select **User Type**:
   - Choose **"External"** (allows any Gmail user)
   - Click **"Create"**

3. Fill out the **App Information**:
   - **App name**: `Palimpsest PR App`
   - **User support email**: Your email address
   - **App logo**: (Optional - can skip)
   - **Application home page**: (Optional - can skip)
   - **Application privacy policy**: (Optional - can skip)
   - **Application terms of service**: (Optional - can skip)

4. Scroll down to **Developer contact information**:
   - Enter your email address

5. Click **"Save and Continue"**

6. On the **Scopes** page:
   - Click **"Add or Remove Scopes"**
   - Search for and select: `https://mail.google.com/` (full Gmail access)
   - Or use: `https://www.googleapis.com/auth/gmail.compose` (just for sending)
   - Click **"Update"**
   - Click **"Save and Continue"**

7. On the **Test users** page (if in testing mode):
   - Click **"Add Users"**
   - Add your Gmail address (the one you'll send emails from)
   - Click **"Add"**
   - Click **"Save and Continue"**

8. Review the summary and click **"Back to Dashboard"**

### Step 5: Create OAuth Credentials

1. Go to **APIs & Services > Credentials** (left sidebar)
2. Click **"Create Credentials"** at the top
3. Select **"OAuth client ID"**

4. Configure the OAuth client:
   - **Application type**: Select **"Web application"**
   - **Name**: `Palimpsest OAuth Client`
   
5. Add **Authorized redirect URIs**:
   - Click **"Add URI"**
   - For testing with OAuth Playground, add:
     ```
     https://developers.google.com/oauthplayground
     ```
   - For your local app (if needed later):
     ```
     http://localhost:8000/oauth/callback
     ```

6. Click **"Create"**

7. **IMPORTANT**: A dialog will appear with your credentials:
   - **Client ID**: Copy this (looks like: `xxxxx.apps.googleusercontent.com`)
   - **Client Secret**: Copy this (random string)
   - Click **"OK"**

### Step 6: Get Your Refresh Token

Now you need to get a refresh token using the OAuth Playground:

1. Go to [OAuth 2.0 Playground](https://developers.google.com/oauthplayground)

2. Click the **Settings icon** (gear) in the top right

3. Check the box for **"Use your own OAuth credentials"**

4. Enter your credentials:
   - **OAuth Client ID**: Paste your Client ID
   - **OAuth Client secret**: Paste your Client Secret
   - Click **"Close"**

5. In the left panel under **"Step 1 - Select & authorize APIs"**:
   - Scroll down or search for **"Gmail API v1"**
   - Expand it and check: `https://mail.google.com/`
   - Click **"Authorize APIs"** button at the bottom

6. **Sign in** with your Gmail account when prompted

7. Click **"Allow"** to grant permissions

8. You'll be redirected back to the playground

9. In **"Step 2 - Exchange authorization code for tokens"**:
   - Click **"Exchange authorization code for tokens"**

10. You'll see the response with:
    - **Access token**: (short-lived, expires in 1 hour)
    - **Refresh token**: (THIS IS WHAT YOU NEED!)
    - Copy the **refresh token** - it looks like:
      ```
      1//0xxxxxx-xxxxxxxxxxxxxxxxxxxx
      ```

### Step 7: Add Credentials to Your .env File

Update your `.env` file with the credentials:

```env
# Gmail OAuth Credentials
GMAIL_CLIENT_ID=your-client-id.apps.googleusercontent.com
GMAIL_CLIENT_SECRET=your-client-secret
GMAIL_REFRESH_TOKEN=1//0xxxxxx-your-refresh-token
GMAIL_USER_EMAIL=your-email@gmail.com
```

## ✅ Verification

To verify your setup works:

1. Start your Palimpsest app: `deno task dev`
2. Go to the **Integrations** tab
3. Check if Gmail shows as **"Connected"**

## 🔒 Security Notes

- **Never commit** your `.env` file to version control
- Keep your **Client Secret** and **Refresh Token** private
- The refresh token is long-lived (doesn't expire unless revoked)
- If compromised, revoke access in [Google Account Settings](https://myaccount.google.com/permissions)

## 🆘 Troubleshooting

### "Error 400: redirect_uri_mismatch"
- Make sure `https://developers.google.com/oauthplayground` is in your Authorized redirect URIs
- Try removing and re-adding the URI, then wait a few minutes

### "Access Not Granted"
- Make sure you added your Gmail address as a Test User in the OAuth consent screen
- Make sure you're using the same Google account for testing

### "Invalid Grant"
- Your refresh token may have expired or been revoked
- Go through Step 6 again to get a new refresh token

### Gmail Integration Shows "Not Connected"
- Double-check all four environment variables are set correctly
- Make sure there are no extra spaces in the .env file
- Restart your Deno server after updating .env

## 📚 Additional Resources

- [Google OAuth 2.0 Documentation](https://developers.google.com/identity/protocols/oauth2)
- [Gmail API Documentation](https://developers.google.com/gmail/api)
- [OAuth 2.0 Playground](https://developers.google.com/oauthplayground)

---

**Note**: Gmail OAuth setup is optional. If you don't need email outputs, you can leave these fields empty and use only the Perplexity and OpenRouter integrations.
