import { ensureInit, requireSignedIn, db, collection, getDocs, addDoc, doc, getDoc, setDoc, updateDoc, deleteDoc, query, where, orderBy, limit } from "./firebase.js";
import { normalizeName, markSaved, markUnsaved, slugify, weekStartISO, sameMeetingWeek } from "./app.js";

function compareNameKey(s){
  return normalizeName(s).toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
}

function cleanText(v){
  return v == null ? "" : String(v);
}

function cleanAssignmentRow(row={}, idx=0){
  const key = cleanText(row.key || row.assignmentKey || row.type || row.title || `fila_${idx+1}`);
  // Compatibilidad: builds anteriores guardaban el asignado principal como
  // personId/personName. La app actual usa person1Id/person1Name para poder
  // manejar también ayudantes sin romper el tablero ni datos viejos.
  const mainId = cleanText(row.person1Id || row.personId || row.assignedPersonId || row.assignedId);
  const mainName = cleanText(row.person1Name || row.personName || row.assignedPersonName || row.assignedName);
  const helperId = cleanText(row.person2Id || row.helperId || row.assistantId);
  const helperName = cleanText(row.person2Name || row.helperName || row.assistantName);
  return {
    order: Number(row.order || idx + 1),
    key,
    type: cleanText(row.type || row.partType),
    title: cleanText(row.title),
    section: cleanText(row.section),
    minutes: row.minutes == null ? "" : row.minutes,
    needsHelper: !!row.needsHelper,
    detail: cleanText(row.detail),
    number: cleanText(row.number),
    room: cleanText(row.room),
    isAuxRoom: row.isAuxRoom === true || String(key).endsWith("_sala_b"),
    person1Id: mainId,
    person1Name: mainName,
    person2Id: helperId,
    person2Name: helperName
  };
}

function cleanAssignmentRows(rows=[]){
  return (Array.isArray(rows) ? rows : [])
    .map((r, idx)=>cleanAssignmentRow(r, idx))
    .filter(r=>r.key || r.type || r.title);
}

function assignedCount(rows=[]){
  return rows.reduce((n, r)=> n + (r.person1Id || r.person1Name ? 1 : 0) + (r.person2Id || r.person2Name ? 1 : 0), 0);
}

export async function loadPeople(){
  await ensureInit();
  await requireSignedIn(true);
  const snap = await getDocs(collection(db(), "personas"));
  const people = [];
  snap.forEach(d=>people.push({ id:d.id, ...d.data() }));
  people.sort((a,b)=>(a.name||"").localeCompare(b.name||"", "es"));
  return people;
}

export async function savePerson(person){
  await ensureInit();
  await requireSignedIn(true);
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
  await requireSignedIn(true);
  await deleteDoc(doc(db(), "personas", personId));
  markUnsaved("Se eliminó una persona.");
}

async function getAllDocsFromCollection(name){
  const snap = await getDocs(collection(db(), name));
  const rows=[];
  snap.forEach(d=>rows.push({ ...d.data(), id:d.id, _docId:d.id }));
  return rows;
}

async function findWeekDocumentFor(weekISO){
  const targetStart = weekStartISO(weekISO);

  const exact = await getDoc(doc(db(), "semanas", weekISO));
  if(exact.exists()) return { id:exact.id, ...exact.data() };

  try{
    const q = query(collection(db(), "semanas"), where("weekStartISO", "==", targetStart), limit(20));
    const snap = await getDocs(q);
    const rows=[];
    snap.forEach(d=>rows.push({ ...d.data(), id:d.id, _docId:d.id }));
    if(rows.length){
      rows.sort((a,b)=>(b.updatedAt||"").localeCompare(a.updatedAt||""));
      return rows[0];
    }
  }catch(e){
    // Si la base todavía no tiene weekStartISO en documentos viejos, se usa el barrido compatible.
  }

  const all = await getAllDocsFromCollection("semanas");
  const matches = all.filter(r=>sameMeetingWeek(r.weekISO || r.meetingDateISO || r.id, weekISO));
  matches.sort((a,b)=>(b.updatedAt||"").localeCompare(a.updatedAt||""));
  return matches[0] || null;
}

function sortAssignments(rows){
  rows.sort((a,b)=>(a.order||0)-(b.order||0) || String(a.key||"").localeCompare(String(b.key||"")));
  return rows;
}

