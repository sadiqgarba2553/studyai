import { initializeApp } from 'firebase/app';
import { getAuth, GoogleAuthProvider } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';

// Configuration from user
const firebaseConfig = {
  apiKey: "AIzaSyAYVvjl-z94xV6uNfjL6pb67WKlYn1D6hQ",
  authDomain: "ssuk-237d0.firebaseapp.com",
  projectId: "ssuk-237d0",
  storageBucket: "ssuk-237d0.firebasestorage.app",
  messagingSenderId: "661175783750",
  appId: "1:661175783750:web:1758d3bb6ad1a8404d1547",
  measurementId: "G-34DB5G00HG"
};

export const isFirebaseConfigured = true;

let app;
let auth;
let db;
let googleProvider;

try {
  app = initializeApp(firebaseConfig);
  auth = getAuth(app);
  db = getFirestore(app);
  googleProvider = new GoogleAuthProvider();
} catch (error) {
  console.error("Firebase Initialization Error:", error);
}

export { app, auth, db, googleProvider };