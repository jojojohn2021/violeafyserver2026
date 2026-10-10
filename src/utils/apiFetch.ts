import { auth } from '../firebase';

/** Send same-origin API requests with the current Firebase identity token. */
export async function apiFetch(input: RequestInfo | URL, init: RequestInit = {}): Promise<Response> {
  const user = auth?.currentUser;
  const headers = new Headers(init.headers);

  if (user && !user.isAnonymous) {
    try {
      const token = await user.getIdToken();
      headers.set('Authorization', `Bearer ${token}`);
    } catch (tokenErr) {
      console.warn('[apiFetch] Could not get user ID token:', tokenErr);
    }
  }

  let response: Response;
  try {
    response = await fetch(input, { ...init, headers });
  } catch (netErr: any) {
    return new Response(
      JSON.stringify({
        success: false,
        error: netErr?.message || 'Network error connecting to API.',
      }),
      {
        status: 503,
        headers: { 'Content-Type': 'application/json' },
      }
    );
  }

  const contentType = response.headers.get('content-type') || '';
  if (contentType.includes('text/html')) {
    // When deployed to static Firebase Hosting, unhandled /api requests match the
    // SPA wildcard rewrite and return index.html (status 200). Intercept this
    // and return a JSON 404 so caller can gracefully take direct Firestore fallback
    // without throwing "SyntaxError: Unexpected token '<', '<!doctype '... is not valid JSON".
    const urlStr = typeof input === 'string' ? input : (input as any).url || 'API';
    return new Response(
      JSON.stringify({
        success: false,
        error: `Endpoint '${urlStr}' is not hosted on static deployment. Falling back to direct database.`,
      }),
      {
        status: 404,
        headers: { 'Content-Type': 'application/json' },
      }
    );
  }

  return response;
}
