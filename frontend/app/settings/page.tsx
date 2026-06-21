'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';

export default function SettingsPage() {
  const router = useRouter();
  const [email, setEmail]           = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirm, setConfirm]       = useState('');
  const [msg, setMsg]               = useState<{ ok: boolean; text: string } | null>(null);
  const [loading, setLoading]       = useState(false);
  const [checking, setChecking]     = useState(true);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!session) { router.replace('/login'); return; }
      setEmail(session.user.email ?? '');
      setChecking(false);
    });
  }, [router]);

  async function handleChangePassword(e: React.FormEvent) {
    e.preventDefault();
    setMsg(null);
    if (newPassword !== confirm) {
      setMsg({ ok: false, text: 'Passwords do not match.' });
      return;
    }
    if (newPassword.length < 6) {
      setMsg({ ok: false, text: 'Password must be at least 6 characters.' });
      return;
    }
    setLoading(true);
    const { error } = await supabase.auth.updateUser({ password: newPassword });
    setLoading(false);
    if (error) {
      setMsg({ ok: false, text: error.message });
    } else {
      setMsg({ ok: true, text: 'Password updated.' });
      setNewPassword('');
      setConfirm('');
    }
  }

  async function signOut() {
    await supabase.auth.signOut();
    router.replace('/login');
  }

  if (checking) {
    return (
      <main className="min-h-screen bg-gray-950 text-gray-100 flex items-center justify-center">
        <p className="text-gray-600 text-sm">Loading…</p>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-gray-950 text-gray-100">
      {/* Nav */}
      <div className="border-b border-gray-800 px-4 sm:px-6 py-4">
        <div className="max-w-xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3 text-sm">
            <a href="/dashboard" className="text-gray-500 hover:text-gray-300 transition-colors">Dashboard</a>
            <span className="text-gray-700">/</span>
            <span className="text-gray-100 font-medium">Account settings</span>
          </div>
        </div>
      </div>

      <div className="max-w-xl mx-auto px-4 sm:px-6 py-10 space-y-6">

        {/* Account info */}
        <div className="border border-gray-800 rounded-xl p-5 space-y-3">
          <h2 className="text-sm font-semibold text-gray-300">Account</h2>
          <div>
            <p className="text-xs text-gray-500 mb-1">Email</p>
            <p className="text-sm text-gray-200 font-mono">{email}</p>
          </div>
        </div>

        {/* Change password */}
        <div className="border border-gray-800 rounded-xl p-5">
          <h2 className="text-sm font-semibold text-gray-300 mb-4">Change password</h2>
          <p className="text-xs text-gray-600 mb-4">
            You&apos;re already signed in — no email required. Enter a new password and save.
          </p>
          <form onSubmit={handleChangePassword} className="space-y-3">
            <div>
              <label className="block text-xs text-gray-400 mb-1.5">New password</label>
              <input
                type="password"
                required
                value={newPassword}
                onChange={e => setNewPassword(e.target.value)}
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
              {loading ? 'Saving…' : 'Update password'}
            </button>
          </form>
        </div>

        {/* Sign out */}
        <div className="border border-gray-800 rounded-xl p-5">
          <h2 className="text-sm font-semibold text-gray-300 mb-1">Sign out</h2>
          <p className="text-xs text-gray-600 mb-4">Sign out of this device.</p>
          <button
            onClick={signOut}
            className="px-4 py-2 text-sm rounded-lg border border-gray-700 text-gray-300 hover:border-gray-500 hover:text-white transition-colors"
          >
            Sign out
          </button>
        </div>

      </div>
    </main>
  );
}
