// src/firebase.js
import { initializeApp } from 'firebase/app';
import { getAuth, GoogleAuthProvider } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';

const firebaseConfig = {
  apiKey: "AIzaSyBzAkuHBt0HHxVghDVB2BOAYaiG2Ge4D9Y",
  authDomain: "commander-s-sphere-pod-tracker.firebaseapp.com",
  projectId: "commander-s-sphere-pod-tracker",
  storageBucket: "commander-s-sphere-pod-tracker.firebasestorage.app",
  messagingSenderId: "417944632581",
  appId: "1:417944632581:web:ef9b300a2601236d684b6c"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);

// Initialize services
export const auth = getAuth(app);
export const db = getFirestore(app);

// Configure Google provider with Sheets and Drive scopes
export const googleProvider = new GoogleAuthProvider();
googleProvider.addScope('https://www.googleapis.com/auth/spreadsheets');
googleProvider.addScope('https://www.googleapis.com/auth/drive.file');

// Don't set any custom parameters here - this allows Google to use cached consent
// We'll set prompt parameters only when needed (e.g., during token refresh)
