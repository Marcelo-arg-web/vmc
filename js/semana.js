import { qs, qsa, Storage, todayISO, fmtDateAR, fmtDayChip, dayNameFromISO, monthWeekOptions, addDaysISO, markUnsaved, requireSavedGuard } from "./app.js";
import { mountHeader } from "./ui_common.js";
import { fetchAndParseWOL, predictWOLUrlFromWeekISO } from "./wol.js";
import { loadPeople, loadWeek, saveWeek, loadAssignments, saveAssignments, appendHistoryFromWeek, loadRecentHistory, loadAppSettings } from "./data.js";
import { Rules, scoreCandidate } from "./rules.js";

mountHeader();

const weekInput = qs("#weekISO");
const weekChips = qs("#weekChips");
const fields = {
  wolLink: qs("#wolLink"), meetingDay: qs("#meetingDay"), meetingTime: qs("#meetingTime"), weekType: qs("#weekType"),
  specialReason: qs("#specialReason"), reading: qs("#reading"), openingSong: qs("#openingSong"), middleSong: qs("#middleSong"),
  closingSong: qs("#closingSong"), travelerName: qs("#travelerName"), travelerTalkTitle: qs("#travelerTalkTitle")
};
const partsBox = qs("#partsBox");
const asgBox = qs("#asgBox");
const msg = qs("#msg");
const btnAutoWOL = qs("#btnAutoWOL");
const wolAutoHint = qs("#wolAutoHint");

let people = [];
let parts = [];
let assignments = [];
let appSettings = {};

function makeBaseParts(){
  return [
    { section:"Tesoros de la Biblia", type:"Tesoros", title:"Tesoros de la Biblia", minutes:10 },
    { section:"Tesoros de la Biblia", type:"Perlas", title:"Busquemos perlas escondidas", minutes:10 },
    { section:"Tesoros de la Biblia", type:"Lectura de la Biblia", title:"Lectura de la Biblia", minutes:4 },
    { section:"Seamos mejores maestros", type:"Asignación estudiantil", title:"Empiece conversaciones", minutes:3, needsHelper:true },
    { section:"Seamos mejores maestros", type:"Asignación estudiantil", title:"Haga revisitas", minutes:4, needsHelper:true },
    { section:"Seamos mejores maestros", type:"Asignación estudiantil", title:"Explique sus creencias", minutes:5, needsHelper:true },
    { section:"Nuestra vida cristiana", type:"Nuestra vida cristiana", title:"Nuestra vida cristiana 1", minutes:10 },
    { section:"Nuestra vida cristiana", type:"Nuestra vida cristiana", title:"Nuestra vida cristiana 2", minutes:10 },
    { section:"Nuestra vida cristiana", type:"Conductor EBC", title:"Estudio bíblico de la congregación", minutes:30 },
    { section:"Nuestra vida cristiana", type:"Lector EBC", title:"Estudio bíblico de la congregación", minutes:30 }
  ];
}

function currentWeek(){ return weekInput.value; }
function show(s, kind="ok"){ msg.className = "notice " + (kind==="ok"?"ok":kind==="warn"?"warn":"err"); msg.textContent=s; msg.style.display="block"; }
function hideMsg(){ msg.style.display="none"; }
function guardBeforeSwitch(){ return requireSavedGuard() ? true : confirm("La semana actual no está guardada. ¿Cambiar igual?"); }
function isNoMeeting(){ return ["asamblea","conmemoracion","sin_reunion"].includes(fields.weekType.value); }
function isTravelerVisit(){ return fields.weekType.value === "visita"; }
function setWeekPretty(){ qs("#weekPretty").textContent = fmtDateAR(weekInput.value); }

function refreshAutoWOLHint(){
  const predicted = predictWOLUrlFromWeekISO(weekInput.value);
  if(predicted){
    wolAutoHint.textContent = `Sugerido automáticamente desde abril de 2026: ${predicted}`;
    btnAutoWOL.disabled = false;
  } else {
    wolAutoHint.textContent = "La sugerencia automática de enlaces está preparada desde abril de 2026.";
    btnAutoWOL.disabled = true;
  }
}

