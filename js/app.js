export const APP = {
  name: "Planificador VMC",
  version: "2.1.0"
};

export const Storage = {
  get(key, fallback=null){
    try{
      const v = localStorage.getItem(key);
      return v ? JSON.parse(v) : fallback;
    }catch(e){ return fallback; }
  },
  set(key, value){ localStorage.setItem(key, JSON.stringify(value)); },
  del(key){ localStorage.removeItem(key); }
};

export function qs(sel, root=document){ return root.querySelector(sel); }
export function qsa(sel, root=document){ return Array.from(root.querySelectorAll(sel)); }

export function todayISO(){
  const d = new Date();
  const tz = new Date(d.getTime() - d.getTimezoneOffset()*60000);
  return tz.toISOString().slice(0,10);
}

export function fmtDateAR(iso){
  if(!iso) return "";
  const [y,m,dd] = iso.split("-").map(Number);
  const d = new Date(y, m-1, dd);
  return d.toLocaleDateString("es-AR", { weekday:"long", year:"numeric", month:"long", day:"numeric" });
}

export function dayNameFromISO(iso){
  if(!iso) return "";
  const [y,m,dd] = iso.split("-").map(Number);
  return new Date(y,m-1,dd).toLocaleDateString("es-AR", { weekday:"long" });
}

export function normalizeName(s){
  return (s||"").trim().replace(/\s+/g," ");
}

export function slugify(s){
  return (s||"").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g,"").replace(/[^a-z0-9]+/g,"_").replace(/^_|_$/g,"");
}

export function debounce(fn, ms=250){
  let t;
  return (...args)=>{ clearTimeout(t); t=setTimeout(()=>fn(...args), ms); };
}

export function setActiveNav(pathname){
  qsa(".navlinks a").forEach(a=>{
    if(a.getAttribute("href") === pathname) a.classList.add("active");
  });
}

export function requireSavedGuard(){
  const ctrl = Storage.get("control", {saved:true});
  return !!ctrl.saved;
}

export function markUnsaved(reason=""){
  const ctrl = Storage.get("control", {saved:true});
  ctrl.saved = false;
  ctrl.lastEdit = new Date().toISOString();
  ctrl.reason = reason;
  Storage.set("control", ctrl);
  window.dispatchEvent(new Event("control-changed"));
}

export function markSaved(){
  const ctrl = Storage.get("control", {saved:false});
  ctrl.saved = true;
  ctrl.lastSave = new Date().toISOString();
  Storage.set("control", ctrl);
  window.dispatchEvent(new Event("control-changed"));
}

export function weeksBetween(aISO, bISO){
  if(!aISO || !bISO) return 999;
  const a = new Date(aISO+"T00:00:00");
  const b = new Date(bISO+"T00:00:00");
  return Math.floor(Math.abs(b - a) / 604800000);
}
