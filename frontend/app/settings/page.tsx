'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';

const inputCls = 'w-full bg-[#201a2b] border border-[#3a2f4e] px-3 py-2.5 font-mono text-xs text-[#c9c2d6] placeholder-[#7c7291] focus:outline-none focus:border-[#4a3d63]';

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
    if (newPassword !== confirm) { setMsg({ ok: false, text: 'Passwords do not match.' }); return; }
    if (newPassword.length < 6)  { setMsg({ ok: false, text: 'Password must be at least 6 characters.' }); return; }
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
      <main className="min-h-screen bg-[#201a2b] text-[#e9e4f0] flex items-center justify-center">
        <p className="font-mono text-xs text-[#7c7291]">loading…</p>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[#201a2b] text-[#e9e4f0] antialiased">

      {/* Nav */}
      <div className="border-b border-[#3a2f4e]">
        <div className="max-w-xl mx-auto px-6 h-12 flex items-center gap-2 font-mono text-xs">
          <a href="/dashboard" className="text-[#9a91ad] hover:text-[#e9e4f0] transition-colors">dashboard</a>
          <span className="text-[#7c7291]">/</span>
          <span className="text-[#e9e4f0]">account settings</span>
        </div>
      </div>

      <div className="max-w-xl mx-auto px-6 py-10 space-y-0">

        {/* Account */}
        <div className="border border-[#3a2f4e] bg-[#281f38]">
          <div className="border-b border-[#3a2f4e] px-5 py-4">
            <h2 className="font-sans font-bold text-sm uppercase tracking-widest text-[#e9e4f0]">Account</h2>
          </div>
          <div className="px-5 py-4">
            <p className="font-mono text-[10px] text-[#7c7291] uppercase tracking-widest mb-1">Email</p>
            <p className="font-mono text-xs text-[#c9c2d6]">{email}</p>
          </div>
        </div>

        {/* Change password */}
        <div className="border border-t-0 border-[#3a2f4e] bg-[#281f38]">
          <div className="border-b border-[#3a2f4e] px-5 py-4">
            <h2 className="font-sans font-bold text-sm uppercase tracking-widest text-[#e9e4f0]">Change password</h2>
            <p className="font-mono text-[11px] text-[#9a91ad] mt-1">
              You&apos;re already signed in — no email required.
            </p>
          </div>
          <form onSubmit={handleChangePassword} className="px-5 py-5 space-y-4">
            <div>
              <label className="block font-mono text-[10px] text-[#7c7291] uppercase tracking-widest mb-1.5">New password</label>
              <input type="password" required value={newPassword} onChange={e => setNewPassword(e.target.value)} placeholder="••••••••" className={inputCls} />
            </div>
            <div>
              <label className="block font-mono text-[10px] text-[#7c7291] uppercase tracking-widest mb-1.5">Confirm password</label>
              <input type="password" required value={confirm} onChange={e => setConfirm(e.target.value)} placeholder="••••••••" className={inputCls} />
            </div>
            {msg && <p className={`font-mono text-[11px] ${msg.ok ? 'text-[#7fb59a]' : 'text-[#e0533d]'}`}>{msg.text}</p>}
            <button type="submit" disabled={loading} className="w-full bg-[#b794f4] text-[#201a2b] py-2.5 font-mono text-xs font-bold hover:bg-[#c9b0f8] disabled:opacity-50 transition-colors">
              {loading ? 'saving…' : 'update password'}
            </button>
          </form>
        </div>

        {/* Sign out */}
        <div className="border border-t-0 border-[#3a2f4e] bg-[#281f38]">
          <div className="border-b border-[#3a2f4e] px-5 py-4">
            <h2 className="font-sans font-bold text-sm uppercase tracking-widest text-[#e9e4f0]">Sign out</h2>
            <p className="font-mono text-[11px] text-[#9a91ad] mt-1">Sign out of this device.</p>
          </div>
          <div className="px-5 py-5">
            <button
              onClick={signOut}
              className="font-mono text-xs px-5 py-2.5 border border-[#3a2f4e] text-[#b3abc4] hover:border-[#4a3d63] hover:text-[#e9e4f0] transition-colors"
            >
              sign out
            </button>
          </div>
        </div>

      </div>
    </main>
  );
}