function applyPredictedWOL(force=false){
  const predicted = predictWOLUrlFromWeekISO(weekInput.value);
  if(!predicted) return false;
  if(force || !fields.wolLink.value.trim() || fields.wolLink.dataset.auto === "1") {
    fields.wolLink.value = predicted;
    fields.wolLink.dataset.auto = "1";
    return true;
  }
  return false;
}

function showToast(text){
  let el = qs("#toast");
  if(!el){
    el = document.createElement("div");
    el.id = "toast";
    el.className = "app-toast";
    document.body.appendChild(el);
  }
  el.textContent = text;
  el.classList.add("show");
  clearTimeout(showToast._t);
  showToast._t = setTimeout(()=> el.classList.remove("show"), 2000);
}

function gotoWeek(newISO){
  if(!guardBeforeSwitch()) return;
  weekInput.value = newISO;
  Storage.set("currentWeekISO", newISO);
  setWeekPretty();
  renderWeekChips();
  refreshAutoWOLHint();
  loadAll();
}

function renderWeekChips(){
  const weeks = monthWeekOptions(weekInput.value);
  weekChips.innerHTML = weeks.map((iso, idx)=>{
    const cls = iso === weekInput.value ? "week-chip active" : "week-chip";
    return `<button class="${cls}" data-week="${iso}" type="button">Semana ${idx+1} · ${fmtDayChip(iso)}</button>`;
  }).join("");
  qsa("[data-week]", weekChips).forEach(btn=>btn.addEventListener("click", ()=> gotoWeek(btn.dataset.week)));
}

weekInput.value = Storage.get("currentWeekISO", todayISO());
setWeekPretty();
renderWeekChips();
refreshAutoWOLHint();
weekInput.addEventListener("change", ()=> gotoWeek(weekInput.value));
qs("#btnPrevWeek").addEventListener("click", ()=> gotoWeek(addDaysISO(weekInput.value, -7)));
qs("#btnNextWeek").addEventListener("click", ()=> gotoWeek(addDaysISO(weekInput.value, 7)));

for(const el of Object.values(fields)){
  el.addEventListener("input", ()=>{ if(el===fields.wolLink) fields.wolLink.dataset.auto = "0"; markUnsaved("Se modificó la semana."); });
  el.addEventListener("change", ()=>{ markUnsaved("Se modificó la semana."); applyWeekTypeEffects(); });
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
  fields.wolLink.dataset.auto = w?.wolUrl ? "0" : "";
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
  applyPredictedWOL(false);
  refreshAutoWOLHint();
  applyWeekTypeEffects(false);
  renderParts();
  renderAssignments();
  qs("#status").textContent = "Listo";
}

function buildDefaultAssignments(){
  if(isNoMeeting()) return [];
  const rows = [];
  if(!parts.length) parts = makeBaseParts();
  let order = 0;
  rows.push({ order:++order, key:"presidente", type:"Presidente", title:"Palabras de introducción" });
  rows.push({ order:++order, key:"oracion_inicial", type:"Oración inicial", title:"Oración inicial" });
  for(const [idx, p] of parts.entries()){
    rows.push({ order:++order, key:`part_${idx+1}_${p.type}`, type:p.type, title:p.title, section:p.section, minutes:p.minutes||"", needsHelper: !!p.needsHelper, detail:p.detail||"", person1Id:"", person1Name:"", person2Id:"", person2Name:"" });
  }
  rows.push({ order:++order, key:"oracion_final", type:"Oración final", title:"Oración final" });
  return rows;
}

function groupedAssignments(){
  const groups = [
    { label:"Inicio", rows: assignments.filter(x=>["Presidente","Oración inicial"].includes(x.type)) },
    { label:"Tesoros de la Biblia", rows: assignments.filter(x=>["Tesoros","Perlas","Lectura de la Biblia"].includes(x.type)) },
    { label:"Seamos mejores maestros", rows: assignments.filter(x=>["Asignación estudiantil","Discurso de estudiante"].includes(x.type)) },
    { label:"Nuestra vida cristiana", rows: assignments.filter(x=>["Nuestra vida cristiana","Necesidades de la congregación","Discurso del viajante","Conductor EBC","Lector EBC"].includes(x.type)) },
    { label:"Final", rows: assignments.filter(x=>["Oración final"].includes(x.type)) }
  ];
  return groups.filter(g=>g.rows.length);
}