function getWeekEmbeddedAssignments(weekDoc){
  const rows = Array.isArray(weekDoc?.assignments) ? weekDoc.assignments : [];
  return sortAssignments(cleanAssignmentRows(rows));
}

function assignmentGroupKey(row, requestedWeekISO){
  return row.weekISO || row.meetingDateISO || String(row.id || "").split("__")[0] || requestedWeekISO;
}

function selectBestAssignmentGroup(rows, requestedWeekISO){
  if(!rows.length) return [];
  const exact = rows.filter(r=>assignmentGroupKey(r, requestedWeekISO) === requestedWeekISO);
  if(exact.length) return sortAssignments(exact);

  const groups = new Map();
  for(const r of rows){
    const k = assignmentGroupKey(r, requestedWeekISO);
    if(!groups.has(k)) groups.set(k, []);
    groups.get(k).push(r);
  }
  const ranked = Array.from(groups.entries()).map(([k, group])=>({
    k,
    group,
    latest: group.map(x=>x.updatedAt||"").sort().pop() || "",
    count: group.length
  }));
  ranked.sort((a,b)=>(b.latest||"").localeCompare(a.latest||"") || b.count-a.count);
  return sortAssignments(ranked[0]?.group || []);
}

async function loadAllAssignmentRowsForWeek(weekISO){
  const targetStart = weekStartISO(weekISO);
  const byId = new Map();
  const addRowsFromSnap = (snap)=>snap.forEach(d=>byId.set(d.id, { ...d.data(), id:d.id, _docId:d.id }));

  const qExact = query(collection(db(), "asignaciones"), where("weekISO","==",weekISO));
  addRowsFromSnap(await getDocs(qExact));

  try{
    const qStart = query(collection(db(), "asignaciones"), where("weekStartISO","==",targetStart));
    addRowsFromSnap(await getDocs(qStart));
  }catch(e){
    // Compatibilidad con bases viejas.
  }

  if(!byId.size){
    const all = await getAllDocsFromCollection("asignaciones");
    for(const r of all){
      if(sameMeetingWeek(assignmentGroupKey(r, weekISO), weekISO)) byId.set(r.id, r);
    }
  }
  return Array.from(byId.values());
}

export async function loadWeek(weekISO){
  await ensureInit();
  await requireSignedIn(true);
  return await findWeekDocumentFor(weekISO);
}

export async function saveWeek(weekISO, weekData){
  await ensureInit();
  await requireSignedIn(true);
  const existing = await findWeekDocumentFor(weekISO);
  const id = existing?.id || weekISO;
  await setDoc(doc(db(), "semanas", id), {
    ...weekData,
    weekISO,
    meetingDateISO: weekISO,
    weekStartISO: weekStartISO(weekISO),
    updatedAt: new Date().toISOString()
  }, { merge:true });
  markSaved();
}

export async function loadAssignments(weekISO){
  await ensureInit();
  await requireSignedIn(true);
  const collectionRows = selectBestAssignmentGroup(await loadAllAssignmentRowsForWeek(weekISO), weekISO);
  const weekDoc = await findWeekDocumentFor(weekISO);
  const embeddedRows = getWeekEmbeddedAssignments(weekDoc);

  // Refuerzo build 10210: si por reglas, datos viejos o un corte de conexión no aparecen
  // los documentos sueltos de asignaciones, se recuperan desde la misma semana guardada.
  if(!collectionRows.length) return embeddedRows;
  if(embeddedRows.length && assignedCount(embeddedRows) > assignedCount(collectionRows)) return embeddedRows;
  return sortAssignments(cleanAssignmentRows(collectionRows));
}

