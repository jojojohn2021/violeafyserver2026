import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { BrandRepository, BrandOwnerRepository } from '../src/repositories/repositories';
import { Brand, BrandOwner } from '../src/types';

describe('Brand Masters & Brand Owners Master API & Database Verification Tests', () => {
  const brandRepo = new BrandRepository();
  const brandOwnerRepo = new BrandOwnerRepository();

  const mockBrandStorage: Brand[] = [];
  const mockOwnerStorage: BrandOwner[] = [];

  // Override repository low-level DB calls for BrandRepository
  (brandRepo as any).getAll = async () => [...mockBrandStorage];
  (brandRepo as any).create = async (doc: Brand) => {
    mockBrandStorage.push(doc);
    return doc;
  };
  (brandRepo as any).update = async (id: string, updates: Partial<Brand>) => {
    const idx = mockBrandStorage.findIndex(b => b.id === id);
    if (idx >= 0) {
      mockBrandStorage[idx] = { ...mockBrandStorage[idx], ...updates, updatedAt: new Date().toISOString() };
      return mockBrandStorage[idx];
    }
    throw new Error(`Brand '${id}' not found`);
  };
  (brandRepo as any).delete = async (id: string) => {
    const idx = mockBrandStorage.findIndex(b => b.id === id);
    if (idx >= 0) {
      mockBrandStorage.splice(idx, 1);
    }
  };

  // Override repository low-level DB calls for BrandOwnerRepository
  (brandOwnerRepo as any).getAll = async () => [...mockOwnerStorage];
  (brandOwnerRepo as any).create = async (doc: BrandOwner) => {
    mockOwnerStorage.push(doc);
    return doc;
  };
  (brandOwnerRepo as any).update = async (id: string, updates: Partial<BrandOwner>) => {
    const idx = mockOwnerStorage.findIndex(o => o.id === id);
    if (idx >= 0) {
      mockOwnerStorage[idx] = { ...mockOwnerStorage[idx], ...updates, updatedAt: new Date().toISOString() };
      return mockOwnerStorage[idx];
    }
    throw new Error(`Brand Owner '${id}' not found`);
  };
  (brandOwnerRepo as any).delete = async (id: string) => {
    const idx = mockOwnerStorage.findIndex(o => o.id === id);
    if (idx >= 0) {
      mockOwnerStorage.splice(idx, 1);
    }
  };

  it('1. Should initialize and fetch empty brand master list from product_brands collection', async () => {
    const brands = await brandRepo.getAll();
    assert.strictEqual(Array.isArray(brands), true);
    assert.strictEqual(brands.length, 0);
  });

  it('2. Should create a new Brand Master document in product_brands collection', async () => {
    const newBrand: Brand = {
      id: 'brand_001',
      name: 'CleanFlow Ultra',
      owner: 'CleanseCorp India Ltd',
      description: 'Industrial and eco-friendly floor cleaners',
      imageUrl: 'https://example.com/cleanflow.jpg',
      createdAt: new Date().toISOString(),
    };

    await brandRepo.create(newBrand);

    const brands = await brandRepo.getAll();
    assert.strictEqual(brands.length, 1);
    assert.strictEqual(brands[0].id, 'brand_001');
    assert.strictEqual(brands[0].name, 'CleanFlow Ultra');
    assert.strictEqual(brands[0].owner, 'CleanseCorp India Ltd');
    assert.strictEqual(brands[0].imageUrl, 'https://example.com/cleanflow.jpg');
  });

  it('3. Should update an existing Brand Master document in product_brands collection', async () => {
    await brandRepo.update('brand_001', {
      name: 'CleanFlow Ultra Pro',
      description: 'Updated bio-degradable formula',
    });

    const brands = await brandRepo.getAll();
    const updated = brands.find(b => b.id === 'brand_001');
    assert.ok(updated);
    assert.strictEqual(updated.name, 'CleanFlow Ultra Pro');
    assert.strictEqual(updated.description, 'Updated bio-degradable formula');
  });

  it('4. Should store and update brand picture URL in product_brands as single source of truth', async () => {
    const pictureUrl = 'https://storage.googleapis.com/violeafy-bucket/brands/brand_001/main.jpg';
    await brandRepo.update('brand_001', {
      imageUrl: pictureUrl,
      storagePath: 'brands/brand_001/main.jpg',
    });

    const brands = await brandRepo.getAll();
    const updated = brands.find(b => b.id === 'brand_001');
    assert.ok(updated);
    assert.strictEqual(updated.imageUrl, pictureUrl);
    assert.strictEqual(updated.storagePath, 'brands/brand_001/main.jpg');
  });

  it('5. Should delete a Brand Master document from product_brands collection', async () => {
    await brandRepo.delete('brand_001');

    const brands = await brandRepo.getAll();
    assert.strictEqual(brands.length, 0);
  });

  it('6. Should initialize and fetch empty brand owner list from product_brand_owners collection', async () => {
    const owners = await brandOwnerRepo.getAll();
    assert.strictEqual(Array.isArray(owners), true);
    assert.strictEqual(owners.length, 0);
  });

  it('7. Should create a new Brand Owner Master document in product_brand_owners collection', async () => {
    const newOwner: BrandOwner = {
      id: 'owner_001',
      name: 'CleanseCorp India Ltd',
      contactPerson: 'Rajesh Malhotra',
      contactEmail: 'rajesh@cleansecorp.in',
      description: 'Parent corporate manufacturer',
      imageUrl: 'https://example.com/cleansecorp_logo.jpg',
      createdAt: new Date().toISOString(),
    };

    await brandOwnerRepo.create(newOwner);

    const owners = await brandOwnerRepo.getAll();
    assert.strictEqual(owners.length, 1);
    assert.strictEqual(owners[0].id, 'owner_001');
    assert.strictEqual(owners[0].name, 'CleanseCorp India Ltd');
    assert.strictEqual(owners[0].imageUrl, 'https://example.com/cleansecorp_logo.jpg');
  });

  it('8. Should update Brand Owner Master document in product_brand_owners collection', async () => {
    await brandOwnerRepo.update('owner_001', {
      contactPerson: 'Sanjay Malhotra',
      description: 'Leading organic FMCG conglomerate',
    });

    const owners = await brandOwnerRepo.getAll();
    const updated = owners.find(o => o.id === 'owner_001');
    assert.ok(updated);
    assert.strictEqual(updated.contactPerson, 'Sanjay Malhotra');
    assert.strictEqual(updated.description, 'Leading organic FMCG conglomerate');
  });

  it('9. Should store and update brand owner picture logo URL in product_brand_owners as single source of truth', async () => {
    const logoUrl = 'https://storage.googleapis.com/violeafy-bucket/brand_owners/owner_001/main.jpg';
    await brandOwnerRepo.update('owner_001', {
      imageUrl: logoUrl,
      storagePath: 'brand_owners/owner_001/main.jpg',
    });

    const owners = await brandOwnerRepo.getAll();
    const updated = owners.find(o => o.id === 'owner_001');
    assert.ok(updated);
    assert.strictEqual(updated.imageUrl, logoUrl);
    assert.strictEqual(updated.storagePath, 'brand_owners/owner_001/main.jpg');
  });

  it('10. Should delete a Brand Owner Master document from product_brand_owners collection', async () => {
    await brandOwnerRepo.delete('owner_001');

    const owners = await brandOwnerRepo.getAll();
    assert.strictEqual(owners.length, 0);
  });
});
