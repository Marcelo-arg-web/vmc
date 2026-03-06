import { Storage } from "./app.js";

// Firebase v12 modular (CDN)
import { initializeApp } from "https://www.gstatic.com/firebasejs/12.10.0/firebase-app.js";
import { getAuth, onAuthStateChanged, signInWithEmailAndPassword, signOut } from "https://www.gstatic.com/firebasejs/12.10.0/firebase-auth.js";
// Configuración por defecto (para que funcione sin pasar por Configuración)
export const DEFAULT_FIREBASE_CONFIG = {
  "apiKey": "AIzaSyDFyo49uQEhRHVTxK9LPmG1AcwgeIZYphk",
  "authDomain": "vmc2026-3b10b.firebaseapp.com",
  "projectId": "vmc2026-3b10b",
  "storageBucket": "vmc2026-3b10b.appspot.com",
  "messagingSenderId": "88307042345",
  "appId": "1:88307042345:web:3530ac98c4a6aaa3767438",
  "measurementId": "G-PY1EZJW2HE"
};

import { 
  getFirestore, doc, getDoc, setDoc, collection, getDocs, addDoc, updateDoc, deleteDoc, query, where, orderBy, limit
} from "https://www.gstatic.com/firebasejs/12.10.0/firebase-firestore.js";

export { doc, getDoc, setDoc, collection, getDocs, addDoc, updateDoc, deleteDoc, query, where, orderBy, limit };

let _app=null, _auth=null, _db=null;
let _initPromise=null;

export function getFirebaseConfig(){
  return Storage.get("firebaseConfig", DEFAULT_FIREBASE_CONFIG);
}

export function initFirebase(){
  const cfg = getFirebaseConfig();
  if(!cfg) throw new Error("Falta configuración de Firebase (revisá Configuración o el config por defecto).");
  _app = initializeApp(cfg);
  _auth = getAuth(_app);
  _db = getFirestore(_app);
  return { app:_app, auth:_auth, db:_db };
}

export function auth(){ return _auth; }
export function db(){ return _db; }

export async function ensureInit(){
  if(_app && _auth && _db) return { app:_app, auth:_auth, db:_db };
  if(_initPromise) return _initPromise;
  _initPromise = Promise.resolve().then(()=>{
    initFirebase();
    return { app:_app, auth:_auth, db:_db };
  }).finally(()=>{ _initPromise=null; });
  return _initPromise;
}

export async function login(email, password){
  await ensureInit();
  return signInWithEmailAndPassword(_auth, email, password);
}

export async function logout(){
  await ensureInit();
  return signOut(_auth);
}

export function watchAuth(cb){
  return ensureInit().then(()=> onAuthStateChanged(_auth, cb));
}
