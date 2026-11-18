// src/lib/firebase.ts  ← 新規 or 既存修正
import { getApps, initializeApp, type FirebaseApp } from "firebase/app";
import { connectFirestoreEmulator, getFirestore } from "firebase/firestore";

const config = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY!,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN!,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID!,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET!,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID!,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID!,
};

const firstInitialization = getApps().length === 0;
export const app: FirebaseApp = getApps()[0] ?? initializeApp(config);
export const db = getFirestore(app);
const emulator = process.env.NEXT_PUBLIC_FIRESTORE_EMULATOR_HOST;
if (emulator && firstInitialization) {
  const [host, port] = emulator.split(":");
  connectFirestoreEmulator(db, host, Number(port));
}
