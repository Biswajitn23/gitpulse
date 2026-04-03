import { initializeApp } from 'firebase/app';
import { getAuth, GithubAuthProvider } from 'firebase/auth';

function sanitize(value) {
  const normalized = (value || '').trim();
  if (!normalized) {
    return '';
  }

  return /your_|placeholder|example/i.test(normalized) ? '' : normalized;
}

const firebaseConfig = {
  apiKey: sanitize(import.meta.env.VITE_FIREBASE_API_KEY),
  authDomain: sanitize(import.meta.env.VITE_FIREBASE_AUTH_DOMAIN),
  projectId: sanitize(import.meta.env.VITE_FIREBASE_PROJECT_ID),
  appId: sanitize(import.meta.env.VITE_FIREBASE_APP_ID),
};

const hasRequiredConfig = Object.values(firebaseConfig).every(Boolean);

let firebaseApp = null;
let firebaseAuth = null;

if (hasRequiredConfig) {
  firebaseApp = initializeApp(firebaseConfig);
  firebaseAuth = getAuth(firebaseApp);
}

export function getFirebaseAuth() {
  if (!firebaseAuth) {
    throw new Error('Missing Firebase config. Set VITE_FIREBASE_* values in your environment.');
  }

  return firebaseAuth;
}

export function createGithubProvider() {
  const provider = new GithubAuthProvider();
  provider.setCustomParameters({ prompt: 'select_account' });
  provider.addScope('read:user');
  provider.addScope('user:email');
  provider.addScope('repo');
  return provider;
}
