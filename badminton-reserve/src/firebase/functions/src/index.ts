import { initializeApp } from "firebase-admin/app";
initializeApp();

export { notifyPromotion } from "./onPromote";
export { lineWebhook } from "./webhook";
