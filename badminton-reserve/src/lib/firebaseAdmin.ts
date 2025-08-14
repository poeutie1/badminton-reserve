import { cert, getApps, initializeApp, getApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

let cachedDb: FirebaseFirestore.Firestore | null = null;

export function getAdminDb() {
  if (cachedDb) return cachedDb;

  const projectId = process.env.FIREBASE_PROJECT_ID;
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
  const privateKey = process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, "\n");

  if (!projectId || !clientEmail || !privateKey) {
    throw new Error(
      "Missing Firebase Admin env: FIREBASE_PROJECT_ID / FIREBASE_CLIENT_EMAIL / FIREBASE_PRIVATE_KEY"
    );
  }

  const app = getApps().length
    ? getApp()
    : initializeApp({
        credential: cert({ projectId, clientEmail, privateKey }),
      });

  cachedDb = getFirestore(app);
  return cachedDb;
}
