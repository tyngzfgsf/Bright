import { initializeApp } from 'https://www.gstatic.com/firebasejs/12.17.1/firebase-app.js';
import { getAuth } from 'https://www.gstatic.com/firebasejs/12.17.1/firebase-auth.js';
import { getFirestore } from 'https://www.gstatic.com/firebasejs/12.17.1/firebase-firestore.js';

const firebaseConfig = {
  apiKey: "AIzaSyDD4fRqwm5J7neRnMmB9T_yst757soR1LQ",
  authDomain: "bright-34c23.firebaseapp.com",
  projectId: "bright-34c23",
  storageBucket: "bright-34c23.firebasestorage.app",
  messagingSenderId: "559173794953",
  appId: "1:559173794953:web:af377bde9e3979c8355a58"
};

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);
