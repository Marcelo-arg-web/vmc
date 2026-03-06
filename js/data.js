import { ensureInit, db, collection, getDocs, addDoc, doc, getDoc, setDoc, updateDoc, deleteDoc, query, where, orderBy, limit } from "./firebase.js";
import { normalizeName, markSaved, markUnsaved, slugify } from "./app.js";

function compareNameKey(s){
  return normalizeName(s).toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
}

export async function loadPeople(){
  await ensureInit();
  const snap = await getDocs(collection(db(), "personas"));
  const people = [];
  snap.forEach(d=>people.push({ id:d.id, ...d.data() }));
  people.sort((a,b)=>(a.name||"").localeCompare(b.name||"", "es"));
  return people;
}

export async function savePerson(person){
  await ensureInit();
  const normalized = normalizeName(person.name);
  const payload = {
    name: normalized,
    sex: person.sex || "",
    role: person.role || "",
    student: !!person.student,
    active: person.active !== false,
    approved: !!person.approved,
    spouseOnly: !!person.spouseOnly,
    familyGroup: normalizeName(person.familyGroup || ""),
    can: person.can || {},
    notes: person.notes || "",
    updatedAt: new Date().toISOString()
  };

  const people = await loadPeople();
  const existing = people.find(p => compareNameKey(p.name) === compareNameKey(normalized));
  if(person.id){
    if(existing && existing.id !== person.id) throw new Error("Ya existe una persona con ese nombre y apellido.");
    await updateDoc(doc(db(), "personas", person.id), payload);
    markUnsaved("Se modificaron personas.");
    return person.id;
  }
  if(existing){
    await updateDoc(doc(db(), "personas", existing.id), payload);
    markUnsaved("Se modificaron personas.");
    return existing.id;
  }
  const ref = await addDoc(collection(db(), "personas"), payload);
  markUnsaved("Se modificaron personas.");
  return ref.id;
}

export async function deletePerson(personId){
  await ensureInit();
  await deleteDoc(doc(db(), "personas", personId));
  markUnsaved("Se eliminó una persona.");
}

export async function loadWeek(weekISO){
  await ensureInit();
  const d = await getDoc(doc(db(), "semanas", weekISO));
  return d.exists() ? d.data() : null;
}

export async function saveWeek(weekISO, weekData){
  await ensureInit();
  await setDoc(doc(db(), "semanas", weekISO), {
    ...weekData,
    weekISO,
    updatedAt: new Date().toISOString()
  }, { merge:true });
  markSaved();
}

export async function loadAssignments(weekISO){
  await ensureInit();
  const q = query(collection(db(), "asignaciones"), where("weekISO","==",weekISO));
  const snap = await getDocs(q);
  const rows=[];
  snap.forEach(d=>rows.push({ id:d.id, ...d.data() }));
  rows.sort((a,b)=>(a.order||0)-(b.order||0));
  return rows;
}

export async function saveAssignments(weekISO, rows){
  await ensureInit();
  const existing = await loadAssignments(weekISO);
  const keepIds = new Set();
  for(const r of rows){
    const id = `${weekISO}__${slugify(String(r.key||r.type||r.title||"fila"))}`.slice(0,120);
    keepIds.add(id);
    await setDoc(doc(db(), "asignaciones", id), {
      ...r,
      weekISO,
      updatedAt: new Date().toISOString()
    }, { merge:true });
  }
  for(const old of existing){
    if(!keepIds.has(old.id)) await deleteDoc(doc(db(), "asignaciones", old.id));
  }
  markSaved();
}

export async function appendHistoryFromWeek(weekISO){
  await ensureInit();
  const asg = await loadAssignments(weekISO);
  const entries = [];
  for(const a of asg){
    if(a.person1Id){
      entries.push({ weekISO, partType:a.type, personId:a.person1Id, personName:a.person1Name||"", role:"1", title:a.title||"", createdAt:new Date().toISOString() });
    }
    if(a.person2Id){
      entries.push({ weekISO, partType:a.type, personId:a.person2Id, personName:a.person2Name||"", role:"2", title:a.title||"", createdAt:new Date().toISOString() });
    }
  }
  for(const e of entries){
    const id = `${weekISO}__${slugify(e.partType)}__${e.personId}__${e.role}`.slice(0,160);
    await setDoc(doc(db(), "historial", id), e, { merge:true });
  }
}

export async function loadRecentHistory(limitN=1000){
  await ensureInit();
  try{
    const q = query(collection(db(), "historial"), orderBy("createdAt","desc"), limit(limitN));
    const snap = await getDocs(q);
    const rows=[];
    snap.forEach(d=>rows.push({ id:d.id, ...d.data() }));
    return rows;
  }catch(e){
    const snap = await getDocs(collection(db(), "historial"));
    const rows=[];
    snap.forEach(d=>rows.push({ id:d.id, ...d.data() }));
    rows.sort((a,b)=>(b.createdAt||"").localeCompare(a.createdAt||""));
    return rows.slice(0, limitN);
  }
}

export async function loadAppSettings(){
  await ensureInit();
  const d = await getDoc(doc(db(), "config", "app"));
  return d.exists() ? d.data() : {};
}

export async function saveAppSettings(data){
  await ensureInit();
  await setDoc(doc(db(), "config", "app"), {
    ...data,
    updatedAt: new Date().toISOString()
  }, { merge:true });
}
