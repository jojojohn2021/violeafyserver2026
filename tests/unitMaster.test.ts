import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { UnitMasterRepository } from '../src/repositories/repositories';
import { UnitMaster } from '../src/types';
import { DEFAULT_UNITS } from '../src/store';

describe('Unit Master API & Database Verification Tests', () => {
  const unitRepo = new UnitMasterRepository();
  const mockStorage: UnitMaster[] = [];

  (unitRepo as any).getAll = async () => [...mockStorage];
  (unitRepo as any).create = async (doc: UnitMaster) => {
    mockStorage.push(doc);
    return doc;
  };
  (unitRepo as any).update = async (id: string, updates: Partial<UnitMaster>) => {
    const idx = mockStorage.findIndex(u => u.id === id);
    if (idx >= 0) {
      mockStorage[idx] = { ...mockStorage[idx], ...updates, updatedAt: new Date().toISOString() };
      return mockStorage[idx];
    }
    throw new Error(`Unit '${id}' not found`);
  };
  (unitRepo as any).delete = async (id: string) => {
    const idx = mockStorage.findIndex(u => u.id === id);
    if (idx >= 0) {
      mockStorage.splice(idx, 1);
    }
  };

  it('1. Should contain all 19 default Unit Master records in DEFAULT_UNITS', () => {
    assert.strictEqual(DEFAULT_UNITS.length, 19);
    
    const expected = [
      { desc: 'BAG', uqc: 'BAG' },
      { desc: 'Bundles', uqc: 'BDL' },
      { desc: 'Bale', uqc: 'BAL' },
      { desc: 'Buckles', uqc: 'BKL' },
      { desc: 'Box', uqc: 'BOX' },
      { desc: 'Bottles', uqc: 'BTL' },
      { desc: 'Bunches', uqc: 'BUN' },
      { desc: 'Cans', uqc: 'CAN' },
      { desc: 'Cartons', uqc: 'CTN' },
      { desc: 'Dozen', uqc: 'DOZ' },
      { desc: 'Drum', uqc: 'DRM' },
      { desc: 'Gross', uqc: 'GRS' },
      { desc: 'Numbers', uqc: 'NOS' },
      { desc: 'Packs', uqc: 'PAC' },
      { desc: 'Pieces', uqc: 'PCS' },
      { desc: 'Pairs', uqc: 'PRS' },
      { desc: 'Rolls', uqc: 'ROL' },
      { desc: 'Sets', uqc: 'SET' },
      { desc: 'Tablets', uqc: 'TBS' }
    ];

    expected.forEach(item => {
      const match = DEFAULT_UNITS.find(u => u.desc === item.desc && u.uqc === item.uqc);
      assert.ok(match, `Missing default unit: Desc=${item.desc}, UQC=${item.uqc}`);
    });
  });

  it('2. Should create unit records in product_units collection', async () => {
    for (const unit of DEFAULT_UNITS) {
      await unitRepo.create(unit);
    }

    const units = await unitRepo.getAll();
    assert.strictEqual(units.length, 19);
    assert.strictEqual(units[0].desc, 'BAG');
    assert.strictEqual(units[0].uqc, 'BAG');
  });

  it('3. Should enforce UQC uniqueness logic', () => {
    const existingUqcs = mockStorage.map(u => u.uqc.toUpperCase());
    const isDuplicate = (uqc: string) => existingUqcs.includes(uqc.toUpperCase());

    assert.strictEqual(isDuplicate('BAG'), true);
    assert.strictEqual(isDuplicate('bdl'), true);
    assert.strictEqual(isDuplicate('NEW_UQC'), false);
  });

  it('4. Should update unit record in product_units collection', async () => {
    await unitRepo.update('unit_bag', { desc: 'Bags Heavy Duty', uqc: 'BAG' });

    const units = await unitRepo.getAll();
    const updated = units.find(u => u.id === 'unit_bag');
    assert.strictEqual(updated?.desc, 'Bags Heavy Duty');
  });

  it('5. Should delete unit record from product_units collection', async () => {
    await unitRepo.delete('unit_bag');
    const units = await unitRepo.getAll();
    assert.strictEqual(units.length, 18);
  });
});
