import { supabase } from './supabase';

// fetch() that attaches the logged-in user's Supabase token, so the backend can
// verify the user and check project ownership. Use this for the dashboard's
// user-scoped endpoints (projects, calls, anomalies, usage, analyze). Endpoints
// authed with a project API key (contracts, feedback) keep their own header.
export async function authFetch(url: string, init: RequestInit = {}): Promise<Response> {
  const { data: { session } } = await supabase.auth.getSession();
  const headers = new Headers(init.headers);
  if (session?.access_token) headers.set('Authorization', `Bearer ${session.access_token}`);
  return fetch(url, { ...init, headers });
}
