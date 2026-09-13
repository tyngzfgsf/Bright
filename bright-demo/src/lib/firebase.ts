import { getApp, getApps, initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";

/**
 * The bright-34c23 web app's config, as `firebase apps:sdkconfig` prints it. The object only —
 * see gotcha 4 in the repo's CLAUDE.md. None of this is secret: a Firebase web API key
 * identifies the project, it doesn't grant access (the same values ship in bright-site and in
 * the Android APK's google-services.json). The Groq key is the secret, and it lives in the
 * bright-proxy Worker.
 */
const firebaseConfig = {
  apiKey: "AIzaSyDD4fRqwm5J7neRnMmB9T_yst757soR1LQ",
  authDomain: "bright-34c23.firebaseapp.com",
  projectId: "bright-34c23",
  storageBucket: "bright-34c23.firebasestorage.app",
  messagingSenderId: "559173794953",
  appId: "1:559173794953:web:af377bde9e3979c8355a58",
};

export const firebaseApp = getApps().length ? getApp() : initializeApp(firebaseConfig);
export const auth = getAuth(firebaseApp);
