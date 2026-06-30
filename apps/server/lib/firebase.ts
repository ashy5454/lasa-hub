import { initializeApp, getApps, cert } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);

function initFirebase() {
  if (getApps().length) return;

  const serviceAccountPath = path.resolve(__dirname, "../firebase-service-account.json");
  try {
    const serviceAccount = require(serviceAccountPath);
    initializeApp({ credential: cert(serviceAccount) });
  } catch {
    // In prod, use GOOGLE_APPLICATION_CREDENTIALS env var instead of file
    initializeApp();
  }
}

initFirebase();

export const auth = getAuth();
export const db = getFirestore();
