import { useEffect, useState } from 'react';
import type { User } from 'firebase/auth';
import { listenAuth, logOut } from './lib/firebase';
import AuthGate from './components/AuthGate';
import LiveStudio from './components/LiveStudio';

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [role, setRole] = useState<'signer' | 'speaker'>('signer');
  const [booting, setBooting] = useState(true);

  useEffect(() => {
    const unsub = listenAuth((u) => {
      setUser(u);
      setBooting(false);
    });
    return unsub;
  }, []);

  if (booting) {
    return (
      <div className="min-h-screen flex items-center justify-center text-slate-500 font-semibold">
        Loading SignBridge…
      </div>
    );
  }

  if (!user) {
    return (
      <AuthGate
        onReady={(u, r) => {
          setUser(u);
          setRole(r);
        }}
      />
    );
  }

  return (
    <LiveStudio
      user={user}
      role={role}
      onLogout={async () => {
        try {
          await logOut();
        } catch {}
        setUser(null);
      }}
    />
  );
}
