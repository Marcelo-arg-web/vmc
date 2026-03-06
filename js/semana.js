import { qs, qsa, Storage, todayISO, fmtDateAR, dayNameFromISO, shortWeekLabel, markUnsaved, requireSavedGuard } from "./app.js";
import { mountHeader } from "./ui_common.js";
import { fetchAndParseWOL } from "./wol.js";
import { loadPeople, loadWeek, saveWeek, loadAssignments, saveAssignments, appendHistoryFromWeek, loadRecentHistory, loadAppSettings } from "./data.js";
import { Rules, scoreCandidate } from "./rules.js";

mountHeader();

const weekInput = qs("#weekISO");
const fields = {
  wolLink: qs("#wolLink"), meetingDay: qs("#meetingDay"), meetingTime: qs("#meetingTime"), weekType: qs("#weekType"),
  specialReason: qs("#specialReason"), reading: qs("#reading"), openingSong: qs("#openingSong"), middleSong: qs("#middleSong"),
  closingSong: qs("#closingSong"), travelerName: qs("#travelerName"), travelerTalkTitle: qs("#travelerTalkTitle")
};
const partsBox = qs("#partsBox");
const asgBox = qs("#asgBox");
const msg = qs("#msg");

let people = [];
let parts = [];
let assignments = [];
let appSettings = {};

function makeBaseParts(){
  return [
    { section:"Tesoros de la Biblia", type:"Tesoros", title:"Tesoros de la Biblia", minutes:10 },
    { section:"Tesoros de la Biblia", type:"Perlas", title:"Busquemos perlas escondidas", minutes:10 },
    { section:"Tesoros de la Biblia", type:"Lectura de la Biblia", title:"Lectura de la Biblia", minutes:4 },
    { section:"Seamos mejores maestros", type:"Asignación estudiantil", title:"Seamos mejores maestros 1", needsHelper:true },
    { section:"Seamos mejores maestros", type:"Asignación estudiantil", title:"Seamos mejores maestros 2", needsHelper:true },
    { section:"Seamos mejores maestros", type:"Asignación estudiantil", title:"Seamos mejores maestros 3", needsHelper:true },
    { section:"Nuestra vida cristiana", type:"Nuestra vida cristiana", title:"Nuestra vida cristiana 1" },
    { section:"Nuestra vida cristiana", type:"Nuestra vida cristiana", title:"Nuestra vida cristiana 2" },
    { section:"Nuestra vida cristiana", type:"Conductor EBC", title:"Estudio bíblico de la congregación" },
    { section:"Nuestra vida cristiana", type:"Lector EBC", title:"Estudio bíblico de la congregación" }
  ];
}

function currentWeek(){ return weekInput.value; }
function show(s, kind="ok"){ msg.className = "notice " + (kind==="ok"?"ok":kind==="warn"?"warn":"err"); msg.textContent=s; msg.style.display="block"; }
function hideMsg(){ msg.style.display="none"; }
function guardBeforeSwitch(){ return requireSavedGuard() ? true : confirm("La semana actual no está guardada. ¿Cambiar igual?"); }
function isNoMeeting(){ return ["asamblea","conmemoracion","sin_reunion"].includes(fields.weekType.value); }
function isTravelerVisit(){ return fields.weekType.value === "visita"; }
function setWeekPretty(){
  qs("#weekPretty").textContent = fmtDateAR(weekInput.value);
  qs("#weekLabel").textContent = shortWeekLabel(weekInput.value, fields.meetingDay?.value || "");
}

weekInput.value = Storage.get("currentWeekISO", todayISO());
setWeekPretty();
weekInput.addEventListener("change", async ()=>{
  if(!guardBeforeSwitch()){
    weekInput.value = Storage.get("currentWeekISO", todayISO());
    return;
  }
  Storage.set("currentWeekISO", weekInput.value);
  setWeekPretty();
  await loadAll();
});

for(const el of Object.values(fields)){
  el.addEventListener("input", ()=>{ markUnsaved("Se modificó la semana."); if(el===fields.meetingDay || el===fields.meetingTime) setWeekPretty(); });
  el.addEventListener("change", ()=>{ markUnsaved("Se modificó la semana."); if(el===fields.meetingDay || el===fields.meetingTime) setWeekPretty(); applyWeekTypeEffects(); });
}