export async function saveAssignments(weekISO, rows){
  await ensureInit();
  await requireSignedIn(true);
  const cleanRows = cleanAssignmentRows(rows);
  const existing = await loadAllAssignmentRowsForWeek(weekISO);
  const keepIds = new Set();
  const startISO = weekStartISO(weekISO);
  const now = new Date().toISOString();

  // Guardado principal reforzado: además de la colección `asignaciones`,
  // se deja una copia dentro del documento de `semanas`. Así, al volver a elegir
  // la semana o al abrir el tablero, los asignados se recuperan aunque una consulta
  // a la colección separada falle o haya documentos antiguos con otra fecha de esa semana.
  const existingWeek = await findWeekDocumentFor(weekISO);
  const weekDocId = existingWeek?.id || weekISO;
  await setDoc(doc(db(), "semanas", weekDocId), {
    weekISO,
    meetingDateISO: weekISO,
    weekStartISO: startISO,
    assignments: cleanRows,
    updatedAt: now
  }, { merge:true });

  for(const r of cleanRows){
    const id = `${weekISO}__${slugify(String(r.key||r.type||r.title||"fila"))}`.slice(0,120);
    keepIds.add(id);
    const payload = {
      ...r,
      // Campos actuales usados por tablero/semana.
      person1Id: r.person1Id || "",
      person1Name: r.person1Name || "",
      person2Id: r.person2Id || "",
      person2Name: r.person2Name || "",
      // Campos de compatibilidad/lectura rápida en Firebase Console.
      personId: r.person1Id || "",
      personName: r.person1Name || "",
      helperId: r.person2Id || "",
      helperName: r.person2Name || "",
      weekISO,
      meetingDateISO: weekISO,
      weekStartISO: startISO,
      updatedAt: now
    };
    // Sobrescribe el documento de asignación para no arrastrar campos viejos
    // vacíos como personId/personName de builds anteriores.
    await setDoc(doc(db(), "asignaciones", id), payload);
  }
  for(const old of existing){
    const oldDocId = old._docId || old.id;
    if(oldDocId && !keepIds.has(oldDocId)) await deleteDoc(doc(db(), "asignaciones", oldDocId));
  }
  markSaved();
}


export async function clearAssignmentsForWeek(weekISO){
  await ensureInit();
  await requireSignedIn(true);
  const existing = await loadAllAssignmentRowsForWeek(weekISO);
  for(const old of existing){
    const oldDocId = old._docId || old.id;
    if(oldDocId) await deleteDoc(doc(db(), "asignaciones", oldDocId));
  }
  const existingWeek = await findWeekDocumentFor(weekISO);
  const weekDocId = existingWeek?.id || weekISO;
  await setDoc(doc(db(), "semanas", weekDocId), {
    weekISO,
    meetingDateISO: weekISO,
    weekStartISO: weekStartISO(weekISO),
    assignments: [],
    assignmentsClearedAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  }, { merge:true });
  markSaved();
}

export async function appendHistoryFromWeek(weekISO){
  await ensureInit();
  await requireSignedIn(true);
  const asg = await loadAssignments(weekISO);
  const entries = [];
  for(const a of asg){
    const base = { weekISO, partType:a.type, assignmentKey:a.key || "", room:a.room || "", title:a.title || "", createdAt:new Date().toISOString() };
    if(a.person1Id){
      entries.push({ ...base, personId:a.person1Id, personName:a.person1Name||"", role:"1" });
    }
    if(a.person2Id){
      entries.push({ ...base, personId:a.person2Id, personName:a.person2Name||"", role:"2" });
    }
  }
  for(const e of entries){
    const id = `${weekISO}__${slugify(e.assignmentKey || e.partType)}__${e.personId}__${e.role}`.slice(0,160);
    await setDoc(doc(db(), "historial", id), e, { merge:true });
  }
}

export async function loadRecentHistory(limitN=1000){
  await ensureInit();
  await requireSignedIn(true);
  try{
    const q = query(collection(db(), "historial"), orderBy("createdAt","desc"), limit(limitN));
    const snap = await getDocs(q);
    const rows=[];
    snap.forEach(d=>rows.push({ ...d.data(), id:d.id, _docId:d.id }));
    return rows;
  }catch(e){
    const snap = await getDocs(collection(db(), "historial"));
    const rows=[];
    snap.forEach(d=>rows.push({ ...d.data(), id:d.id, _docId:d.id }));
    rows.sort((a,b)=>(b.createdAt||"").localeCompare(a.createdAt||""));
    return rows.slice(0, limitN);
  }
}

export async function loadAppSettings(){
  await ensureInit();
  await requireSignedIn(true);
  const d = await getDoc(doc(db(), "config", "app"));
  return d.exists() ? d.data() : {};
}

export async function saveAppSettings(data){
  await ensureInit();
  await requireSignedIn(true);
  await setDoc(doc(db(), "config", "app"), {
    ...data,
    updatedAt: new Date().toISOString()
  }, { merge:true });
}

