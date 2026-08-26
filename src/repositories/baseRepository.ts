import { 
  collection, 
  doc, 
  getDocs, 
  getDoc, 
  addDoc, 
  setDoc, 
  updateDoc, 
  deleteDoc, 
  QueryConstraint, 
  query 
} from 'firebase/firestore';
import { signInAnonymously } from 'firebase/auth';
import { db, auth } from '../firebase';
import { createFirestoreException, OperationType } from '../utils/firestoreLogger';

export class BaseRepository<T extends { id?: string }> {
  protected collectionName: string;

  constructor(collectionName: string) {
    this.collectionName = collectionName;
  }

  protected sanitizeForFirestore(obj: any): any {
    if (obj === undefined) return null;
    if (obj === null || typeof obj !== 'object') return obj;
    if (Array.isArray(obj)) {
      return obj.map(item => this.sanitizeForFirestore(item));
    }
    const clean: any = {};
    for (const [key, value] of Object.entries(obj)) {
      if (key !== 'id' && value !== undefined) {
        clean[key] = this.sanitizeForFirestore(value);
      }
    }
    return clean;
  }

  protected async ensureAuth(): Promise<void> {
    if (!auth) {
      return;
    }
    if (!auth.currentUser) {
      try {
        await signInAnonymously(auth);
      } catch (authErr: any) {
        const code = authErr?.code || 'auth/unauthenticated';
        const msg = authErr?.message || String(authErr);
        throw new Error(`Authentication missing for Firestore collection '${this.collectionName}': ${msg} (${code}). Please log in via Firebase Authentication.`);
      }
    }
  }

  protected isPermissionError(err: any): boolean {
    const code = err?.code;
    const msg = err?.message || String(err);
    return code === 'permission-denied' || msg.includes('permission') || msg.includes('Missing or insufficient permissions');
  }

  private async fallbackFetchAll(): Promise<T[]> {
    const res = await fetch(`/api/db/${this.collectionName}`);
    if (!res.ok) throw new Error(`Proxy status ${res.status}`);
    const data = await res.json();
    return data.docs || [];
  }

  private async fallbackGetById(id: string): Promise<T> {
    const res = await fetch(`/api/db/${this.collectionName}/${id}`);
    if (!res.ok) throw new Error(`Proxy status ${res.status}`);
    const data = await res.json();
    return data.doc;
  }

