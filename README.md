# Calurcap

A SvelteKit + Supabase + Capacitor (Android) application template with Google Sign-In and Tailwind CSS v4.

## Usage as Template

You can easily scaffold a new project from this template using `degit`:

```bash
npx degit TheAnimatrix/calurcap my-new-app
cd my-new-app
npm install
```

### Quick Setup

Run the setup wizard **before** installing dependencies to automatically configure your project name, ID, and API keys:

```bash
npm run setup
npm install
```

This interactive script will ask for your:
- App Name & ID
- Supabase URL & Key
- Google Client ID

It will then update `package.json`, `capacitor.config.ts`, `android/app/build.gradle`, and `supabaseClient.ts` for you.

### Manual Steps (Required)

Even after running the script, you must manually:
1.  **Replace `android/app/google-services.json`** with your own file from **Google Cloud Console** (or Firebase Console if you linked them).
2.  **Run `npx cap sync`** to apply the Android configuration changes.

## Features

- **Framework**: SvelteKit v2 (SPA mode) + Svelte v5
- **Styling**: Tailwind CSS v4 with a custom dark theme
- **Authentication**: Supabase Auth v2 with Google Sign-In
- **Mobile**: Capacitor v7 for Android deployment
- **Live Reload**: Seamless development on Android devices

## Prerequisites

- Node.js
- Android Studio
- Supabase Project
- Google Cloud Console Project

## Setup & Installation

### 1. Supabase Setup

1.  Create a new Supabase project.
2.  Go to **Authentication > Providers** and enable **Google**.
3.  You will need the **Client ID** and **Client Secret** from Google Cloud Console (see below).
4.  Copy your Supabase URL and Anon Key.
5.  Add `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, and `SUPABASE_SERVICE_ROLE_KEY` to your local server environment.
6.  Update `src/lib/supabaseClient.ts` with your Supabase URL and Anon Key if you are not using env vars directly.

### 2. Google Cloud Console Setup

1.  Go to the [Google Cloud Console](https://console.cloud.google.com/).
2.  Create a new project.
3.  Go to **APIs & Services > OAuth consent screen** and configure it (External or Internal).
4.  Go to **APIs & Services > Credentials**.
5.  Create an **OAuth 2.0 Client ID** for **Web application**.
    *   **Authorized JavaScript origins**: `http://localhost:3000` (and your production domain).
    *   **Authorized redirect URIs**: `https://<YOUR_PROJECT_ID>.supabase.co/auth/v1/callback`.
    *   Copy the **Client ID** and **Client Secret** to your Supabase Google Provider settings.
6.  Create another **OAuth 2.0 Client ID** for **Android**.
    *   You will need the **SHA-1 certificate fingerprint**.
    *   To get the SHA-1 for your debug keystore:
        ```bash
        keytool -list -v -keystore ~/.android/debug.keystore -alias androiddebugkey -storepass android -keypass android
        ```
    *   Package name: `com.avarnic.calurcap`.
7.  Download the `google-services.json` file for the Android client.

### 3. Project Configuration

1.  **Android**:
    *   Place the `google-services.json` file in `android/app/`.
2.  **Capacitor**:
    *   Open `capacitor.config.ts` and update `serverClientId` in the `GoogleAuth` plugin configuration with your **Web Client ID** (not the Android one).

## Development Workflow

### Initial Setup (Run Once)

1.  **Install dependencies**:
    ```bash
    npm install
    ```

2.  **Initialize Native Project**:
    This builds the web assets and syncs them to the Android project. You only need to repeat this if you install new native plugins (`npm install @capacitor/...`).
    ```bash
    npm run build
    npx cap sync
    ```

### Daily Development

1.  **Start the Development Server**:
    Open a terminal and run:
    ```bash
    npm run dev
    ```
    This starts the Vite server on port 3000.

2.  **Run on Android with Live Reload**:
    Open a **second terminal** and run:
    ```bash
    npm run dev:android
    ```
    Ensure your Android device is connected via USB and USB debugging is enabled.

3.  **Open Android Studio** (optional):
    If you need to edit native code or debug Java/Kotlin issues:
    ```bash
    npx cap open android
    ```

## Notes

- **Tailwind CSS**: Styles are located in `src/app.css`.
- **Port**: The development server runs on port `3000` to ensure compatibility with the Android configuration.
- **Workspace API**: Team-board invite and membership mutations run through the Hono API and require `SUPABASE_SERVICE_ROLE_KEY` on the server.