// ------------------------- Backup compatible Python/Web -------------------------
const EXCHANGE_MAGIC = "PlanificadorVMC_Exchange_v1";

function text(v){ return v == null ? "" : String(v).trim(); }
function norm(v){ return text(v).normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase(); }
function nameKey(v){ return norm(v).replace(/\s+/g, " "); }

function mapSexToWeb(v, role=""){
  const n = norm(v || role);
  if(["h", "hermano", "hombre", "masculino", "varon"].includes(n) || n.includes("anciano") || n.includes("siervo ministerial")) return "H";
  if(["m", "hermana", "mujer", "femenino", "publicadora"].includes(n)) return "M";
  return "";
}

function mapRoleToWeb(v, sex=""){
  const n = norm(v);
  if(n.includes("anciano")) return "Anciano";
  if(n.includes("siervo") && n.includes("ministerial")) return "Siervo Ministerial";
  if(n.includes("mujer") || n.includes("hermana") || n.includes("publicadora") || mapSexToWeb(sex)==="M") return "Publicadora";
  if(n.includes("varon") || n.includes("hermano") || n.includes("publicador") || mapSexToWeb(sex)==="H") return "Publicador";
  return text(v) || "Publicador";
}

function defaultCanForRole(role, sex){
  const r = norm(role);
  const male = mapSexToWeb(sex, role) === "H";
  const ministry = r.includes("anciano") || (r.includes("siervo") && r.includes("ministerial"));
  return {
    presidir: ministry,
    orar: ministry,
    tesoros: ministry,
    perlas: ministry,
    lecturaBiblia: male,
    estudiante: true,
    ayudante: true,
    discursoEstudiante: male,
    vidaCristiana: ministry,
    necesidades: ministry,
    conductorEbc: ministry,
    lectorEbc: male
  };
}

function partObjectsFromExchangeWeek(w={}){
  if(Array.isArray(w.parts)) return w.parts;
  const rows = [];
  const add = (arr, section, fallbackType)=>{
    (Array.isArray(arr) ? arr : []).forEach(item=>{
      const title = text(item);
      if(!title) return;
      const low = norm(title);
      let type = fallbackType;
      if(low.includes("lectura de la biblia")) type = "Lectura de la Biblia";
      else if(low.includes("perlas")) type = "Busquemos perlas escondidas";
      else if(low.includes("discurso")) type = section.includes("Seamos") ? "Discurso de estudiante" : fallbackType;
      else if(low.includes("estudio biblico de la congregacion")) type = "Conductor EBC";
      const mins = title.match(/\((?:menos de )?(\d{1,3})\s*mins?\.?\)/i)?.[1] || "";
      rows.push({section, type, title, minutes: mins});
    });
  };
  add(w.treasures_items || w.treasuresItems || [], "Tesoros de la Biblia", "Tesoros");
  add(w.smm_items || w.smmItems || [], "Seamos mejores maestros", "Asignación estudiantil");
  add(w.life_items || w.lifeItems || [], "Nuestra vida cristiana", "Nuestra vida cristiana");
  return rows;
}

function weekISOFromExchange(w={}){
  return text(w.weekISO || w.meetingDateISO || w.meeting_date || w.fecha_reunion || w.fecha);
}

function normalizeExchangeAssignment(a={}, idx=0, nameToPerson=new Map()){
  const mainName = text(a.person1Name || a.personName || a.assignee_name || a.assignedPersonName || a.asignado);
  const helperName = text(a.person2Name || a.helperName || a.helper_name || a.assistantName || a.ayudante);
  const main = nameToPerson.get(nameKey(mainName));
  const helper = nameToPerson.get(nameKey(helperName));
  const key = text(a.key || a.slot_key || a.assignmentKey || `importado_${idx+1}`);
  const title = text(a.title || a.slot_label || a.titulo || a.assignment || key);
  const type = text(a.type || a.item_type || a.partType || a.tipo || "importado");
  return {
    order: Number(a.order || idx + 1),
    key,
    type,
    title,
    section: text(a.section || ""),
    minutes: a.minutes == null ? "" : a.minutes,
    needsHelper: !!(a.needsHelper || helperName),
    detail: text(a.detail || ""),
    number: text(a.number || ""),
    room: text(a.room || a.sala || "Principal"),
    isAuxRoom: a.isAuxRoom === true || norm(a.room || a.sala).includes("sala auxiliar") || norm(a.room || a.sala).includes("sala b") || String(key).endsWith("_sala_b"),
    person1Id: main?.id || text(a.person1Id || a.personId || ""),
    person1Name: main?.name || mainName,
    person2Id: helper?.id || text(a.person2Id || a.helperId || ""),
    person2Name: helper?.name || helperName
  };
}