  private async fallbackSave(data: any): Promise<void> {
    const res = await fetch(`/api/db/${this.collectionName}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    if (!res.ok) throw new Error(`Proxy status ${res.status}`);
  }

  private async fallbackDelete(id: string): Promise<void> {
    const res = await fetch(`/api/db/${this.collectionName}/${id}`, {
      method: 'DELETE',
    });
    if (!res.ok) throw new Error(`Proxy status ${res.status}`);
  }

  async getAll(constraints: QueryConstraint[] = []): Promise<T[]> {
    try {
      await this.ensureAuth();
      const collRef = collection(db, this.collectionName);
      const q = constraints.length > 0 ? query(collRef, ...constraints) : collRef;
      const snapshot = await getDocs(q);
      
      return snapshot.docs.map(docSnap => ({
        id: docSnap.id,
        ...docSnap.data()
      } as unknown as T));
    } catch (error: any) {
      if (this.isPermissionError(error)) {
        try {
          console.warn(`[BaseRepository] Permission restricted for '${this.collectionName}'. Falling back to backend admin DB proxy.`);
          return await this.fallbackFetchAll();
        } catch (fallbackErr) {
          console.error(`[BaseRepository] Backend proxy fallback failed for '${this.collectionName}':`, fallbackErr);
        }
      }
      throw createFirestoreException('list', this.collectionName, error);
    }
  }

  async getById(id: string): Promise<T> {
    try {
      await this.ensureAuth();
      if (!id) {
        throw new Error("Invalid document ID provided.");
      }
      const docRef = doc(db, this.collectionName, id);
      const docSnap = await getDoc(docRef);

      if (!docSnap.exists()) {
        throw new Error(`Document with ID '${id}' not found in collection '${this.collectionName}'.`);
      }

      return {
        id: docSnap.id,
        ...docSnap.data()
      } as unknown as T;
    } catch (error: any) {
      if (this.isPermissionError(error)) {
        try {
          console.warn(`[BaseRepository] Permission restricted for getById '${this.collectionName}'. Falling back to backend admin DB proxy.`);
          return await this.fallbackGetById(id);
        } catch (fallbackErr) {
          console.error(`[BaseRepository] Backend proxy fallback failed for getById '${this.collectionName}':`, fallbackErr);
        }
      }
      throw createFirestoreException('get', this.collectionName, error, id);
    }
  }

  async create(data: Omit<T, 'id'> & { id?: string }): Promise<T> {
    try {
      await this.ensureAuth();
      const collRef = collection(db, this.collectionName);
      let docId = data.id;

      const cleanData = this.sanitizeForFirestore(data);

      if (docId) {
        const docRef = doc(db, this.collectionName, docId);
        await setDoc(docRef, cleanData);
      } else {
        const docRef = await addDoc(collRef, cleanData);
        docId = docRef.id;
      }

      return {
        ...data,
        id: docId
      } as unknown as T;
    } catch (error: any) {
      if (this.isPermissionError(error)) {
        try {
          console.warn(`[BaseRepository] Permission restricted for create '${this.collectionName}'. Falling back to backend admin DB proxy.`);
          const docId = data.id || `doc_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
          const fullObj = { ...data, id: docId };
          await this.fallbackSave(fullObj);
          return fullObj as unknown as T;
        } catch (fallbackErr) {
          console.error(`[BaseRepository] Backend proxy fallback failed for create '${this.collectionName}':`, fallbackErr);
        }
      }
      throw createFirestoreException('create', this.collectionName, error, data.id || null);
    }
  }

  async update(id: string, updates: Partial<T>): Promise<void> {
    try {
      await this.ensureAuth();
      if (!id) {
        throw new Error("Invalid document ID provided for update.");
      }
      const docRef = doc(db, this.collectionName, id);
      const cleanUpdates = this.sanitizeForFirestore(updates);
      await setDoc(docRef, cleanUpdates, { merge: true });
    } catch (error: any) {
      if (this.isPermissionError(error)) {
        try {
          console.warn(`[BaseRepository] Permission restricted for update '${this.collectionName}'. Falling back to backend admin DB proxy.`);
          const existing = await this.fallbackGetById(id);
          await this.fallbackSave({ ...existing, ...updates, id });
          return;
        } catch (fallbackErr) {
          console.error(`[BaseRepository] Backend proxy fallback failed for update '${this.collectionName}':`, fallbackErr);
        }
      }
      throw createFirestoreException('update', this.collectionName, error, id);
    }
  }

  async delete(id: string): Promise<void> {
    try {
      await this.ensureAuth();
      if (!id) {
        throw new Error("Invalid document ID provided for delete.");
      }
      const docRef = doc(db, this.collectionName, id);
      await deleteDoc(docRef);
    } catch (error: any) {
      if (this.isPermissionError(error)) {
        try {
          console.warn(`[BaseRepository] Permission restricted for delete '${this.collectionName}'. Falling back to backend admin DB proxy.`);
          await this.fallbackDelete(id);
          return;
        } catch (fallbackErr) {
          console.error(`[BaseRepository] Backend proxy fallback failed for delete '${this.collectionName}':`, fallbackErr);
        }
      }
      throw createFirestoreException('delete', this.collectionName, error, id);
    }
  }

  async set(id: string, data: T): Promise<void> {
    try {
      await this.ensureAuth();
      if (!id) {
        throw new Error("Invalid document ID provided for set operation.");
      }
      const docRef = doc(db, this.collectionName, id);
      const cleanData = this.sanitizeForFirestore(data);
      await setDoc(docRef, cleanData);
    } catch (error: any) {
      if (this.isPermissionError(error)) {
        try {
          console.warn(`[BaseRepository] Permission restricted for set '${this.collectionName}'. Falling back to backend admin DB proxy.`);
          await this.fallbackSave({ ...data, id });
          return;
        } catch (fallbackErr) {
          console.error(`[BaseRepository] Backend proxy fallback failed for set '${this.collectionName}':`, fallbackErr);
        }
      }
      throw createFirestoreException('write', this.collectionName, error, id);
    }
  }
}
