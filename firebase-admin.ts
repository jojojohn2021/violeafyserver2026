import { initializeApp, cert, getApps, getApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { getAuth } from 'firebase-admin/auth';
import { getStorage } from 'firebase-admin/storage';
import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';

dotenv.config();

const databaseId = (process.env.FIRESTORE_DATABASE_ID || process.env.FIREBASE_DATABASE_ID || 'violeafydb').trim();
const storageBucket = (process.env.FIREBASE_STORAGE_BUCKET || 'violeafybasket.firebasestorage.app').trim();

function initFirebaseAdminApp() {
  if (getApps().length > 0) {
    return getApp();
  }

  let serviceAccount: any = null;

  // 1. Check environment variable for raw JSON key or key file path
  if (process.env.FIREBASE_SERVICE_ACCOUNT_KEY) {
    try {
      const rawEnv = process.env.FIREBASE_SERVICE_ACCOUNT_KEY.trim();
      if (rawEnv.startsWith('{')) {
        serviceAccount = JSON.parse(rawEnv);
      } else if (fs.existsSync(rawEnv)) {
        serviceAccount = JSON.parse(fs.readFileSync(rawEnv, 'utf-8'));
      }
    } catch (err) {
      console.error('[FIREBASE-ADMIN] Failed to parse FIREBASE_SERVICE_ACCOUNT_KEY environment variable.', err);
    }
  }

  // Local key files are a development fallback. Hosted runtimes should use
  // their injected credentials or Application Default Credentials.
  if (!serviceAccount && process.env.NODE_ENV !== 'production') {
    const candidatePaths = [
      path.join(process.cwd(), 'firebase-applet-config.json'),
      path.join(process.cwd(), 'serviceAccountKey.json'),
    ];

    for (const candidatePath of candidatePaths) {
      if (fs.existsSync(candidatePath)) {
        try {
          const parsed = JSON.parse(fs.readFileSync(candidatePath, 'utf-8'));
          if (parsed && (parsed.type === 'service_account' || parsed.private_key)) {
            serviceAccount = parsed;
            break;
          }
        } catch (err) {
          console.error(`[FIREBASE-ADMIN] Failed to parse service account key at ${candidatePath}.`, err);
        }
      }
    }
  }

  const projectId = (serviceAccount?.project_id || process.env.FIREBASE_PROJECT_ID || 'violeafybasket').trim();

  // 3. Initialize Firebase Admin SDK
  if (serviceAccount) {
    console.log(`[FIREBASE-ADMIN] Initializing Firebase Admin SDK for project '${projectId}' with Service Account key...`);
    return initializeApp({
      credential: cert(serviceAccount),
      projectId,
      storageBucket,
    });
  }

  console.log(`[FIREBASE-ADMIN] Initializing Firebase Admin SDK for project '${projectId}' with Google Cloud Default Credentials...`);
  return initializeApp({
    projectId,
    storageBucket,
  });
}

// Single authenticated Firebase App instance
export const adminApp = initFirebaseAdminApp();

// Authenticated Authentication client
export const adminAuth = getAuth(adminApp);

// Authenticated Firestore client (using target database ID "violeafydb")
export const adminDb = getFirestore(adminApp, databaseId);

// Authenticated Cloud Storage client
export const adminStorage = getStorage(adminApp);
