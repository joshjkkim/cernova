'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';

export default function ResetPasswordPage() {
  const router = useRouter();
  const [ready, setReady]           = useState(false);
  const [password, setPassword]     = useState('');
  const [confirm, setConfirm]       = useState('');
  const [msg, setMsg]               = useState<{ ok: boolean; text: string } | null>(null);
  const [loading, setLoading]       = useState(false);

  useEffect(() => {
    // Supabase fires SIGNED_IN with type RECOVERY when the email link is followed
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'PASSWORD_RECOVERY') setReady(true);
    });
    // Also check if already in a recovery session
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) setReady(true);
    });
    return () => subscription.unsubscribe();
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setMsg(null);
    if (password !== confirm) {
      setMsg({ ok: false, text: 'Passwords do not match.' });
      return;
    }
    if (password.length < 6) {
      setMsg({ ok: false, text: 'Password must be at least 6 characters.' });
      return;
    }
    setLoading(true);
    const { error } = await supabase.auth.updateUser({ password });
    setLoading(false);
    if (error) {
      setMsg({ ok: false, text: error.message });
    } else {
      setMsg({ ok: true, text: 'Password updated! Redirecting…' });
      setTimeout(() => router.replace('/dashboard'), 1500);
    }
  }

  return (
    <main className="min-h-screen bg-gray-950 text-gray-100 flex items-center justify-center p-4">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <a href="/" className="text-2xl font-semibold tracking-tight text-white hover:opacity-80 transition-opacity">
            trace.ai
          </a>
          <p className="text-gray-400 text-sm mt-2">Set a new password</p>
        </div>

        <div className="bg-gray-900 border border-gray-800 rounded-xl p-8">
          {!ready ? (
            <p className="text-sm text-gray-500 text-center">Verifying reset link…</p>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-xs text-gray-400 mb-1.5">New password</label>
                <input
                  type="password"
                  required
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-gray-500"
                />
              </div>
              <div>
                <label className="block text-xs text-gray-400 mb-1.5">Confirm password</label>
                <input
                  type="password"
                  required
                  value={confirm}
                  onChange={e => setConfirm(e.target.value)}
                  placeholder="••••••••"
                  className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-gray-500"
                />
              </div>
              {msg && (
                <p className={`text-xs ${msg.ok ? 'text-green-400' : 'text-red-400'}`}>{msg.text}</p>
              )}
              <button
                type="submit"
                disabled={loading}
                className="w-full bg-white text-gray-950 rounded-lg py-2 text-sm font-medium hover:bg-gray-100 disabled:opacity-50 transition-colors"
              >
                {loading ? 'Saving…' : 'Set new password'}
              </button>
            </form>
          )}
        </div>
      </div>
    </main>
  );
}