function candidateLabel(person, historyByPerson){
  const hist = historyByPerson?.[person.id] || [];
  if(!hist.length) return `${person.name} · sin historial`;
  const latest = hist.slice().sort((a,b)=>(b.weekISO||"").localeCompare(a.weekISO||""))[0];
  const weeks = latest?.weekISO ? Math.max(1, Math.floor((new Date(currentWeek()) - new Date(latest.weekISO)) / 604800000)) : 0;
  return `${person.name} · hace ${weeks} sem.`;
}

function optionsForRow(row, helper=false, historyByPerson=null){
  const opts = ["<option value=''>—</option>"];
  const main = assignments.find(x=>x.key===row.key);
  for(const p of people){
    const ok = helper ? Rules.helperAllowed(people.find(x=>x.id===main?.person1Id), p) : Rules.allowedFor(row.type, p);
    if(!ok) continue;
    const label = historyByPerson ? candidateLabel(p, historyByPerson) : p.name;
    opts.push(`<option value="${p.id}">${label}</option>`);
  }
  return opts.join("");
}

function rowSubtitle(row){
  const meta = [];
  if(row.detail) meta.push(row.detail);
  if(row.minutes) meta.push(`${row.minutes} min.`);
  return meta.join(" · ");
}

function renderParts(){
  if(isNoMeeting()){
    partsBox.innerHTML = `<div class="notice warn">Esta semana no hay reunión. Motivo: <b>${fields.specialReason.value || fields.weekType.options[fields.weekType.selectedIndex].text}</b></div>`;
    return;
  }
  if(!parts.length) parts = makeBaseParts();
  partsBox.innerHTML = parts.map((p, idx)=>`<div class="detected-row"><div class="detected-no">${idx+1}</div><div><div class="detected-title">${p.title || p.type}</div><div class="small">${p.section || ""}${p.minutes ? ` · ${p.minutes} min.` : ""}${p.detail ? ` · ${p.detail}` : ""}</div></div></div>`).join("");
}

function renderAssignments(historyByPerson=null){
  asgBox.innerHTML = "";
  if(isNoMeeting()){
    asgBox.innerHTML = `<div class="small">No se generan asignaciones para esta semana.</div>`;
    return;
  }
  if(!assignments.length) assignments = buildDefaultAssignments();

  const wrap = document.createElement("div");
  for(const group of groupedAssignments()){
    const sec = document.createElement("div");
    sec.className = "assign-group";
    sec.innerHTML = `<div class="assign-group-title">${group.label}</div>`;
    for(const r of group.rows){
      const helper = r.needsHelper ? `<select data-h2="${r.key}">${optionsForRow(r, true, historyByPerson)}</select>` : `<span class="small">—</span>`;
      const row = document.createElement("div");
      row.className = "assign-row";
      row.innerHTML = `<div><div class="assign-type">${r.type}</div><div class="assign-sub">${rowSubtitle(r)}</div></div><div><input data-title="${r.key}" value="${(r.title||"").replace(/"/g,"&quot;")}" style="width:100%" /></div><div><select data-h1="${r.key}">${optionsForRow(r, false, historyByPerson)}</select></div><div>${helper}</div>`;
      sec.appendChild(row);
    }
    wrap.appendChild(sec);
  }
  asgBox.appendChild(wrap);

  qsa("[data-h1]", asgBox).forEach(sel=>{
    const row = assignments.find(x=>x.key===sel.dataset.h1);
    sel.value = row?.person1Id || "";
    sel.addEventListener("change", ()=>{
      const p = people.find(x=>x.id===sel.value);
      row.person1Id = sel.value; row.person1Name = p?.name || "";
      if(row.needsHelper){ row.person2Id = ""; row.person2Name = ""; renderAssignments(historyByPerson); }
      markUnsaved("Se editaron asignaciones.");
    });
  });
  qsa("[data-h2]", asgBox).forEach(sel=>{
    const row = assignments.find(x=>x.key===sel.dataset.h2);
    sel.value = row?.person2Id || "";
    sel.addEventListener("change", ()=>{
      const p = people.find(x=>x.id===sel.value);
      row.person2Id = sel.value; row.person2Name = p?.name || "";
      markUnsaved("Se editaron asignaciones.");
    });
  });
  qsa("[data-title]", asgBox).forEach(inp=>{
    const row = assignments.find(x=>x.key===inp.dataset.title);
    inp.addEventListener("input", ()=>{ row.title = inp.value; markUnsaved("Se editó una parte."); });
  });
}

