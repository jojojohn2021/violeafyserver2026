import { auth } from '../firebase';

/** Send same-origin API requests with the current Firebase identity token. */
export async function apiFetch(input: RequestInfo | URL, init: RequestInit = {}): Promise<Response> {
  const user = auth?.currentUser;
  if (!user || user.isAnonymous) {
    throw new Error('Please sign in before using the operations API.');
  }

  const token = await user.getIdToken();
  const headers = new Headers(init.headers);
  headers.set('Authorization', `Bearer ${token}`);
  return fetch(input, { ...init, headers });
}