function applyAppDefaults(){
  fields.meetingDay.value ||= dayNameFromISO(weekInput.value);
  fields.meetingTime.value ||= appSettings.defaultTime || "19:30";
  fields.travelerName.value ||= appSettings.travelerName || "Roberto Armando";
  if(!fields.travelerTalkTitle.value) fields.travelerTalkTitle.value = "Discurso de servicio del viajante";
}

function maybeApplyNoMeetingDefaults(){
  const noMeeting = (appSettings.noMeetingDates || "").split(/\n+/).map(x=>x.trim()).filter(Boolean);
  const row = noMeeting.find(x=>x.startsWith(`${weekInput.value} |`) || x === weekInput.value);
  if(row){
    const motive = row.split("|")[1]?.trim() || "Sin reunión";
    const low = motive.toLowerCase();
    fields.weekType.value = low.includes("conmemor") ? "conmemoracion" : low.includes("asamblea") ? "asamblea" : "sin_reunion";
    fields.specialReason.value = motive;
  }
}

async function loadAll(){
  hideMsg();
  qs("#status").textContent = "Cargando...";
  appSettings = await loadAppSettings();
  people = await loadPeople();
  const weekISO = currentWeek();
  const w = await loadWeek(weekISO);
  assignments = await loadAssignments(weekISO);

  fields.wolLink.value = w?.wolUrl || "";
  fields.meetingDay.value = w?.meetingDay || dayNameFromISO(weekISO);
  fields.meetingTime.value = w?.meetingTime || appSettings.defaultTime || "19:30";
  fields.weekType.value = w?.weekType || "normal";
  fields.specialReason.value = w?.specialReason || "";
  fields.reading.value = w?.reading || "";
  fields.openingSong.value = w?.openingSong || "";
  fields.middleSong.value = w?.middleSong || "";
  fields.closingSong.value = w?.closingSong || "";
  fields.travelerName.value = w?.travelerName || appSettings.travelerName || "Roberto Armando";
  fields.travelerTalkTitle.value = w?.travelerTalkTitle || "Discurso de servicio del viajante";
  parts = (w?.parts && w.parts.length) ? w.parts : makeBaseParts();

  maybeApplyNoMeetingDefaults();
  applyAppDefaults();
  setWeekPretty();
  applyWeekTypeEffects();
  renderParts();
  renderAssignments();
  qs("#status").textContent = "Listo";
}

function buildDefaultAssignments(){
  if(isNoMeeting()) return [];
  const rows = [];
  if(!parts.length) parts = makeBaseParts();
  let order = 0;
  rows.push({ order:++order, key:"presidente", type:"Presidente", title:"Palabras de introducción y conclusión" });
  rows.push({ order:++order, key:"oracion_inicial", type:"Oración inicial", title:"Oración inicial" });
  for(const p of parts){
    rows.push({ order:++order, key:`${p.type}_${order}`, type:p.type, title:p.title, section:p.section, minutes:p.minutes||"", needsHelper: !!p.needsHelper, person1Id:"", person1Name:"", person2Id:"", person2Name:"" });
  }
  rows.push({ order:++order, key:"oracion_final", type:"Oración final", title:"Oración final" });
  return rows;
}

function optionsForRow(row, helper=false){
  const opts = ["<option value=''>—</option>"];
  const main = assignments.find(x=>x.key===row.key);
  for(const p of people){
    const ok = helper ? Rules.helperAllowed(people.find(x=>x.id===main?.person1Id), p) : Rules.allowedFor(row.type, p);
    if(!ok) continue;
    opts.push(`<option value="${p.id}">${p.name}</option>`);
  }
  return opts.join("");
}

function renderParts(){
  if(isNoMeeting()){
    partsBox.innerHTML = `<div class="notice warn">Esta semana no hay reunión. Motivo: <b>${fields.specialReason.value || fields.weekType.options[fields.weekType.selectedIndex].text}</b></div>`;
    return;
  }
  if(!parts.length) parts = makeBaseParts();
  const t = document.createElement("table");
  t.className = "table";
  t.innerHTML = "<thead><tr><th>Sección</th><th>Parte</th><th>Título</th><th>Min</th></tr></thead><tbody></tbody>";
  const tb = t.querySelector("tbody");
  for(const p of parts){
    const tr = document.createElement("tr");
    tr.innerHTML = `<td>${p.section||""}</td><td>${p.type||""}</td><td>${p.title||""}</td><td>${p.minutes||""}</td>`;
    tb.appendChild(tr);
  }
  partsBox.innerHTML = "";
  partsBox.appendChild(t);
}

