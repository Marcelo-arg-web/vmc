import { ensureInit, db, collection, getDocs, addDoc, doc, getDoc, setDoc, updateDoc, deleteDoc, query, where, orderBy, limit } from "./firebase.js";
import { normalizeName, markSaved, markUnsaved } from "./app.js";

export async function loadPeople(){
  await ensureInit();
  const snap = await getDocs(collection(db(), "personas"));
  const people = [];
  snap.forEach(d => people.push({ id:d.id, ...d.data() }));
  people.sort((a,b)=>(a.name||"").localeCompare(b.name||"", "es"));
  return people;
}

export async function savePerson(person){
  await ensureInit();
  const payload = {
    name: normalizeName(person.name),
    sex: person.sex || "",
    role: person.role || "",
    student: !!person.student,
    active: person.active !== false,
    approved: !!person.approved,
    spouseOnly: !!person.spouseOnly,
    can: {
      presidir: !!person?.can?.presidir,
      oracion: !!person?.can?.oracion,
      tesoros: !!person?.can?.tesoros,
      perlas: !!person?.can?.perlas,
      lecturaBiblia: !!person?.can?.lecturaBiblia,
      vidaCristiana: !!person?.can?.vidaCristiana,
      ebcConductor: !!person?.can?.ebcConductor,
      ebcLector: !!person?.can?.ebcLector,
      discursoEstudiante: !!person?.can?.discursoEstudiante,
      expliqueDiscurso: !!person?.can?.expliqueDiscurso,
      necesidades: !!person?.can?.necesidades,
    },
    notes: person.notes || "",
    updatedAt: new Date().toISOString(),
  };
  if (person.id) await updateDoc(doc(db(), "personas", person.id), payload);
  else await addDoc(collection(db(), "personas"), payload);
  markUnsaved("Se modificaron personas.");
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
  await setDoc(doc(db(), "semanas", weekISO), { ...weekData, weekISO, updatedAt: new Date().toISOString() }, { merge:true });
  markSaved();
}

export async function loadAssignments(weekISO){
  await ensureInit();
  const qy = query(collection(db(), "asignaciones"), where("weekISO", "==", weekISO));
  const snap = await getDocs(qy);
  const rows=[];
  snap.forEach(d=>rows.push({ id:d.id, ...d.data() }));
  rows.sort((a,b)=>(a.order||0)-(b.order||0));
  return rows;
}

export async function saveAssignments(weekISO, rows){
  await ensureInit();
  for (const r of rows){
    const id = `${weekISO}__${String(r.key || r.type || 'parte').replace(/[^a-z0-9]+/gi,'_')}`.slice(0,120);
    await setDoc(doc(db(), "asignaciones", id), { ...r, weekISO, updatedAt:new Date().toISOString() }, { merge:true });
  }
  markSaved();
}

export async function appendHistoryFromWeek(weekISO){
  await ensureInit();
  const asg = await loadAssignments(weekISO);
  const entries = [];
  for (const a of asg){
    if (a.person1Id) entries.push({ weekISO, partType:a.type, personId:a.person1Id, personName:a.person1Name||"", role:"1", title:a.title||"", createdAt:new Date().toISOString() });
    if (a.person2Id) entries.push({ weekISO, partType:`${a.type} / ayudante`, personId:a.person2Id, personName:a.person2Name||"", role:"2", title:a.title||"", createdAt:new Date().toISOString() });
  }
  for (const e of entries){
    const id = `${weekISO}__${e.partType}__${e.personId}__${e.role}`.replace(/[^a-z0-9_]+/gi,'_').slice(0,160);
    await setDoc(doc(db(), "historial", id), e, { merge:true });
  }
}

export async function loadRecentHistory(limitN=500){
  await ensureInit();
  const qy = query(collection(db(), "historial"), orderBy("createdAt","desc"), limit(limitN));
  const snap = await getDocs(qy);
  const rows=[];
  snap.forEach(d=>rows.push({ id:d.id, ...d.data() }));
  return rows;
}
