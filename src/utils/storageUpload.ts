import { auth, storage } from '../firebase';
import { getDownloadURL, ref, uploadBytes } from 'firebase/storage';

export interface UploadedFileMetadata {
  downloadUrl: string;
  storagePath: string;
  fileName: string;
  contentType: string;
  fileSize: number;
}

function readFileAsDataUrl(file: File | Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = (err) => reject(err);
    reader.readAsDataURL(file);
  });
}

async function uploadFromBrowser(file: File, storagePath: string): Promise<UploadedFileMetadata> {
  try {
    if (!storage || !auth?.currentUser) {
      throw new Error('Firebase Storage is unavailable or user is not signed in');
    }
    const fileRef = ref(storage, storagePath);
    await uploadBytes(fileRef, file, { contentType: file.type || 'application/octet-stream' });
    const downloadUrl = await getDownloadURL(fileRef);
    return {
      downloadUrl,
      storagePath,
      fileName: file.name || 'uploaded_file',
      contentType: file.type || 'application/octet-stream',
      fileSize: file.size || 0,
    };
  } catch (err) {
    console.warn('[StorageUpload] Storage upload failed, using Data URL fallback:', err);
    const dataUrl = await readFileAsDataUrl(file);
    return {
      downloadUrl: dataUrl,
      storagePath,
      fileName: file.name || 'uploaded_file',
      contentType: file.type || 'image/jpeg',
      fileSize: file.size || 0,
    };
  }
}

export async function uploadFileToStorage(file: File, storagePath: string): Promise<UploadedFileMetadata> {
  try {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('storagePath', storagePath);

    const token = auth?.currentUser ? await auth.currentUser.getIdToken().catch(() => null) : null;
    const response = await fetch('/api/uploads', {
      method: 'POST',
      headers: token ? { Authorization: `Bearer ${token}` } : undefined,
      body: formData,
    });

    if (response.ok) {
      const payload = await response.json().catch(() => ({}));
      if (payload.file && payload.file.downloadUrl) {
        return payload.file as UploadedFileMetadata;
      }
    }
  } catch (err) {
    console.warn('[StorageUpload] Server API upload failed, falling back to browser storage/data URL:', err);
  }

  return uploadFromBrowser(file, storagePath);
}

export async function uploadProductImage(file: File, productId: string): Promise<UploadedFileMetadata> {
  try {
    const token = auth?.currentUser ? await auth.currentUser.getIdToken().catch(() => null) : null;
    const formData = new FormData();
    formData.append('image', file);

    const response = await fetch(`/api/products/${productId}/image`, {
      method: 'PUT',
      headers: token ? { Authorization: `Bearer ${token}` } : undefined,
      body: formData,
    });

    if (response.ok) {
      const payload = await response.json().catch(() => ({}));
      if (payload.product?.imageUrl) {
        return {
          downloadUrl: payload.product.imageUrl,
          storagePath: payload.product.storagePath || `products/${productId}/main.jpg`,
          fileName: file.name,
          contentType: file.type,
          fileSize: file.size,
        };
      }
    }
  } catch (err) {
    console.warn('[StorageUpload] uploadProductImage API failed, using fallback:', err);
  }

  return uploadFromBrowser(file, `products/${productId}/main.jpg`);
}

export async function uploadCategoryImage(file: File, categoryId: string): Promise<UploadedFileMetadata> {
  try {
    const token = auth?.currentUser ? await auth.currentUser.getIdToken().catch(() => null) : null;
    const formData = new FormData();
    formData.append('image', file);
    formData.append('file', file);

    const response = await fetch(`/api/categories/${categoryId}/picture`, {
      method: 'POST',
      headers: token ? { Authorization: `Bearer ${token}` } : undefined,
      body: formData,
    });

    if (response.ok) {
      const payload = await response.json().catch(() => ({}));
      if (payload.category?.imageUrl) {
        return {
          downloadUrl: payload.category.imageUrl,
          storagePath: payload.category.storagePath || `categories/${categoryId}/main.jpg`,
          fileName: file.name,
          contentType: file.type,
          fileSize: file.size,
        };
      }
    }
  } catch (err) {
    console.warn('[StorageUpload] uploadCategoryImage API failed, using fallback:', err);
  }

  return uploadFromBrowser(file, `categories/${categoryId}/main.jpg`);
}

export async function uploadBrandImage(file: File, brandId: string): Promise<UploadedFileMetadata> {
  try {
    const token = auth?.currentUser ? await auth.currentUser.getIdToken().catch(() => null) : null;
    const formData = new FormData();
    formData.append('image', file);
    formData.append('file', file);

    const response = await fetch(`/api/brands/${brandId}/picture`, {
      method: 'POST',
      headers: token ? { Authorization: `Bearer ${token}` } : undefined,
      body: formData,
    });

    if (response.ok) {
      const payload = await response.json().catch(() => ({}));
      const imgUrl = payload.brand?.imageUrl || payload.doc?.imageUrl;
      if (imgUrl) {
        return {
          downloadUrl: imgUrl,
          storagePath: payload.brand?.storagePath || payload.doc?.storagePath || `brands/${brandId}/main.jpg`,
          fileName: file.name,
          contentType: file.type,
          fileSize: file.size,
        };
      }
    }
  } catch (err) {
    console.warn('[StorageUpload] uploadBrandImage API failed, using fallback:', err);
  }

  return uploadFromBrowser(file, `brands/${brandId}/main.jpg`);
}

export async function uploadBrandOwnerImage(file: File, ownerId: string): Promise<UploadedFileMetadata> {
  try {
    const token = auth?.currentUser ? await auth.currentUser.getIdToken().catch(() => null) : null;
    const formData = new FormData();
    formData.append('image', file);
    formData.append('file', file);

    const response = await fetch(`/api/brand-owners/${ownerId}/picture`, {
      method: 'POST',
      headers: token ? { Authorization: `Bearer ${token}` } : undefined,
      body: formData,
    });

    if (response.ok) {
      const payload = await response.json().catch(() => ({}));
      const imgUrl = payload.owner?.imageUrl || payload.doc?.imageUrl;
      if (imgUrl) {
        return {
          downloadUrl: imgUrl,
          storagePath: payload.owner?.storagePath || payload.doc?.storagePath || `brand_owners/${ownerId}/main.jpg`,
          fileName: file.name,
          contentType: file.type,
          fileSize: file.size,
        };
      }
    }
  } catch (err) {
    console.warn('[StorageUpload] uploadBrandOwnerImage API failed, using fallback:', err);
  }

  return uploadFromBrowser(file, `brand_owners/${ownerId}/main.jpg`);
}
