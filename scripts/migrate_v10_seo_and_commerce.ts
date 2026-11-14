/**
 * LeafyEarth | V10 AI Commerce & Product Discoverability (with V9 SEO Override)
 * Non-destructive Dry-Run & Backfill Migration Script
 *
 * Usage:
 *   npx tsx scripts/migrate_v10_seo_and_commerce.ts --dry-run   (default)
 *   npx tsx scripts/migrate_v10_seo_and_commerce.ts --apply
 */

import fs from 'fs';
import path from 'path';
import { getFirestoreAdmin } from '../src/services/firebaseAdmin';
import {
  buildStructuredFallbackSEO,
  getDefaultPlatformSettingsCatalog,
  normalizeUrlSlug,
} from '../src/services/aiCommerceService';

interface ProductMigrationItem {
  productId: string;
  sku: string | null;
  name: string;
  existingUrlSlug: string | null;
  proposedUrlSlug: string;
  slugAction: 'preserve_existing' | 'assign_new' | 'resolve_collision';
  fieldsToBackfill: string[];
}

async function runMigration() {
  const args = process.argv.slice(2);
  const applyChanges = args.includes('--apply');
  const dryRun = !applyChanges;

  console.log('====================================================================');
  console.log('LeafyEarth V10 SEO & AI Commerce Non-Destructive Migration');
  console.log(`Mode: ${dryRun ? 'DRY-RUN (no database writes)' : 'APPLY (writing backfills)'}`);
  console.log('====================================================================');

  const db = getFirestoreAdmin();
  const productsSnap = await db.collection('products').get();
  const slugsSnap = await db.collection('productSlugs').get();
  const settingsSnap = await db.collection('ai_commerce_settings').get();

  const reservedSlugs = new Map<string, string>();
  slugsSnap.docs.forEach((doc) => {
    const data = doc.data();
    if (data?.productId) {
      reservedSlugs.set(doc.id, String(data.productId));
    }
  });

  const auditItems: ProductMigrationItem[] = [];
  const now = new Date().toISOString();

  for (const prodDoc of productsSnap.docs) {
    const p = prodDoc.data() || {};
    const productId = prodDoc.id;
    const name = String(p.name || p.englishName || `Product ${productId}`).trim();
    const sku = p.sku ? String(p.sku) : null;

    const generated = buildStructuredFallbackSEO(name, {
      categoryHint: p.category,
      brandHint: p.brand,
      formHint: p.productForm,
    });

    let baseSlug = normalizeUrlSlug(p.urlSlug || generated.urlSlug || name);
    if (!baseSlug) baseSlug = `product-${productId.toLowerCase()}`;

    let finalSlug = baseSlug;
    let slugAction: ProductMigrationItem['slugAction'] = p.urlSlug
      ? 'preserve_existing'
      : 'assign_new';

    const existingOwner = reservedSlugs.get(finalSlug);
    if (existingOwner && existingOwner !== productId) {
      slugAction = 'resolve_collision';
      let counter = 2;
      while (reservedSlugs.has(`${baseSlug}-${counter}`) && reservedSlugs.get(`${baseSlug}-${counter}`) !== productId) {
        counter += 1;
      }
      finalSlug = `${baseSlug}-${counter}`;
    }
    reservedSlugs.set(finalSlug, productId);

    const fieldsToBackfill: string[] = [];
    const patch: Record<string, any> = {};

    if (!p.urlSlug) {
      fieldsToBackfill.push('urlSlug');
      patch.urlSlug = finalSlug;
    }
    if (!p.seoTitle) {
      fieldsToBackfill.push('seoTitle');
      patch.seoTitle = generated.seoTitle;
    }
    if (!p.metaDescription) {
      fieldsToBackfill.push('metaDescription');
      patch.metaDescription = generated.metaDescription;
    }
    if (!Array.isArray(p.seoKeywords) || p.seoKeywords.length === 0) {
      fieldsToBackfill.push('seoKeywords');
      patch.seoKeywords = generated.seoKeywords;
    }
    if (p.currency === undefined) {
      fieldsToBackfill.push('currency');
      patch.currency = 'INR';
    }
    if (p.condition === undefined) {
      fieldsToBackfill.push('condition');
      patch.condition = 'new';
    }
    if (p.countryOfOrigin === undefined) {
      fieldsToBackfill.push('countryOfOrigin');
      patch.countryOfOrigin = 'India';
    }
    if (p.aiCommerceEnabled === undefined) {
      fieldsToBackfill.push('aiCommerceEnabled');
      patch.aiCommerceEnabled = false;
    }
    if (typeof p.revision !== 'number') {
      fieldsToBackfill.push('revision');
      patch.revision = 1;
    }

    auditItems.push({
      productId,
      sku,
      name,
      existingUrlSlug: p.urlSlug || null,
      proposedUrlSlug: finalSlug,
      slugAction,
      fieldsToBackfill,
    });

    if (applyChanges) {
      if (Object.keys(patch).length > 0) {
        patch.updatedAt = now;
        await db.collection('products').doc(productId).set(patch, { merge: true });
      }
      await db
        .collection('productSlugs')
        .doc(finalSlug)
        .set(
          {
            slug: finalSlug,
            productId,
            state: 'active',
            canonicalSlug: finalSlug,
            createdAt: now,
            updatedAt: now,
          },
          { merge: true }
        );
    }
  }

  // Seed default disabled platform settings if missing
  const defaultCatalog = getDefaultPlatformSettingsCatalog();
  const existingSettingsIds = new Set(settingsSnap.docs.map((d) => d.id));
  const missingPlatforms = defaultCatalog.filter((s) => !existingSettingsIds.has(s.id));

  if (applyChanges && missingPlatforms.length > 0) {
    for (const platform of missingPlatforms) {
      await db.collection('ai_commerce_settings').doc(platform.id).set(platform, { merge: true });
    }
  }

  const report = {
    generatedAt: now,
    mode: dryRun ? 'dry-run' : 'apply',
    totalProductsScanned: productsSnap.size,
    existingSlugReservations: slugsSnap.size,
    missingPlatformSettingsSeeded: missingPlatforms.map((m) => m.id),
    products: auditItems,
  };

  const reportPath = path.resolve(process.cwd(), 'scripts', 'v10_migration_audit_report.json');
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2), 'utf8');

  console.log(`Scanned ${productsSnap.size} product(s).`);
  console.log(`Audit report saved to: ${reportPath}`);
}

runMigration().catch((err) => {
  console.error('Migration failed:', err);
  process.exit(1);
});