function renderAssignments(){
  asgBox.innerHTML = "";
  if(isNoMeeting()){
    asgBox.innerHTML = `<div class="small">No se generan asignaciones para esta semana.</div>`;
    return;
  }
  if(!assignments.length) assignments = buildDefaultAssignments();

  const sections = [
    { title:"Inicio", rows: assignments.filter(r=>["Presidente","Oración inicial"].includes(r.type)) },
    { title:"Tesoros de la Biblia", rows: assignments.filter(r=>["Tesoros","Perlas","Lectura de la Biblia"].includes(r.type)) },
    { title:"Seamos mejores maestros", rows: assignments.filter(r=>["Asignación estudiantil","Discurso de estudiante"].includes(r.type)) },
    { title:"Nuestra vida cristiana", rows: assignments.filter(r=>["Nuestra vida cristiana","Necesidades de la congregación","Discurso del viajante","Conductor EBC","Lector EBC"].includes(r.type)) },
    { title:"Final", rows: assignments.filter(r=>["Oración final"].includes(r.type)) }
  ].filter(sec=>sec.rows.length);

  const frag = document.createDocumentFragment();
  for(const sec of sections){
    const card = document.createElement("div");
    card.className = "assign-section";
    card.innerHTML = `<div class="assign-section-title">${sec.title}</div>`;
    const t = document.createElement("table");
    t.className = "table";
    t.innerHTML = "<thead><tr><th style='width:18%'>Parte</th><th style='width:34%'>Título</th><th style='width:24%'>Asignado</th><th style='width:24%'>Ayudante</th></tr></thead><tbody></tbody>";
    const tb = t.querySelector("tbody");
    for(const r of sec.rows){
      const helper = r.needsHelper ? `<select data-h2="${r.key}">${optionsForRow(r, true)}</select>` : `<span class="small">—</span>`;
      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td><span class="pill">${r.type}</span></td>
        <td><input data-title="${r.key}" value="${(r.title||"").replace(/"/g,"&quot;")}" style="width:100%" /></td>
        <td><select data-h1="${r.key}">${optionsForRow(r)}</select></td>
        <td>${helper}</td>`;
      tb.appendChild(tr);
    }
    card.appendChild(t);
    frag.appendChild(card);
  }
  asgBox.appendChild(frag);

  qsa("[data-h1]").forEach(sel=>{
    const row = assignments.find(x=>x.key===sel.dataset.h1);
    sel.value = row?.person1Id || "";
    sel.addEventListener("change", ()=>{
      const p = people.find(x=>x.id===sel.value);
      row.person1Id = sel.value; row.person1Name = p?.name || "";
      if(row.needsHelper){
        row.person2Id = ""; row.person2Name = "";
        renderAssignments();
      }
      markUnsaved("Se editaron asignaciones.");
    });
  });
  qsa("[data-h2]").forEach(sel=>{
    const row = assignments.find(x=>x.key===sel.dataset.h2);
    sel.value = row?.person2Id || "";
    sel.addEventListener("change", ()=>{
      const p = people.find(x=>x.id===sel.value);
      row.person2Id = sel.value; row.person2Name = p?.name || "";
      markUnsaved("Se editaron asignaciones.");
    });
  });
  qsa("[data-title]").forEach(inp=>{
    const row = assignments.find(x=>x.key===inp.dataset.title);
    inp.addEventListener("input", ()=>{ row.title = inp.value; markUnsaved("Se editó una parte."); });
  });
}

function applyWeekTypeEffects(){
  if(isTravelerVisit()){
    assignments = assignments.filter(x=>!["Conductor EBC","Lector EBC"].includes(x.type));
    if(!parts.some(x=>x.type === "Discurso del viajante")){
      parts = (parts.length ? parts : makeBaseParts()).filter(x=>!["Conductor EBC","Lector EBC","Discurso del viajante"].includes(x.type));
      parts.push({ section:"Nuestra vida cristiana", type:"Discurso del viajante", title: fields.travelerTalkTitle.value || "Discurso de servicio del viajante", minutes:30 });
      assignments = buildDefaultAssignments();
    }
  } else if(!isNoMeeting()){
    if(!parts.length) parts = makeBaseParts();
    const hasEbc = parts.some(x=>x.type === "Conductor EBC");
    const hasTraveler = parts.some(x=>x.type === "Discurso del viajante");
    if(hasTraveler && !hasEbc){
      parts = parts.filter(x=>x.type !== "Discurso del viajante");
      parts.push({ section:"Nuestra vida cristiana", type:"Conductor EBC", title:"Estudio bíblico de la congregación", minutes:30 });
      parts.push({ section:"Nuestra vida cristiana", type:"Lector EBC", title:"Estudio bíblico de la congregación", minutes:30 });
      assignments = buildDefaultAssignments();
    }
  }
  renderParts();
  renderAssignments();
}

async function suggest(){
  if(isNoMeeting()) return show("Esta semana está marcada sin reunión.", "warn");
  const hist = await loadRecentHistory(1200);
  const byPerson = {};
  for(const h of hist){
    if(!byPerson[h.personId]) byPerson[h.personId] = [];
    byPerson[h.personId].push(h);
  }
  const currentUsed = new Set();

  for(const row of assignments){
    const candidates = people.filter(p=>Rules.allowedFor(row.type, p));
    if(!row.person1Id){
      let best = null, bestScore = Infinity;
      for(const p of candidates){
        const sc = scoreCandidate({ person:p, historyByPerson:byPerson, currentWeekISO:currentWeek(), currentUsedIds:currentUsed, partType:row.type });
        if(sc < bestScore){ best = p; bestScore = sc; }
      }
      if(best){ row.person1Id = best.id; row.person1Name = best.name; currentUsed.add(best.id); }
    } else currentUsed.add(row.person1Id);

    if(row.needsHelper && !row.person2Id){
      const main = people.find(x=>x.id===row.person1Id);
      const helperCandidates = people.filter(p=>Rules.helperAllowed(main, p));
      let best = null, bestScore = Infinity;
      for(const p of helperCandidates){
        const sc = scoreCandidate({ person:p, historyByPerson:byPerson, currentWeekISO:currentWeek(), currentUsedIds:currentUsed, partType:"Ayudante" });
        if(sc < bestScore){ best = p; bestScore = sc; }
      }
      if(best){ row.person2Id = best.id; row.person2Name = best.name; currentUsed.add(best.id); }
    }
  }
  renderAssignments();
  show("Sugerencias aplicadas. Revisá y ajustá lo necesario.");
}

qs("#btnLoadWOL").addEventListener("click", async ()=>{
  const wolUrl = fields.wolLink.value.trim();
  if(!wolUrl) return show("Pegá el link de WOL.", "warn");
  try{
    const result = await fetchAndParseWOL({ wolUrl, proxyBase: Storage.get("proxyBase", "") || null });
    parts = result.parts?.length ? result.parts : makeBaseParts();
    fields.reading.value = result.meta.reading || fields.reading.value;
    fields.openingSong.value = result.meta.openingSong || fields.openingSong.value;
    fields.middleSong.value = result.meta.middleSong || fields.middleSong.value;
    fields.closingSong.value = result.meta.closingSong || fields.closingSong.value;
    assignments = buildDefaultAssignments();
    applyWeekTypeEffects();
    show("Programa cargado desde WOL.");
  }catch(e){
    parts = makeBaseParts();
    assignments = buildDefaultAssignments();
    applyWeekTypeEffects();
    show("No se pudo leer WOL. Dejé el formulario completo para cargar todo manualmente.", "warn");
  }
});

qs("#btnSuggest").addEventListener("click", suggest);
qs("#btnToBoard").addEventListener("click", ()=> location.href = "tablero.html");

qs("#btnSave").addEventListener("click", async ()=>{
  const weekISO = currentWeek();
  const weekData = {
    wolUrl: fields.wolLink.value.trim(),
    meetingDay: fields.meetingDay.value.trim(),
    meetingTime: fields.meetingTime.value.trim(),
    weekType: fields.weekType.value,
    specialReason: fields.specialReason.value.trim(),
    reading: fields.reading.value.trim(),
    openingSong: fields.openingSong.value.trim(),
    middleSong: fields.middleSong.value.trim(),
    closingSong: fields.closingSong.value.trim(),
    travelerName: fields.travelerName.value.trim(),
    travelerTalkTitle: fields.travelerTalkTitle.value.trim(),
    parts: isNoMeeting() ? [] : parts
  };
  await saveWeek(weekISO, weekData);
  await saveAssignments(weekISO, isNoMeeting() ? [] : assignments);
  if(!isNoMeeting()) await appendHistoryFromWeek(weekISO);
  show("Semana guardada.");
});

loadAll();
