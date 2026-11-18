import { initializeApp } from 'firebase/app';
import {
  getAuth,
  GoogleAuthProvider,
  signInWithPopup,
  signOut,
  onAuthStateChanged,
  type User,
} from 'firebase/auth';
import {
  getFirestore,
  doc,
  setDoc,
  getDoc,
  serverTimestamp,
} from 'firebase/firestore';
import config from '../../firebase-applet-config.json';

const firebaseConfig = {
  apiKey: config.apiKey,
  authDomain: config.authDomain,
  projectId: config.projectId,
  storageBucket: config.storageBucket,
  messagingSenderId: config.messagingSenderId,
  appId: config.appId,
};

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app, (config as any).firestoreDatabaseId || undefined);

const provider = new GoogleAuthProvider();

export async function signInWithGoogle() {
  const result = await signInWithPopup(auth, provider);
  return result.user;
}

export async function logOut() {
  await signOut(auth);
}

export function listenAuth(cb: (user: User | null) => void) {
  return onAuthStateChanged(auth, cb);
}

export async function ensureUserProfile(user: User, preferredRole: 'signer' | 'speaker' = 'signer') {
  try {
    const ref = doc(db, 'users', user.uid);
    const snap = await getDoc(ref);
    if (!snap.exists()) {
      await setDoc(ref, {
        uid: user.uid,
        displayName: user.displayName || 'User',
        preferredRole,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    }
    const privRef = doc(db, 'users', user.uid, 'private', 'info');
    const privSnap = await getDoc(privRef);
    if (!privSnap.exists()) {
      await setDoc(privRef, {
        uid: user.uid,
        email: user.email || '',
        photoUrl: user.photoURL || '',
        updatedAt: serverTimestamp(),
      });
    }
    return snap.data() || { preferredRole };
  } catch (e) {
    console.warn('Profile sync skipped (rules/network):', e);
    return { preferredRole };
  }
}
