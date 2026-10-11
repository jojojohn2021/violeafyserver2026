import { adminDb } from '../firebase-admin';

async function migrateShipId() {
  if (!adminDb) {
    console.error('adminDb is not initialized.');
    process.exit(1);
  }

  console.log('Fetching documents from shipment_brand_owner_fulfilment...');
  const snapshot = await adminDb.collection('shipment_brand_owner_fulfilment').get();
  console.log(`Found ${snapshot.size} documents in shipment_brand_owner_fulfilment.`);

  const assignedShipIds = new Set<string>();

  function generateUniqueShipId(): string {
    let shipid: string;
    do {
      shipid = `ship_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    } while (assignedShipIds.has(shipid));
    assignedShipIds.add(shipid);
    return shipid;
  }

  let updatedCount = 0;
  for (const doc of snapshot.docs) {
    const data = doc.data();
    console.log(`\nDocument ID: ${doc.id}`);
    console.log(`Current data keys: ${Object.keys(data).join(', ')}`);
    console.log(`Existing shipid: ${data.shipid || 'NONE'}`);

    let needsUpdate = false;
    const updates: Record<string, any> = {};

    let currentShipId = data.shipid;
    if (!currentShipId) {
      currentShipId = generateUniqueShipId();
      updates.shipid = currentShipId;
      needsUpdate = true;
      console.log(`-> Assigning new unique shipid: ${currentShipId}`);
    } else {
      assignedShipIds.add(currentShipId);
      console.log(`-> Keeping existing shipid: ${currentShipId}`);
    }

    // Check if there are childRecords that need shipid as well
    if (Array.isArray(data.childRecords) && data.childRecords.length > 0) {
      let childUpdated = false;
      const updatedChildRecords = data.childRecords.map((child: any) => {
        if (!child.shipid) {
          childUpdated = true;
          return { ...child, shipid: currentShipId };
        }
        return child;
      });
      if (childUpdated) {
        updates.childRecords = updatedChildRecords;
        needsUpdate = true;
        console.log(`-> Updated ${updatedChildRecords.length} childRecords with shipid: ${currentShipId}`);
      }
    }

    if (needsUpdate) {
      await adminDb.collection('shipment_brand_owner_fulfilment').doc(doc.id).update(updates);
      console.log(`✓ Document ${doc.id} updated successfully.`);
      updatedCount++;
    } else {
      console.log(`- Document ${doc.id} already has shipid. No update needed.`);
    }
  }

  console.log(`\nMigration completed. ${updatedCount} documents updated.`);

  // Verification step
  console.log('\n--- VERIFICATION ---');
  const verifySnapshot = await adminDb.collection('shipment_brand_owner_fulfilment').get();
  for (const doc of verifySnapshot.docs) {
    const data = doc.data();
    console.log(`Doc ID: ${doc.id} | shipid: ${data.shipid} | orderNo: ${data.orderNo || data.salesOrderId || 'N/A'}`);
  }
}

migrateShipId()
  .then(() => {
    console.log('\nDone!');
    process.exit(0);
  })
  .catch((err) => {
    console.error('Error migrating shipid:', err);
    process.exit(1);
  });
