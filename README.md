# GitPulse

GitPulse is a dark, neon-styled React dashboard for tracking GitHub contribution streaks in real time.

## Setup

1. Install dependencies:

   npm install

2. Create a local environment file:

   copy .env.example .env

3. Add your GitHub personal access token to `.env`:

   VITE_GITHUB_TOKEN=your_token_here
   VITE_GITHUB_CLIENT_ID=your_oauth_app_client_id

4. Create a GitHub OAuth App if you have not already, then copy the Client ID into `.env`.

   The app uses GitHub device flow, so you do not need a backend.

5. Start the app:

   npm run dev

## Features

- Current streak and longest streak calculations from GitHub GraphQL v4.
- 30-day progress bar.
- Daily safe / risk status.
- Responsive heatmap placeholder.
- GitHub OAuth device-flow sign-in for the authenticated viewer account.
- 8:00 PM browser notification reminder when no commit is detected.

## Notes

- Leave the username blank, or type `me`, to load the authenticated GitHub account.
- The in-app sign-in flow uses GitHub device authorization and requires an OAuth App client ID.
- Notifications require browser permission.