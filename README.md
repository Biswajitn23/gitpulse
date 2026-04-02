# GitPulse

GitPulse is a dark, neon-styled React dashboard for tracking GitHub contribution streaks in real time.

## Setup

1. Install dependencies:

   npm install

2. Create a local environment file:

   copy .env.example .env

3. Add your Firebase config values to `.env`:

   VITE_FIREBASE_API_KEY=...
   VITE_FIREBASE_AUTH_DOMAIN=...
   VITE_FIREBASE_PROJECT_ID=...
   VITE_FIREBASE_APP_ID=...

4. In Firebase Console, enable Authentication and turn on the GitHub provider.

5. Start the app:

   npm run dev

## Features

- Current streak and longest streak calculations from GitHub GraphQL v4.
- 30-day progress bar.
- Daily safe / risk status.
- Responsive heatmap placeholder.
- Firebase Authentication with GitHub provider sign-in.
- 8:00 PM browser notification reminder when no commit is detected.

## Notes

- The dashboard is login-first: no data is shown until Firebase GitHub login succeeds.
- Notifications require browser permission.