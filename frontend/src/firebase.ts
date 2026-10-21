import { getApps, initializeApp, type FirebaseApp, type FirebaseOptions } from "firebase/app";
import { connectAuthEmulator, getAuth, type Auth } from "firebase/auth";
import { connectFirestoreEmulator, getFirestore, type Firestore } from "firebase/firestore";

const env = import.meta.env;
const emulatorMode = env.VITE_USE_FIREBASE_EMULATORS === "true";
const projectId = env.VITE_FIREBASE_PROJECT_ID || (emulatorMode ? "demo-presenze" : "");

export const firebaseConfig: FirebaseOptions = {
  apiKey: env.VITE_FIREBASE_API_KEY || (emulatorMode ? "demo-api-key" : ""),
  authDomain:
    env.VITE_FIREBASE_AUTH_DOMAIN ||
    (emulatorMode ? "demo-presenze.firebaseapp.com" : ""),
  projectId,
  storageBucket: env.VITE_FIREBASE_STORAGE_BUCKET || (emulatorMode ? "demo-presenze.appspot.com" : ""),
  messagingSenderId: env.VITE_FIREBASE_MESSAGING_SENDER_ID || (emulatorMode ? "123456789012" : ""),
  appId: env.VITE_FIREBASE_APP_ID || (emulatorMode ? "1:123456789012:web:presenze-demo" : ""),
};

export const isEmulatorMode = emulatorMode;
export const googleClientId = env.VITE_GOOGLE_CLIENT_ID || "";
export const isFirebaseConfigured = Boolean(
  firebaseConfig.apiKey && firebaseConfig.projectId && firebaseConfig.appId,
);
export const isGoogleConfigured = Boolean(googleClientId);

export const AUTH_EMULATOR_URL = "http://127.0.0.1:9099";
export const FIRESTORE_EMULATOR_HOST = "127.0.0.1";
export const FIRESTORE_EMULATOR_PORT = 8080;

let appInstance: FirebaseApp | null = null;
let authInstance: Auth | null = null;
let dbInstance: Firestore | null = null;

const runtime = globalThis as typeof globalThis & {
  __presenzeEmulatorsConnected?: boolean;
};

if (isFirebaseConfigured) {
  appInstance = getApps()[0] ?? initializeApp(firebaseConfig);
  authInstance = getAuth(appInstance);
  dbInstance = getFirestore(appInstance);

  if (emulatorMode && !runtime.__presenzeEmulatorsConnected) {
    connectAuthEmulator(authInstance, AUTH_EMULATOR_URL, { disableWarnings: true });
    connectFirestoreEmulator(dbInstance, FIRESTORE_EMULATOR_HOST, FIRESTORE_EMULATOR_PORT);
    runtime.__presenzeEmulatorsConnected = true;
  }
}

export const firebaseApp = appInstance;
export const auth = authInstance;
export const db = dbInstance;

export class FirebaseConfigError extends Error {
  constructor(message = "Firebase non configurato") {
    super(message);
    this.name = "FirebaseConfigError";
  }
}

export function requireDb(): Firestore {
  if (!db) throw new FirebaseConfigError();
  return db;
}

export function requireAuth(): Auth {
  if (!auth) throw new FirebaseConfigError();
  return auth;
}
