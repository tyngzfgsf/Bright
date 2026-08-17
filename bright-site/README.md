# Bright — website

Static site (no build step, no framework) for Bright's landing page and the
"get your Groq key" flow. Runs entirely on Firebase's free Spark plan:
Hosting + Auth + Firestore, all genuinely free at this scale, no credit card.

## 1. Create a free Firebase project

1. Go to [console.firebase.google.com](https://console.firebase.google.com) → **Add project**
2. Name it whatever you want (e.g. `bright-app`) → skip Google Analytics if you don't want it → **Create project**

## 2. Turn on Google sign-in

1. In the Firebase console: **Build → Authentication → Get started**
2. Under **Sign-in method**, enable **Google**
3. Pick a support email (your own Gmail is fine) → **Save**

## 3. Turn on Firestore

1. **Build → Firestore Database → Create database**
2. Start in **production mode** (not test mode — the rules file in this repo handles access control)
3. Pick any region close to you

## 4. Get your web app config

Firebase's console has moved this recently — it's no longer under Project
settings. Instead:

1. Land on your project's **Project Overview** page (the main dashboard you see when you open the project)
2. If this is the first app you're adding, you'll see a big **Web** icon (`</>`) in the center of the page — click it. If you've already registered an app before, click **Add app** instead and pick **Web**
3. Give it any nickname → **Register app**
4. It shows you a `firebaseConfig` object — copy it
5. Paste those values into `js/firebase-config.js` in this project, replacing the placeholders

## 5. Install the Firebase CLI and deploy

```bash
npm install -g firebase-tools
firebase login
```

From this project's folder:

```bash
firebase init
```

- Choose **Hosting** and **Firestore** (space to select, enter to confirm)
- Select **Use an existing project** → pick the one you just made
- Firestore rules file: keep the default (`firestore.rules` — already in this repo, don't overwrite it)
- Public directory: type `.` (a single dot — this project has no `dist` folder, the HTML lives at the root)
- Single-page app: **No**
- Don't overwrite `index.html` if asked

Then deploy:

```bash
firebase deploy
```

It'll print a live URL like `https://bright-app-xxxxx.web.app` — that's your site.

### Previewing locally before deploying

Double-clicking `get-started.html` won't work — browsers block ES module
imports (which this site uses for Firebase) from `file://` URLs for security
reasons. Serve it over a real local server instead:

```bash
firebase emulators:start --only hosting
```

or, without the Firebase CLI:

```bash
python3 -m http.server 8000
```

then open `http://localhost:8000` (or whatever port Firebase's emulator prints).

## 6. Authorize your domain for sign-in

Firebase auto-authorizes its own `*.web.app` / `*.firebaseapp.com` domains, so
Google sign-in works immediately on the URL from step 5. If you later point a
custom domain at it, add that domain under **Authentication → Settings →
Authorized domains** too.

## Updating the site later

Edit the HTML/CSS/JS, then just run `firebase deploy` again. If you change
`firestore.rules`, deploy specifically with:

```bash
firebase deploy --only firestore:rules
```

## What's actually stored, and where

- Signing in uses Firebase Auth (Google OAuth) — Firebase handles the token
  exchange, this site never sees or stores a password.
- A saved Groq key is written to Firestore at `users/{your-uid}.groqApiKey`.
- `firestore.rules` restricts that document so **only the signed-in owner**
  can read or write it — not other users, not unauthenticated requests.
- The site never sends your Groq key anywhere except Firestore. It doesn't
  call the Groq API on your behalf — you copy the key into Bright's Settings
  screen on your phone yourself.
