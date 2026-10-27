import { adminDb } from '../firebase-admin';

async function migrateItemStatus() {
  if (!adminDb) {
    console.error('adminDb is not initialized.');
    process.exit(1);
  }

  console.log('Fetching documents from shipment_brand_owner_fulfilment...');
  const snapshot = await adminDb.collection('shipment_brand_owner_fulfilment').get();
  console.log(`Found ${snapshot.size} documents in shipment_brand_owner_fulfilment.`);

  let updatedDocsCount = 0;
  let updatedItemsCount = 0;

  for (const doc of snapshot.docs) {
    const data = doc.data();
    if (!Array.isArray(data.items)) continue;

    let docModified = false;
    const updatedItems = data.items.map((item: any) => {
      if (!item || typeof item !== 'object') return item;
      const hasStatus = Object.prototype.hasOwnProperty.call(item, 'status');
      const hasDelivery = Object.prototype.hasOwnProperty.call(item, 'deliverystatus');
      if (!hasStatus && !hasDelivery) return item;

      docModified = true;
      updatedItemsCount++;
      const { status, deliverystatus, ...rest } = item;
      const migrated: Record<string, any> = { ...rest };
      if (hasStatus) {
        migrated.itemstatus = rest.itemstatus ?? status ?? '';
      }
      if (hasDelivery) {
        migrated.itemdeliverystatus = rest.itemdeliverystatus ?? deliverystatus ?? '';
      }
      return migrated;
    });

    if (docModified) {
      await adminDb.collection('shipment_brand_owner_fulfilment').doc(doc.id).update({
        items: updatedItems,
      });
      updatedDocsCount++;
      console.log(`✓ Migrated items[].status -> itemstatus in document: ${doc.id} (${updatedItems.length} items)`);
    }
  }

  console.log(`\nMigration complete: ${updatedDocsCount} document(s) updated (${updatedItemsCount} item(s) migrated).`);

  // Verify
  const verifySnapshot = await adminDb.collection('shipment_brand_owner_fulfilment').get();
  let remainingLegacy = 0;
  for (const doc of verifySnapshot.docs) {
    const data = doc.data();
    if (Array.isArray(data.items)) {
      for (const it of data.items) {
        if (it && Object.prototype.hasOwnProperty.call(it, 'status')) {
          remainingLegacy++;
        }
      }
    }
  }
  console.log(`Verification: ${remainingLegacy} item(s) still have legacy 'status' key.`);
}

migrateItemStatus()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('Migration failed:', err);
    process.exit(1);
  });

