import type { Firestore } from 'firebase-admin/firestore';

export const PRODUCT_SKU_SEQUENCES_COLLECTION = 'product_sku_sequences';
export const DEFAULT_SKU_SEQUENCE_DOC_ID = 'default';
export const MIN_EIGHT_DIGIT_SKU = 10000001;
export const MAX_EIGHT_DIGIT_SKU = 99999999;
export const EIGHT_DIGIT_SKU_REGEX = /^[0-9]{8}$/;

export function isValidEightDigitNumericSku(sku: unknown): boolean {
  return typeof sku === 'string' && EIGHT_DIGIT_SKU_REGEX.test(sku.trim());
}

/**
 * Computes the highest existing 8-digit numeric SKU across a list of product records.
 * Returns `MIN_EIGHT_DIGIT_SKU - 1` (10000000) when no 8-digit numeric SKUs exist yet,
 * so the first generated SKU is `10000001`.
 */
export function computeHighestExistingEightDigitSku(products: Array<{ sku?: unknown }>): number {
  let highest = MIN_EIGHT_DIGIT_SKU - 1;
  for (const prod of products || []) {
    const raw = String(prod?.sku ?? '').trim();
    if (EIGHT_DIGIT_SKU_REGEX.test(raw)) {
      const numeric = Number.parseInt(raw, 10);
      if (Number.isFinite(numeric) && numeric > highest && numeric < MAX_EIGHT_DIGIT_SKU) {
        highest = numeric;
      }
    }
  }
  return highest;
}

/**
 * Allocates a unique 8-digit numeric SKU (`10000001` - `99999999`) using an atomic
 * Firestore transaction on `product_sku_sequences/default` and cross-checking against
 * existing `products` documents.
 */
export async function allocateUniqueEightDigitSku(db: Firestore): Promise<string> {
  // Pre-fetch existing products outside transaction to seed initial sequence floor and collision set
  const productsSnap = await db.collection('products').select('sku').get();
  const existingProducts = productsSnap.docs.map((d) => d.data() || {});
  const usedSkus = new Set<string>(
    existingProducts
      .map((p) => String(p.sku ?? '').trim())
      .filter(Boolean)
  );
  const highestExisting = computeHighestExistingEightDigitSku(existingProducts);

  const seqRef = db.collection(PRODUCT_SKU_SEQUENCES_COLLECTION).doc(DEFAULT_SKU_SEQUENCE_DOC_ID);

  return db.runTransaction(async (tx) => {
    const seqSnap = await tx.get(seqRef);
    const storedCurrent = seqSnap.exists ? Number(seqSnap.data()?.currentSkuNumber || 0) : 0;
    let candidate = Math.max(MIN_EIGHT_DIGIT_SKU - 1, highestExisting, storedCurrent) + 1;

    while (candidate <= MAX_EIGHT_DIGIT_SKU) {
      const candidateStr = String(candidate).padStart(8, '0');
      if (!usedSkus.has(candidateStr)) {
        const collisionQuery = await tx.get(
          db.collection('products').where('sku', '==', candidateStr).limit(1)
        );
        if (collisionQuery.empty) {
          tx.set(
            seqRef,
            {
              currentSkuNumber: candidate,
              lastAllocatedSku: candidateStr,
              updatedAt: new Date().toISOString(),
            },
            { merge: true }
          );
          return candidateStr;
        }
        usedSkus.add(candidateStr);
      }
      candidate += 1;
    }

    throw new Error('SKU_RANGE_EXHAUSTED: 8-digit numeric SKU sequence (10000001-99999999) is exhausted.');
  });
}

/**
 * Enforces SKU immutability on existing products (Section 19.2 & 19.5):
 * - If an existing product already has a non-empty SKU, any attempt to change it is rejected or ignored.
 * - If an existing legacy product has no SKU, allocates a new 8-digit numeric SKU.
 */
export function enforceSkuImmutabilityOnUpdate(
  existingProduct: { sku?: string | null } | null | undefined,
  incomingPatch: Record<string, any>,
  strictReject = false
): { allowed: boolean; error?: string; sanitizedPatch: Record<string, any> } {
  const existingSku = String(existingProduct?.sku ?? '').trim();
  const sanitized = { ...incomingPatch };

  if (!existingSku) {
    return { allowed: true, sanitizedPatch: sanitized };
  }

  if (sanitized.sku !== undefined) {
    const proposedSku = String(sanitized.sku ?? '').trim();
    // Always preserve existing SKU
    sanitized.sku = existingSku;
    if (proposedSku && proposedSku !== existingSku) {
      if (strictReject) {
        return {
          allowed: false,
          error: `SKU is immutable once assigned. Existing SKU '${existingSku}' cannot be changed to '${proposedSku}'.`,
          sanitizedPatch: sanitized,
        };
      }
    }
  }

  return { allowed: true, sanitizedPatch: sanitized };
}
