import { auth, storage } from '../firebase';
import { getDownloadURL, ref, uploadBytes } from 'firebase/storage';

export interface UploadedFileMetadata {
  downloadUrl: string;
  storagePath: string;
  fileName: string;
  contentType: string;
  fileSize: number;
}

async function uploadFromBrowser(file: File, storagePath: string): Promise<UploadedFileMetadata> {
  if (!storage || !auth?.currentUser) throw new Error('Firebase Storage is unavailable or the user is not signed in');
  const fileRef = ref(storage, storagePath);
  await uploadBytes(fileRef, file, { contentType: file.type || 'application/octet-stream' });
  return {
    downloadUrl: await getDownloadURL(fileRef),
    storagePath,
    fileName: file.name,
    contentType: file.type,
    fileSize: file.size,
  };
}

export async function uploadFileToStorage(file: File, storagePath: string): Promise<UploadedFileMetadata> {
  const formData = new FormData();
  formData.append('file', file);
  formData.append('storagePath', storagePath);

  const token = auth?.currentUser ? await auth.currentUser.getIdToken() : null;
  const response = await fetch('/api/uploads', {
    method: 'POST',
    headers: token ? { Authorization: `Bearer ${token}` } : undefined,
    body: formData,
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) return uploadFromBrowser(file, storagePath);

  return payload.file as UploadedFileMetadata;
}

export async function uploadProductImage(file: File, productId: string): Promise<UploadedFileMetadata> {
  const token = auth?.currentUser ? await auth.currentUser.getIdToken() : null;
  const response = await fetch(`/api/products/${productId}/image`, {
    method: 'PUT',
    headers: token ? { Authorization: `Bearer ${token}` } : undefined,
    body: (() => {
      const formData = new FormData();
      formData.append('image', file);
      return formData;
    })(),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) return uploadFromBrowser(file, `products/${productId}/main.jpg`);
  return {
    downloadUrl: payload.product.imageUrl,
    storagePath: payload.product.storagePath,
    fileName: file.name,
    contentType: file.type,
    fileSize: file.size,
  };
}

export async function uploadCategoryImage(file: File, categoryId: string): Promise<UploadedFileMetadata> {
  const token = auth?.currentUser ? await auth.currentUser.getIdToken() : null;
  const formData = new FormData();
  formData.append('image', file);
  formData.append('file', file);

  const response = await fetch(`/api/categories/${categoryId}/picture`, {
    method: 'POST',
    headers: token ? { Authorization: `Bearer ${token}` } : undefined,
    body: formData,
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || !payload.category?.imageUrl) {
    return uploadFromBrowser(file, `categories/${categoryId}/main.jpg`);
  }
  return {
    downloadUrl: payload.category.imageUrl,
    storagePath: payload.category.storagePath || `categories/${categoryId}/main.jpg`,
    fileName: file.name,
    contentType: file.type,
    fileSize: file.size,
  };
}

export async function uploadBrandImage(file: File, brandId: string): Promise<UploadedFileMetadata> {
  const token = auth?.currentUser ? await auth.currentUser.getIdToken() : null;
  const formData = new FormData();
  formData.append('image', file);
  formData.append('file', file);

  const response = await fetch(`/api/brands/${brandId}/picture`, {
    method: 'POST',
    headers: token ? { Authorization: `Bearer ${token}` } : undefined,
    body: formData,
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || !(payload.brand?.imageUrl || payload.doc?.imageUrl)) {
    return uploadFromBrowser(file, `brands/${brandId}/main.jpg`);
  }
  const imgUrl = payload.brand?.imageUrl || payload.doc?.imageUrl;
  return {
    downloadUrl: imgUrl,
    storagePath: payload.brand?.storagePath || payload.doc?.storagePath || `brands/${brandId}/main.jpg`,
    fileName: file.name,
    contentType: file.type,
    fileSize: file.size,
  };
}

export async function uploadBrandOwnerImage(file: File, ownerId: string): Promise<UploadedFileMetadata> {
  const token = auth?.currentUser ? await auth.currentUser.getIdToken() : null;
  const formData = new FormData();
  formData.append('image', file);
  formData.append('file', file);

  const response = await fetch(`/api/brand-owners/${ownerId}/picture`, {
    method: 'POST',
    headers: token ? { Authorization: `Bearer ${token}` } : undefined,
    body: formData,
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || !(payload.owner?.imageUrl || payload.doc?.imageUrl)) {
    return uploadFromBrowser(file, `brand_owners/${ownerId}/main.jpg`);
  }
  const imgUrl = payload.owner?.imageUrl || payload.doc?.imageUrl;
  return {
    downloadUrl: imgUrl,
    storagePath: payload.owner?.storagePath || payload.doc?.storagePath || `brand_owners/${ownerId}/main.jpg`,
    fileName: file.name,
    contentType: file.type,
    fileSize: file.size,
  };
}
