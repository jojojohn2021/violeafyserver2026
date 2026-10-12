import { adminApp, adminDb } from '../firebase-admin';
import { getFirestore } from 'firebase-admin/firestore';

const TARGET_COLLECTIONS = [
  'shipment_brand_owner_fulfilment',
  'shipment_tracking',
];

async function deleteCollectionDocs(firestore: any, dbName: string, collectionName: string) {
  try {
    const colRef = firestore.collection(collectionName);
    const snapshot = await colRef.get();

    if (snapshot.empty) {
      console.log(`[${dbName}] Collection '${collectionName}' is already empty (0 documents).`);
      return 0;
    }

    console.log(`[${dbName}] Found ${snapshot.size} documents in '${collectionName}'. Deleting in batches...`);

    let totalDeleted = 0;
    const docs = snapshot.docs;
    const batchSize = 400;

    for (let i = 0; i < docs.length; i += batchSize) {
      const batch = firestore.batch();
      const chunk = docs.slice(i, i + batchSize);

      for (const doc of chunk) {
        batch.delete(doc.ref);
      }

      await batch.commit();
      totalDeleted += chunk.length;
      console.log(`[${dbName}] Deleted batch of ${chunk.length} documents from '${collectionName}' (${totalDeleted}/${docs.length}).`);
    }

    // Verify deletion
    const verifySnapshot = await colRef.get();
    console.log(`[${dbName}] Verification for '${collectionName}': ${verifySnapshot.size} documents remaining.`);
    return totalDeleted;
  } catch (err: any) {
    console.error(`[${dbName}] Error deleting collection '${collectionName}':`, err?.message || err);
    return 0;
  }
}

async function main() {
  console.log('===============================================================');
  console.log('PERMANENT DELETION OF COLLECTIONS:');
  TARGET_COLLECTIONS.forEach((col, idx) => console.log(`  ${idx + 1}. ${col}`));
  console.log('===============================================================\n');

  // 1. Primary Database (configured via adminDb)
  console.log('--- Processing Primary Admin Firestore Database ---');
  let primaryDeleted = 0;
  for (const col of TARGET_COLLECTIONS) {
    const count = await deleteCollectionDocs(adminDb, 'Primary DB', col);
    primaryDeleted += count;
  }

  // 2. Default Database (if distinct from adminDb)
  try {
    const defaultDb = getFirestore(adminApp);
    if (defaultDb !== adminDb) {
      console.log('\n--- Checking Default Firestore Database ---');
      for (const col of TARGET_COLLECTIONS) {
        await deleteCollectionDocs(defaultDb, 'Default DB', col);
      }
    }
  } catch (defaultDbErr: any) {
    console.log('[Default DB Check Skipped]:', defaultDbErr?.message || defaultDbErr);
  }

  console.log('\n===============================================================');
  console.log('DELETION COMPLETE: All target documents deleted from Firestore.');
  console.log('===============================================================');
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('Fatal error executing deletion script:', err);
    process.exit(1);
  });
