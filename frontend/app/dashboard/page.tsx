'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import CallsFeed from '@/components/CallsFeed';

export default function Dashboard() {
  const router = useRouter();
  const [email, setEmail] = useState<string | null>(null);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!session) { router.replace('/'); return; }
      setEmail(session.user.email ?? null);
    });
  }, [router]);

  async function signOut() {
    await supabase.auth.signOut();
    router.replace('/');
  }

  return (
    <main className="min-h-screen bg-gray-950 text-gray-100 p-8">
      <div className="max-w-5xl mx-auto">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">trace.ai</h1>
            <p className="text-gray-400 text-sm mt-1">Live call feed — realtime from Supabase</p>
          </div>
          <div className="flex items-center gap-4">
            {email && <span className="text-gray-500 text-sm">{email}</span>}
            <button
              onClick={signOut}
              className="text-sm text-gray-400 hover:text-white transition-colors"
            >
              Sign out
            </button>
          </div>
        </div>
        <CallsFeed />
      </div>
    </main>
  );
}
