// Firebase configuration
import { initializeApp, getApps } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";
import { getStorage } from "firebase/storage";

const firebaseConfig = {
  apiKey: "AIzaSyCDS3aNTa5DzijGnTY6rZlQcA3NTXk5zl0",
  authDomain: "grok-8992c.firebaseapp.com",
  projectId: "grok-8992c",
  storageBucket: "grok-8992c.firebasestorage.app",
  messagingSenderId: "155265258161",
  appId: "1:155265258161:web:29410b8727f1d20c840890",
  measurementId: "G-0DQXZG2X2V"
};

// Initialize Firebase only once
const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApps()[0];

export const auth = getAuth(app);
export const db = getFirestore(app);
export const storage = getStorage(app);

export default app;