async function deleteEveryDocInCollection(colName){
  const rows = await getAllDocsFromCollection(colName);
  for(const r of rows){
    const id = r._docId || r.id;
    if(id) await deleteDoc(doc(db(), colName, id));
  }
  return rows.length;
}

export async function exportCompatibleBackup(){
  await ensureInit();
  await requireSignedIn(true);
  const [people, settings, weeksRaw, assignmentsRaw, historyRaw] = await Promise.all([
    loadPeople(),
    loadAppSettings().catch(()=>({})),
    getAllDocsFromCollection("semanas"),
    getAllDocsFromCollection("asignaciones"),
    getAllDocsFromCollection("historial").catch(()=>[])
  ]);
  const assignmentsByWeek = new Map();
  for(const a of assignmentsRaw){
    const iso = a.weekISO || a.meetingDateISO || String(a.id || "").split("__")[0] || "";
    if(!iso) continue;
    if(!assignmentsByWeek.has(iso)) assignmentsByWeek.set(iso, []);
    assignmentsByWeek.get(iso).push(cleanAssignmentRow(a));
  }
  const weeks = weeksRaw.map(w=>{
    const iso = w.weekISO || w.meetingDateISO || w.id || "";
    const embedded = Array.isArray(w.assignments) ? cleanAssignmentRows(w.assignments) : [];
    return {
      id: w.id || w._docId || iso,
      weekISO: iso,
      meetingDateISO: w.meetingDateISO || iso,
      meeting_date: w.meetingDateISO || iso,
      week_label: w.weekLabel || w.week_label || "",
      wolUrl: w.wolUrl || "",
      wol_url: w.wolUrl || "",
      reading: w.reading || "",
      bible_reading: w.reading || "",
      openingSong: w.openingSong || "",
      song_initial: w.openingSong || "",
      middleSong: w.middleSong || "",
      song_middle: w.middleSong || "",
      closingSong: w.closingSong || "",
      song_final: w.closingSong || "",
      parts: Array.isArray(w.parts) ? w.parts : [],
      auxRoomEnabled: w.auxRoomEnabled === true,
      aux_enabled: w.auxRoomEnabled === true,
      auxRoomAutoByWOL: w.auxRoomAutoByWOL === true,
      auxRoomManualOverride: w.auxRoomManualOverride === true,
      auxRoomName: w.auxRoomName || settings.auxRoomName || "Sala B",
      assignments: embedded.length ? embedded : (assignmentsByWeek.get(iso) || [])
    };
  });
  return {
    magic: EXCHANGE_MAGIC,
    schema_version: 1,
    source: "web",
    app: {name:"Planificador VMC Web/Firebase", version:"2.3.13", build:"10217"},
    created_at: new Date().toISOString(),
    settings: {
      ...settings,
      congregation_name: settings.congregacion || settings.congregation_name || "",
      aux_room_mode: settings.auxRoomMode || settings.aux_room_mode || (settings.enableAuxRoom === false ? "off" : "auto_discourse"),
      meeting_day: settings.meetingDay || settings.meeting_day || ""
    },
    people: people.map(p=>({
      id:p.id,
      name:p.name || "",
      sex:p.sex || "",
      role:p.role || "",
      active:p.active !== false,
      notes:p.notes || "",
      web:{ student:!!p.student, approved:!!p.approved, spouseOnly:!!p.spouseOnly, familyGroup:p.familyGroup||"", can:p.can||{} }
    })),
    weeks,
    assignments: assignmentsRaw.map((a, idx)=>cleanAssignmentRow(a, idx)),
    history: historyRaw
  };
}

