import { Storage } from "./app.js";

// Firebase v12 modular (CDN)
import { initializeApp } from "https://www.gstatic.com/firebasejs/12.10.0/firebase-app.js";
import {
  getAuth,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signOut,
  createUserWithEmailAndPassword,
  sendPasswordResetEmail,
  updatePassword,
  EmailAuthProvider,
  reauthenticateWithCredential
} from "https://www.gstatic.com/firebasejs/12.10.0/firebase-auth.js";
import {
  getFirestore, doc, getDoc, setDoc, collection, getDocs, addDoc, updateDoc, deleteDoc, query, where, orderBy, limit
} from "https://www.gstatic.com/firebasejs/12.10.0/firebase-firestore.js";

export { doc, getDoc, setDoc, collection, getDocs, addDoc, updateDoc, deleteDoc, query, where, orderBy, limit };

// Configuración por defecto para el proyecto de esta congregación.
export const DEFAULT_FIREBASE_CONFIG = {
  "apiKey": "AIzaSyA1tBiM44K3Pjpmxf10Q2ctDGbT2PAj7dE",
  "authDomain": "rvmc-c28b6.firebaseapp.com",
  "projectId": "rvmc-c28b6",
  "storageBucket": "rvmc-c28b6.firebasestorage.app",
  "messagingSenderId": "284750418406",
  "appId": "1:284750418406:web:d7117e27d903f6928dc627",
  "measurementId": "G-F06TM7DHWG"
};

let _app=null, _auth=null, _db=null;
let _initPromise=null;
let _authReadyPromise=null;

export function getFirebaseConfig(){
  const local = Storage.get("firebaseConfig", null);
  if(local && local.projectId === DEFAULT_FIREBASE_CONFIG.projectId && local.apiKey){
    return local;
  }
  // Evita que el navegador arrastre una configuración vieja de otro proyecto.
  if(local && local.projectId && local.projectId !== DEFAULT_FIREBASE_CONFIG.projectId){
    Storage.del("firebaseConfig");
  }
  return DEFAULT_FIREBASE_CONFIG;
}

export function firebaseProjectId(){
  return getFirebaseConfig()?.projectId || "";
}

export function initFirebase(){
  if(_app && _auth && _db) return { app:_app, auth:_auth, db:_db };
  const cfg = getFirebaseConfig();
  if(!cfg) throw new Error("Falta configuración de Firebase.");
  _app = initializeApp(cfg);
  _auth = getAuth(_app);
  _db = getFirestore(_app);
  return { app:_app, auth:_auth, db:_db };
}

export function auth(){ return _auth; }
export function db(){ return _db; }
export function currentUser(){ return _auth?.currentUser || null; }

export async function ensureInit(){
  if(_app && _auth && _db) return { app:_app, auth:_auth, db:_db };
  if(_initPromise) return _initPromise;
  _initPromise = Promise.resolve().then(()=>{
    initFirebase();
    return { app:_app, auth:_auth, db:_db };
  }).finally(()=>{ _initPromise=null; });
  return _initPromise;
}

export async function waitForAuthReady(){
  await ensureInit();
  if(_auth.currentUser) return _auth.currentUser;
  if(_authReadyPromise) return _authReadyPromise;
  _authReadyPromise = new Promise(resolve=>{
    const unsubscribe = onAuthStateChanged(_auth, user=>{
      unsubscribe();
      resolve(user || null);
    }, ()=>{
      unsubscribe();
      resolve(null);
    });
  }).finally(()=>{ _authReadyPromise=null; });
  return _authReadyPromise;
}

export async function requireSignedIn(redirect=true){
  const user = await waitForAuthReady();
  if(user) return user;
  if(redirect){
    const current = location.pathname.split('/').pop() || 'index.html';
    const qs = location.search || '';
    const hash = location.hash || '';
    const next = encodeURIComponent(current + qs + hash);
    location.replace(`login.html?next=${next}`);
  }
  throw new Error("Necesitás iniciar sesión para usar esta sección.");
}

export async function login(email, password){
  await ensureInit();
  return signInWithEmailAndPassword(_auth, email, password);
}

export async function registerUser(email, password){
  await ensureInit();
  return createUserWithEmailAndPassword(_auth, email, password);
}

export async function sendResetPassword(email){
  await ensureInit();
  return sendPasswordResetEmail(_auth, email);
}

export async function changePassword(currentPassword, newPassword){
  const user = await requireSignedIn(false);
  if(!user.email) throw new Error("Este usuario no tiene correo asociado.");
  const credential = EmailAuthProvider.credential(user.email, currentPassword);
  await reauthenticateWithCredential(user, credential);
  await updatePassword(user, newPassword);
}

export async function logout(){
  await ensureInit();
  return signOut(_auth);
}

export function watchAuth(cb){
  return ensureInit().then(()=> onAuthStateChanged(_auth, cb));
}
