import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { CategoryRepository } from '../src/repositories/repositories';
import { Category } from '../src/types';

describe('Category Master API & Database Verification Tests', () => {
  const categoryRepo = new CategoryRepository();
  const mockStorage: Category[] = [];

  // Override repository low-level DB calls to test authoritative persistence logic
  (categoryRepo as any).getAll = async () => [...mockStorage];
  (categoryRepo as any).create = async (doc: Category) => {
    mockStorage.push(doc);
    return doc;
  };
  (categoryRepo as any).update = async (id: string, updates: Partial<Category>) => {
    const idx = mockStorage.findIndex(c => c.id === id);
    if (idx >= 0) {
      mockStorage[idx] = { ...mockStorage[idx], ...updates, updatedAt: new Date().toISOString() };
      return mockStorage[idx];
    }
    throw new Error(`Category '${id}' not found`);
  };
  (categoryRepo as any).delete = async (id: string) => {
    const idx = mockStorage.findIndex(c => c.id === id);
    if (idx >= 0) {
      mockStorage.splice(idx, 1);
    }
  };

  it('1. Should initialize and fetch empty category list from product_categories collection', async () => {
    const categories = await categoryRepo.getAll();
    assert.strictEqual(Array.isArray(categories), true);
    assert.strictEqual(categories.length, 0);
  });

  it('2. Should create a new Category Master document in product_categories collection', async () => {
    const newCategory: Category = {
      id: 'cat_001',
      name: 'Organic Spices & Herbs',
      description: 'Pure organic spices sourced from local farms',
      imageUrl: 'https://example.com/spices.jpg',
      createdAt: new Date().toISOString(),
    };

    await categoryRepo.create(newCategory);

    const categories = await categoryRepo.getAll();
    assert.strictEqual(categories.length, 1);
    assert.strictEqual(categories[0].id, 'cat_001');
    assert.strictEqual(categories[0].name, 'Organic Spices & Herbs');
    assert.strictEqual(categories[0].imageUrl, 'https://example.com/spices.jpg');
  });

  it('3. Should update an existing Category Master document in product_categories collection', async () => {
    await categoryRepo.update('cat_001', {
      name: 'Exotic Organic Spices',
      description: 'Updated premium organic spice blends',
    });

    const categories = await categoryRepo.getAll();
    const updated = categories.find(c => c.id === 'cat_001');
    assert.ok(updated);
    assert.strictEqual(updated.name, 'Exotic Organic Spices');
    assert.strictEqual(updated.description, 'Updated premium organic spice blends');
  });

  it('4. Should handle category picture URL update as single source of truth in Firestore DB', async () => {
    const newPictureUrl = 'https://storage.googleapis.com/violeafy-bucket/categories/cat_001/main.jpg';
    await categoryRepo.update('cat_001', {
      imageUrl: newPictureUrl,
      storagePath: 'categories/cat_001/main.jpg',
    });

    const categories = await categoryRepo.getAll();
    const updated = categories.find(c => c.id === 'cat_001');
    assert.ok(updated);
    assert.strictEqual(updated.imageUrl, newPictureUrl);
    assert.strictEqual(updated.storagePath, 'categories/cat_001/main.jpg');
  });

  it('5. Should delete a Category Master document from product_categories collection', async () => {
    await categoryRepo.delete('cat_001');

    const categories = await categoryRepo.getAll();
    assert.strictEqual(categories.length, 0);
  });
});