export async function importCompatibleBackup(data, {clearExisting=false}={}){
  await ensureInit();
  await requireSignedIn(true);
  if(!data || typeof data !== "object") throw new Error("El archivo no contiene un backup compatible.");
  if(data.magic && data.magic !== EXCHANGE_MAGIC) throw new Error("El archivo no corresponde al backup compatible de Planificador VMC.");

  if(clearExisting){
    await deleteEveryDocInCollection("historial");
    await deleteEveryDocInCollection("asignaciones");
    await deleteEveryDocInCollection("semanas");
    await deleteEveryDocInCollection("personas");
  }

  const settings = data.settings || {};
  const auxMode = settings.auxRoomMode || settings.aux_room_mode || (settings.enableAuxRoom === false ? "off" : "auto_discourse");
  await saveAppSettings({
    ...settings,
    congregacion: settings.congregacion || settings.congregation_name || settings.congregation || "",
    enableAuxRoom: auxMode !== "off" && settings.enableAuxRoom !== false,
    auxRoomMode: auxMode,
    aux_room_mode: auxMode,
    auxRoomName: settings.auxRoomName || settings.aux_room_name || "Sala B",
    defaultTime: settings.defaultTime || settings.default_time || "19:30",
    noMeetingDates: settings.noMeetingDates || ""
  });

  let peopleImported = 0, weeksImported = 0, assignmentsImported = 0;
  const sourcePeople = Array.isArray(data.people) ? data.people : (Array.isArray(data.personas) ? data.personas : []);
  for(const p of sourcePeople){
    const name = text(p.name || p.nombre || p.personName);
    if(!name) continue;
    const role = mapRoleToWeb(p.role || p.rol || p.designacion, p.sex || p.sexo);
    const sex = mapSexToWeb(p.sex || p.sexo, role);
    const can = p.web?.can || p.can || defaultCanForRole(role, sex);
    await savePerson({
      name,
      sex,
      role,
      student: p.web?.student || p.student || role === "Publicador" || role === "Publicadora",
      active: p.active !== false && p.activo !== false,
      approved: p.web?.approved || p.approved || sex === "H",
      spouseOnly: p.web?.spouseOnly || p.spouseOnly || false,
      familyGroup: p.web?.familyGroup || p.familyGroup || "",
      can,
      notes: p.notes || p.notas || ""
    });
    peopleImported++;
  }

  const peopleNow = await loadPeople();
  const nameToPerson = new Map(peopleNow.map(p=>[nameKey(p.name), p]));
  const sourceWeeks = Array.isArray(data.weeks) ? data.weeks : (Array.isArray(data.semanas) ? data.semanas : []);
  for(const w of sourceWeeks){
    const weekISO = weekISOFromExchange(w);
    if(!weekISO) continue;
    const parts = partObjectsFromExchangeWeek(w);
    const weekData = {
      wolUrl: w.wolUrl || w.wol_url || "",
      meetingDay: w.meetingDay || settings.meeting_day || "",
      meetingTime: w.meetingTime || settings.defaultTime || "19:30",
      weekType: w.weekType || "normal",
      specialReason: w.specialReason || "",
      reading: w.reading || w.bible_reading || "",
      openingSong: w.openingSong || w.song_initial || "",
      middleSong: w.middleSong || w.song_middle || "",
      closingSong: w.closingSong || w.song_final || "",
      travelerName: w.travelerName || settings.travelerName || "",
      travelerTalkTitle: w.travelerTalkTitle || "Discurso de servicio del viajante",
      auxRoomEnabled: w.auxRoomEnabled === true || w.aux_enabled === true,
      auxRoomAutoByWOL: w.auxRoomAutoByWOL === true,
      auxRoomManualOverride: w.auxRoomManualOverride === true || w.aux_mode_used === "manual",
      auxRoomHasStudentDiscourse: w.auxRoomHasStudentDiscourse === true,
      auxRoomName: w.auxRoomName || settings.auxRoomName || "Sala B",
      parts
    };
    await saveWeek(weekISO, weekData);
    const sourceAssignments = Array.isArray(w.assignments) ? w.assignments : [];
    const rows = sourceAssignments.map((a, idx)=>normalizeExchangeAssignment(a, idx, nameToPerson));
    await saveAssignments(weekISO, rows);
    if(rows.length) await appendHistoryFromWeek(weekISO);
    weeksImported++;
    assignmentsImported += rows.length;
  }
  markSaved();
  return {peopleImported, weeksImported, assignmentsImported};
}

