import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getFirestore, doc, getDocFromServer } from 'firebase/firestore';
import { getStorage } from 'firebase/storage';

const getEnvFirebaseConfig = () => {
  try {
    if (typeof process !== 'undefined' && process.env && process.env.FIREBASE_CONFIG) {
      return JSON.parse(process.env.FIREBASE_CONFIG);
    }
  } catch (e) {
    console.error('Failed to parse FIREBASE_CONFIG environment variable', e);
  }
  return {};
};

const envConfig = getEnvFirebaseConfig();

const getVal = (metaVal: string | undefined, processVal: string | undefined, fallback: string = '') => {
  if (metaVal && typeof metaVal === 'string' && metaVal.trim()) return metaVal.trim();
  if (processVal && typeof processVal === 'string' && processVal.trim()) return processVal.trim();
  return fallback;
};

const importMetaEnv = typeof import.meta !== 'undefined' ? (import.meta as any).env || {} : {};

const firebaseConfig = {
  projectId: getVal(importMetaEnv.VITE_FIREBASE_PROJECT_ID, process.env.FIREBASE_PROJECT_ID, envConfig.projectId || 'violeafybasket'),
  appId: getVal(importMetaEnv.VITE_FIREBASE_APP_ID, process.env.FIREBASE_APP_ID, envConfig.appId || '1:347630935812:web:0a0e7689a0e7e9d59b3a51'),
  apiKey: getVal(importMetaEnv.VITE_FIREBASE_API_KEY, process.env.FIREBASE_API_KEY, envConfig.apiKey || 'AIzaSyC0cvVrHCaBNnM9EFuM3lAtpfCG2Za_kOc'),
  authDomain: getVal(importMetaEnv.VITE_FIREBASE_AUTH_DOMAIN, process.env.FIREBASE_AUTH_DOMAIN, envConfig.authDomain || 'violeafybasket.firebaseapp.com'),
  firestoreDatabaseId: getVal(importMetaEnv.VITE_FIRESTORE_DATABASE_ID, process.env.FIRESTORE_DATABASE_ID || process.env.FIREBASE_DATABASE_ID, envConfig.firestoreDatabaseId || 'violeafydb'),
  storageBucket: getVal(importMetaEnv.VITE_FIREBASE_STORAGE_BUCKET, process.env.FIREBASE_STORAGE_BUCKET, envConfig.storageBucket || 'violeafybasket.firebasestorage.app'),
  messagingSenderId: getVal(importMetaEnv.VITE_FIREBASE_MESSAGING_SENDER_ID, process.env.FIREBASE_MESSAGING_SENDER_ID, envConfig.messagingSenderId || ''),
  measurementId: getVal(importMetaEnv.VITE_FIREBASE_MEASUREMENT_ID, process.env.FIREBASE_MEASUREMENT_ID, envConfig.measurementId || ''),
};

let initError: string | null = null;
let app: any = null;
let customDbId: string | undefined = undefined;
let db: any = null;
let auth: any = null;
let storage: any = null;

function isValidApiKey(key: any) {
  return typeof key === 'string' && key.length > 20 && !key.includes('YOUR_') && !key.includes('REPLACE');
}

try {
  if (!isValidApiKey(firebaseConfig.apiKey)) {
    initError = 'Missing or invalid Firebase API key. Client features requiring Firebase will be disabled.';
    console.warn('[VIO-FIREBASE]', initError, { apiKeyLength: String(firebaseConfig.apiKey || '').length });
  } else {
    app = initializeApp(firebaseConfig);
    customDbId = firebaseConfig.firestoreDatabaseId || undefined;
    db = customDbId ? getFirestore(app, customDbId) : getFirestore(app);
    auth = getAuth();
    storage = getStorage(app);
  }
} catch (error: any) {
  initError = error?.message || String(error);
  console.error('[VIO-FIREBASE] Initialization failed:', error);
}

export { db, auth, storage, initError };

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
    tenantId?: string | null;
  }
}

export function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
  const currentUser = auth ? auth.currentUser : null;
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: currentUser?.uid,
      email: currentUser?.email,
      emailVerified: currentUser?.emailVerified,
      isAnonymous: currentUser?.isAnonymous,
      tenantId: currentUser?.tenantId,
    },
    operationType,
    path
  };
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

// Quietly check/test the Connection to Firestore
async function testConnection() {
  if (!db) return;
  try {
    await getDocFromServer(doc(db, 'test', 'connection'));
  } catch (error) {
    if (error instanceof Error && error.message.includes('the client is offline')) {
      console.warn("Please check your Firebase configuration or network status.");
    }
  }
}
if (!initError) testConnection();
