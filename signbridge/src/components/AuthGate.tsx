import { useState } from 'react';
import type { User } from 'firebase/auth';
import { signInWithGoogle, ensureUserProfile } from '../lib/firebase';
import BrandLogo from './BrandLogo';

type Props = {
  onReady: (user: User, role: 'signer' | 'speaker') => void;
};

export default function AuthGate({ onReady }: Props) {
  const [loading, setLoading] = useState(false);
  const [role, setRole] = useState<'signer' | 'speaker'>('signer');
  const [err, setErr] = useState<string | null>(null);

  async function handleSignIn() {
    setLoading(true);
    setErr(null);
    try {
      const user = await signInWithGoogle();
      await ensureUserProfile(user, role);
      onReady(user, role);
    } catch (e: any) {
      console.error(e);
      setErr(e?.message || 'Sign-in failed. Allow popups and check Firebase config.');
    } finally {
      setLoading(false);
    }
  }

  // Demo mode without Google (for local testing when Firebase auth domain not set)
  function handleDemo() {
    const demoUser = {
      uid: 'demo-local-user',
      displayName: 'Demo User',
      email: 'demo@local.dev',
      photoURL: null,
    } as unknown as User;
    onReady(demoUser, role);
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-6">
      <div className="glass-card max-w-md w-full p-8 text-center space-y-6">
        <div className="flex justify-center">
          <BrandLogo size={64} />
        </div>
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight">SignBridge</h1>
          <p className="text-sm text-slate-500 mt-1">Two-way sign language & voice bridge</p>
        </div>

        <div className="flex gap-2 p-1 rounded-full bg-slate-100">
          <button
            type="button"
            onClick={() => setRole('signer')}
            className={`flex-1 py-2.5 rounded-full text-sm font-bold transition ${
              role === 'signer' ? 'bg-white shadow text-sky-700' : 'text-slate-500'
            }`}
          >
            I am Signer
          </button>
          <button
            type="button"
            onClick={() => setRole('speaker')}
            className={`flex-1 py-2.5 rounded-full text-sm font-bold transition ${
              role === 'speaker' ? 'bg-white shadow text-sky-700' : 'text-slate-500'
            }`}
          >
            I am Listener
          </button>
        </div>

        {err && <p className="text-sm text-red-600 bg-red-50 rounded-xl p-3 text-left">{err}</p>}

        <button className="cta w-full" onClick={handleSignIn} disabled={loading}>
          {loading ? 'Signing in…' : 'Continue with Google'}
        </button>

        <button
          type="button"
          onClick={handleDemo}
          className="w-full py-3 rounded-xl border border-slate-200 font-semibold text-sm text-slate-600 hover:bg-slate-50"
        >
          Continue as Demo (no Google)
        </button>

        <p className="text-xs text-slate-400">
          Camera & microphone permissions are required for live translation.
        </p>
      </div>
    </div>
  );
}
