import { cert, getApps, initializeApp, getApp, App } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

let adminApp: App;
if (!getApps().length) {
  adminApp = initializeApp({
    credential: cert({
      projectId: process.env.FIREBASE_PROJECT_ID,
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
      privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, "\n"),
    }),
  });
} else {
  adminApp = getApp();
}
export const adminDb = getFirestore(adminApp);
