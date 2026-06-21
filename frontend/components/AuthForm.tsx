'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';

type Mode = 'signin' | 'signup' | 'forgot';

function extractMessage(err: unknown): string {
  if (typeof err === 'string') return err;
  if (err && typeof err === 'object') {
    const e = err as Record<string, unknown>;
    if (typeof e.message === 'string' && e.message) return e.message;
    if (typeof e.error_description === 'string') return e.error_description;
    if (typeof e.error === 'string') return e.error;
    return JSON.stringify(err);
  }
  return 'Something went wrong';
}

export default function AuthForm() {
  const router = useRouter();
  const [mode, setMode]         = useState<Mode>('signin');
  const [email, setEmail]       = useState('');
  const [password, setPassword] = useState('');
  const [error, setError]       = useState<string | null>(null);
  const [info, setInfo]         = useState<string | null>(null);
  const [loading, setLoading]   = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setInfo(null);
    setLoading(true);

    try {
      if (mode === 'forgot') {
        const origin = typeof window !== 'undefined' ? window.location.origin : '';
        const { error: resetError } = await supabase.auth.resetPasswordForEmail(email, {
          redirectTo: `${origin}/reset-password`,
        });
        if (resetError) throw resetError;
        setInfo('Check your email for a reset link. Note: Supabase limits 2 reset emails per hour.');
      } else if (mode === 'signup') {
        const { error: signUpError } = await supabase.auth.signUp({ email, password });
        if (signUpError) throw signUpError;
        router.push('/dashboard');
      } else {
        const { error: signInError } = await supabase.auth.signInWithPassword({ email, password });
        if (signInError) throw signInError;
        router.push('/dashboard');
      }
    } catch (err: unknown) {
      setError(extractMessage(err));
    } finally {
      setLoading(false);
    }
  }

  if (mode === 'forgot') {
    return (
      <div className="bg-gray-900 border border-gray-800 rounded-xl p-8">
        <div className="mb-6">
          <h2 className="text-sm font-semibold text-gray-200">Reset password</h2>
          <p className="text-xs text-gray-500 mt-1">
            Enter your email and we&apos;ll send a reset link.
          </p>
        </div>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs text-gray-400 mb-1.5">Email</label>
            <input
              type="email"
              required
              value={email}
              onChange={e => setEmail(e.target.value)}
              placeholder="you@example.com"
              className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-gray-500"
            />
          </div>
          {error && <p className="text-red-400 text-xs">{error}</p>}
          {info  && <p className="text-green-400 text-xs">{info}</p>}
          <button
            type="submit"
            disabled={loading}
            className="w-full bg-white text-gray-950 rounded-lg py-2 text-sm font-medium hover:bg-gray-100 disabled:opacity-50 transition-colors"
          >
            {loading ? 'Sending…' : 'Send reset link'}
          </button>
        </form>
        <button
          onClick={() => { setMode('signin'); setError(null); setInfo(null); }}
          className="mt-4 text-xs text-gray-500 hover:text-gray-300 transition-colors"
        >
          ← Back to sign in
        </button>
      </div>
    );
  }

  return (
    <div className="bg-gray-900 border border-gray-800 rounded-xl p-8">
      <div className="flex gap-1 mb-8 bg-gray-800 rounded-lg p-1">
        {(['signin', 'signup'] as ('signin' | 'signup')[]).map((m) => (
          <button
            key={m}
            onClick={() => { setMode(m); setError(null); setInfo(null); }}
            className={[
              'flex-1 py-1.5 text-sm rounded-md font-medium transition-colors',
              mode === m ? 'bg-gray-700 text-white' : 'text-gray-400 hover:text-gray-200',
            ].join(' ')}
          >
            {m === 'signin' ? 'Sign in' : 'Sign up'}
          </button>
        ))}
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="block text-xs text-gray-400 mb-1.5">Email</label>
          <input
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com"
            className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-gray-500"
          />
        </div>

        <div>
          <div className="flex items-center justify-between mb-1.5">
            <label className="text-xs text-gray-400">Password</label>
            {mode === 'signin' && (
              <button
                type="button"
                onClick={() => { setMode('forgot'); setError(null); setInfo(null); }}
                className="text-xs text-gray-500 hover:text-gray-300 transition-colors"
              >
                Forgot password?
              </button>
            )}
          </div>
          <input
            type="password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="••••••••"
            className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-gray-500"
          />
        </div>

        {error && <p className="text-red-400 text-xs">{error}</p>}

        <button
          type="submit"
          disabled={loading}
          className="w-full bg-white text-gray-950 rounded-lg py-2 text-sm font-medium hover:bg-gray-100 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          {loading ? 'Loading…' : mode === 'signin' ? 'Sign in' : 'Create account'}
        </button>
      </form>
    </div>
  );
}
