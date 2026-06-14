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

// Basic Google Sign-In — no extra scopes needed since game data is in Firestore
export const googleProvider = new GoogleAuthProvider();