function applyWeekTypeEffects(resetAssignments=true){
  if(isTravelerVisit()){
    parts = (parts.length ? parts : makeBaseParts()).filter(x=>!["Conductor EBC","Lector EBC","Discurso del viajante"].includes(x.type));
    parts.push({ section:"Nuestra vida cristiana", type:"Discurso del viajante", title: fields.travelerTalkTitle.value || "Discurso de servicio del viajante", minutes:30 });
    if(resetAssignments) assignments = buildDefaultAssignments();
  } else if(!isNoMeeting()){
    const hasTraveler = parts.some(x=>x.type === "Discurso del viajante");
    if(hasTraveler){
      parts = parts.filter(x=>x.type !== "Discurso del viajante");
      parts.push({ section:"Nuestra vida cristiana", type:"Conductor EBC", title:"Estudio bíblico de la congregación", minutes:30 });
      parts.push({ section:"Nuestra vida cristiana", type:"Lector EBC", title:"Estudio bíblico de la congregación", minutes:30 });
      if(resetAssignments) assignments = buildDefaultAssignments();
    }
  }
  renderParts();
  renderAssignments();
}

function syncAssignmentsFromDOM(){
  qsa("[data-title]", asgBox).forEach(inp=>{
    const row = assignments.find(x=>x.key===inp.dataset.title);
    if(row) row.title = inp.value.trim();
  });
  qsa("[data-h1]", asgBox).forEach(sel=>{
    const row = assignments.find(x=>x.key===sel.dataset.h1);
    const p = people.find(x=>x.id===sel.value);
    if(row){ row.person1Id = sel.value || ""; row.person1Name = p?.name || ""; }
  });
  qsa("[data-h2]", asgBox).forEach(sel=>{
    const row = assignments.find(x=>x.key===sel.dataset.h2);
    const p = people.find(x=>x.id===sel.value);
    if(row){ row.person2Id = sel.value || ""; row.person2Name = p?.name || ""; }
  });
}

async function suggest(){
  if(isNoMeeting()) return show("Esta semana está marcada sin reunión.", "warn");
  syncAssignmentsFromDOM();
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
  renderAssignments(byPerson);
  show("Sugerencias aplicadas. Revisá y ajustá lo necesario.");
}

btnAutoWOL?.addEventListener("click", ()=>{
  if(applyPredictedWOL(true)){
    markUnsaved("Se sugirió el enlace de WOL.");
    show("Se completó el enlace de WOL según la semana elegida.");
    refreshAutoWOLHint();
  } else {
    show("No hay una regla automática disponible para esa fecha.", "warn");
  }
});

qs("#btnLoadWOL").addEventListener("click", async ()=>{
  let wolUrl = fields.wolLink.value.trim();
  if(!wolUrl){
    applyPredictedWOL(true);
    wolUrl = fields.wolLink.value.trim();
  }
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
    show(`No se pudo leer WOL: ${e?.message || "error desconocido"}. Dejé el formulario completo para cargar todo manualmente.`, "warn");
  }
});

qs("#btnSuggest").addEventListener("click", suggest);
qs("#btnToBoard").addEventListener("click", ()=> location.href = "tablero.html");

qs("#btnSave").addEventListener("click", async ()=>{
  syncAssignmentsFromDOM();
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
  showToast("Guardado con éxito");
});

loadAll();
