import { qs, qsa, Storage, todayISO, fmtDateAR, fmtDayChip, dayNameFromISO, monthWeekOptions, addDaysISO, markUnsaved, requireSavedGuard } from "./app.js";
import { mountHeader, requireAuthOrRedirect } from "./ui_common.js";
import { fetchAndParseWOL, predictWOLInfoFromWeekISO, predictWOLUrlFromWeekISO } from "./wol.js";
import { loadPeople, loadWeek, saveWeek, loadAssignments, saveAssignments, clearAssignmentsForWeek, appendHistoryFromWeek, loadRecentHistory, loadAppSettings } from "./data.js";
import { Rules, scoreCandidate } from "./rules.js";

mountHeader();
await requireAuthOrRedirect();

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
const auxRoomEnabledField = qs("#auxRoomEnabled");
const auxRoomAutoStatus = qs("#auxRoomAutoStatus");

let people = [];
let parts = [];
let assignments = [];
let appSettings = {};

function usesAuxRoom(){
  // La Sala B ahora se decide por semana. Si la semana todavía no tiene valor,
  // se conserva el comportamiento anterior tomando la configuración general.
  if(auxRoomEnabledField) return auxRoomEnabledField.checked === true;
  return appSettings.enableAuxRoom !== false;
}

function auxRoomName(){
  return String(appSettings.auxRoomName || "Sala B").trim() || "Sala B";
}

function textKeyForAuxDetect(s){
  return String(s || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
}

function isStudentDiscoursePartForAux(part){
  const section = textKeyForAuxDetect(part?.section);
  if(!section.includes("seamos mejores maestros")) return false;

  // La Sala B se activa solo por una parte titulada “Discurso” dentro de
  // “Seamos mejores maestros”. No se toma en cuenta el detalle ni otros
  // discursos, por ejemplo el discurso del viajante en “Nuestra vida cristiana”.
  const type = textKeyForAuxDetect(part?.type);
  const title = textKeyForAuxDetect(part?.title);
  return type === "discurso de estudiante" || /^discurso(\b|$)/.test(title);
}

function hasStudentDiscourseForAux(partsList=parts){
  return (Array.isArray(partsList) ? partsList : []).some(isStudentDiscoursePartForAux);
}

function setAuxRoomForWeek(enabled, { auto=false, manual=false, reason="" }={}){
  if(auxRoomEnabledField){
    auxRoomEnabledField.checked = !!enabled;
    auxRoomEnabledField.dataset.auto = auto ? "1" : "0";
    auxRoomEnabledField.dataset.manual = manual ? "1" : "0";
  }
  updateAuxRoomAutoStatus(reason);
}

function updateAuxRoomAutoStatus(reason=""){
  if(!auxRoomAutoStatus) return;
  const enabled = usesAuxRoom();
  const auto = auxRoomEnabledField?.dataset.auto === "1";
  const label = auxRoomName();
  const base = enabled
    ? `${label} activa para esta semana.`
    : `${label} desactivada para esta semana.`;
  const detail = reason || (auto
    ? "Decidido automáticamente por WOL. Podés cambiarlo manualmente antes de guardar."
    : "Control manual disponible para esta semana.");
  auxRoomAutoStatus.className = "notice " + (enabled ? "ok" : "warn");
  const labelEl = auxRoomAutoStatus.querySelector("span");
  const helpEl = auxRoomAutoStatus.querySelector(".small");
  if(labelEl) labelEl.textContent = `Usar ${label} / sala auxiliar esta semana · ${base}`;
  if(helpEl) helpEl.textContent = detail;
}

function mainRoomName(){ return "Auditorio principal"; }
function isAuxEligibleType(type){ return ["Lectura de la Biblia", "Asignación estudiantil", "Discurso de estudiante"].includes(type); }
function isAuxAssignment(row){ return row?.isAuxRoom === true || String(row?.key || "").endsWith("_sala_b"); }

function makeAssignmentRow({order, key, part, room="", isAuxRoom=false}){
  return {
    order,
    key,
    type: part.type,
    title: part.title,
    section: part.section,
    minutes: part.minutes || "",
    needsHelper: !!part.needsHelper,
    detail: part.detail || "",
    number: part.number || "",
    room,
    isAuxRoom,
    person1Id:"", person1Name:"", person2Id:"", person2Name:""
  };
}

function normalizeAssignmentsForCurrentSettings(rows){
  if(isNoMeeting()) return [];
  const defaults = buildDefaultAssignments();
  if(!rows?.length) return defaults;
  const byKey = new Map(rows.map(r=>[r.key, r]));
  return defaults.map(def=>{
    const old = byKey.get(def.key);
    return old ? { ...def, ...old, room:def.room, isAuxRoom:def.isAuxRoom, order:def.order, needsHelper:def.needsHelper } : def;
  });
}

function makeBaseParts(){
  return [
    { section:"Tesoros de la Biblia", type:"Tesoros", title:"Tesoros de la Biblia", minutes:10, number:"1" },
    { section:"Tesoros de la Biblia", type:"Perlas", title:"Busquemos perlas escondidas", minutes:10, number:"2" },
    { section:"Tesoros de la Biblia", type:"Lectura de la Biblia", title:"Lectura de la Biblia", minutes:4, number:"3" },
    { section:"Seamos mejores maestros", type:"Asignación estudiantil", title:"Empiece conversaciones", minutes:3, needsHelper:true, number:"4" },
    { section:"Seamos mejores maestros", type:"Asignación estudiantil", title:"Empiece conversaciones", minutes:3, needsHelper:true, number:"5" },
    { section:"Seamos mejores maestros", type:"Asignación estudiantil", title:"Explique sus creencias", minutes:5, needsHelper:true, number:"6" },
    { section:"Seamos mejores maestros", type:"Asignación estudiantil", title:"Haga revisitas", minutes:4, needsHelper:true, number:"7" },
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
  const info = predictWOLInfoFromWeekISO(weekInput.value);
  if(info?.url){
    wolAutoHint.textContent = `Sugerido automáticamente según patrón WOL 2026 (${info.issue}): ${info.url}`;
  } else {
    wolAutoHint.textContent = "Elegí una semana desde marzo de 2026 para autocompletar el enlace.";
  }
  btnAutoWOL.disabled = false;
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
  showToast._t = setTimeout(()=> el.classList.remove("show"), 2600);
}

function countAssignedRows(rows=assignments){
  return rows.reduce((n, r)=> n + (r.person1Id || r.person1Name ? 1 : 0) + (r.person2Id || r.person2Name ? 1 : 0), 0);
}

function currentAssignedSlots(rows=assignments){
  const slots = [];
  for(const row of rows || []){
    if(row.person1Id){
      slots.push({
        personId:row.person1Id,
        personName:row.person1Name || people.find(p=>p.id===row.person1Id)?.name || "Asignado",
        assignment: row.title || row.type || "Asignación",
        role: "principal",
        room: row.room || ""
      });
    }
    if(row.person2Id){
      slots.push({
        personId:row.person2Id,
        personName:row.person2Name || people.find(p=>p.id===row.person2Id)?.name || "Ayudante",
        assignment: row.title || row.type || "Asignación",
        role: "ayudante",
        room: row.room || ""
      });
    }
  }
  return slots;
}

function duplicateAssignmentGroups(rows=assignments){
  const byId = new Map();
  for(const slot of currentAssignedSlots(rows)){
    if(!byId.has(slot.personId)) byId.set(slot.personId, []);
    byId.get(slot.personId).push(slot);
  }
  return Array.from(byId.entries())
    .filter(([, slots])=>slots.length > 1)
    .map(([personId, slots])=>({ personId, personName:slots[0]?.personName || "Asignado", slots }));
}

function duplicateWarningText(groups=duplicateAssignmentGroups()){
  if(!groups.length) return "";
  const lines = groups.map(g=>{
    const where = g.slots.map(s=>`${s.assignment}${s.room ? ` (${s.room})` : ""}`).join(" / " );
    return `• ${g.personName}: ${where}`;
  });
  return `Atención: hay una persona repetida en más de una asignación.\n${lines.join("\n")}`;
}

function warnDuplicateAssignments({ popup=false, saveStatus=false }={}){
  const groups = duplicateAssignmentGroups();
  if(!groups.length) return false;
  const text = duplicateWarningText(groups);
  show(text.replace(/\n/g, "  "), "warn");
  if(saveStatus) setSaveStatus(text.replace(/\n/g, "  "), false);
  if(popup) alert(`${text}\n\nLa app permite esta repetición manual, pero conviene revisar si hay otra persona disponible.`);
  return true;
}

function confirmDuplicateAssignmentsBeforeSave(){
  const groups = duplicateAssignmentGroups();
  if(!groups.length) return true;
  const text = duplicateWarningText(groups);
  return confirm(`${text}\n\nSe puede guardar igual si lo decidiste manualmente. ¿Guardar de todos modos?`);
}

function chooseLeastRecentlyUsedCandidate({ candidates, historyByPerson, currentUsedIds, partType }){
  const list = Array.isArray(candidates) ? candidates.filter(Boolean) : [];
  if(!list.length) return { person:null, repeated:false };

  // Regla principal: elegir primero entre quienes todavía no fueron usados esta semana.
  // Solo permite repetir automáticamente si no queda ninguna persona habilitada sin usar.
  const unused = list.filter(p=>!currentUsedIds.has(p.id));
  const pool = unused.length ? unused : list;
  let best = null;
  let bestScore = Infinity;
  for(const p of pool){
    const sc = scoreCandidate({
      person:p,
      historyByPerson,
      currentWeekISO:currentWeek(),
      currentUsedIds:new Set(),
      partType
    });
    if(sc < bestScore || (sc === bestScore && String(p.name||"").localeCompare(String(best?.name||""), "es") < 0)){
      best = p;
      bestScore = sc;
    }
  }
  return { person:best, repeated:!!best && currentUsedIds.has(best.id) };
}

function setSaveStatus(text, ok=true){
  const el = qs("#saveStatus");
  if(!el) return;
  el.textContent = text;
  el.className = "notice " + (ok ? "ok" : "err");
  el.style.display = "block";
}

function clearSaveStatus(){
  const el = qs("#saveStatus");
  if(el) el.style.display = "none";
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

auxRoomEnabledField?.addEventListener("change", ()=>{
  auxRoomEnabledField.dataset.auto = "0";
  auxRoomEnabledField.dataset.manual = "1";
  assignments = normalizeAssignmentsForCurrentSettings(assignments);
  renderAssignments();
  updateAuxRoomAutoStatus("Cambio manual. Guardá la semana para conservar esta decisión.");
  markUnsaved("Se cambió la Sala B de esta semana.");
  show(usesAuxRoom() ? `${auxRoomName()} activada manualmente para esta semana.` : `${auxRoomName()} desactivada manualmente para esta semana.`, usesAuxRoom() ? "ok" : "warn");
});

for(const el of Object.values(fields)){
  el.addEventListener("input", ()=>{ if(el===fields.wolLink) fields.wolLink.dataset.auto = "0"; markUnsaved("Se modificó la semana."); });
  el.addEventListener("change", ()=>{ markUnsaved("Se modificó la semana."); applyWeekTypeEffects(); });
}

function applyAppDefaults(){
  fields.meetingDay.value ||= dayNameFromISO(weekInput.value);
  fields.meetingTime.value ||= appSettings.defaultTime || "19:30";
  fields.travelerName.value ||= appSettings.travelerName || "";
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
  clearSaveStatus();
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
  fields.travelerName.value = w?.travelerName || appSettings.travelerName || "";
  fields.travelerTalkTitle.value = w?.travelerTalkTitle || "Discurso de servicio del viajante";
  parts = (w?.parts && w.parts.length) ? w.parts : makeBaseParts();
  const wolDetectedAux = hasStudentDiscourseForAux(parts);
  const hasSavedManualOverride = w?.auxRoomManualOverride === true;
  const savedAuxValue = hasSavedManualOverride
    ? w?.auxRoomEnabled === true
    : (w?.parts?.length ? wolDetectedAux : false);

  // Migración segura: las semanas guardadas con builds anteriores podían quedar
  // con Sala B activa por una detección demasiado amplia. Si no hay una marca
  // explícita de cambio manual, se vuelve a calcular desde las partes cargadas:
  // solo “Discurso” dentro de “Seamos mejores maestros” activa la sala auxiliar.
  setAuxRoomForWeek(savedAuxValue, {
    auto: !hasSavedManualOverride && !!w?.parts?.length,
    manual: hasSavedManualOverride,
    reason: hasSavedManualOverride
      ? "Control manual guardado para esta semana. Podés cambiarlo antes de volver a guardar."
      : (w?.parts?.length
        ? (wolDetectedAux
          ? `WOL detectó una parte titulada ‘Discurso’ en Seamos mejores maestros; ${auxRoomName()} queda activa.`
          : `WOL no detectó ninguna parte titulada ‘Discurso’ en Seamos mejores maestros; ${auxRoomName()} queda desactivada.`)
        : "Semana nueva: Sala B queda desactivada hasta que WOL detecte una parte titulada ‘Discurso’ en Seamos mejores maestros, o hasta que la actives manualmente.")
  });
  assignments = normalizeAssignmentsForCurrentSettings(assignments);

  maybeApplyNoMeetingDefaults();
  applyAppDefaults();
  applyPredictedWOL(false);
  refreshAutoWOLHint();
  applyWeekTypeEffects(false);
  renderParts();
  renderAssignments();
  updateAuxRoomAutoStatus();
  const savedDate = w?.meetingDateISO || w?.weekISO || w?.id || "";
  const assigned = countAssignedRows(assignments);
  qs("#status").textContent = w
    ? (savedDate && savedDate !== weekISO ? `Listo · datos guardados recuperados de ${fmtDateAR(savedDate)} · ${assigned} asignado(s)` : `Listo · datos guardados cargados · ${assigned} asignado(s)`)
    : "Listo · semana nueva sin datos guardados";
}

function buildDefaultAssignments(){
  if(isNoMeeting()) return [];
  const rows = [];
  if(!parts.length) parts = makeBaseParts();
  let order = 0;
  rows.push({ order:++order, key:"presidente", type:"Presidente", title:"Palabras de introducción", room:"", isAuxRoom:false });
  rows.push({ order:++order, key:"oracion_inicial", type:"Oración inicial", title:"Oración inicial", room:"", isAuxRoom:false });
  for(const [idx, p] of parts.entries()){
    const baseKey = `part_${idx+1}_${p.type}`;
    const eligibleForAux = usesAuxRoom() && isAuxEligibleType(p.type);
    rows.push(makeAssignmentRow({
      order:++order,
      key:baseKey,
      part:p,
      room: eligibleForAux ? mainRoomName() : "",
      isAuxRoom:false
    }));
    if(eligibleForAux){
      rows.push(makeAssignmentRow({
        order:++order,
        key:`${baseKey}_sala_b`,
        part:p,
        room:auxRoomName(),
        isAuxRoom:true
      }));
    }
  }
  rows.push({ order:++order, key:"oracion_final", type:"Oración final", title:"Oración final", room:"", isAuxRoom:false });
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

function escHtml(s){
  return String(s ?? "").replace(/[&<>'"]/g, c=>({"&":"&amp;","<":"&lt;",">":"&gt;","'":"&#39;",'"':"&quot;"}[c]));
}

function optionHtml(value, label){
  return `<option value="${escHtml(value)}">${escHtml(label)}</option>`;
}

function optionsForRow(row, helper=false, historyByPerson=null){
  const opts = ["<option value=''>—</option>"];
  const ids = new Set([""]);
  const main = assignments.find(x=>x.key===row.key);
  const savedId = helper ? row.person2Id : row.person1Id;
  const savedName = helper ? row.person2Name : row.person1Name;
  for(const p of people){
    const ok = helper ? Rules.helperAllowed(people.find(x=>x.id===main?.person1Id), p) : Rules.allowedFor(row.type, p);
    if(!ok) continue;
    ids.add(p.id);
    const label = historyByPerson ? candidateLabel(p, historyByPerson) : p.name;
    opts.push(optionHtml(p.id, label));
  }
  // Si una asignación guardada pertenece a una persona que ya no aparece por filtros
  // o permisos, se conserva para no borrarla involuntariamente al guardar de nuevo.
  if(savedId && !ids.has(savedId)){
    opts.push(optionHtml(savedId, `${savedName || "Asignado guardado"} · guardado`));
  }
  return opts.join("");
}

function rowSubtitle(row){
  const meta = [];
  if(row.room) meta.push(row.room);
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
  assignments = normalizeAssignmentsForCurrentSettings(assignments);

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
      if(sel.value) warnDuplicateAssignments({ popup:true, saveStatus:true });
    });
  });
  qsa("[data-h2]", asgBox).forEach(sel=>{
    const row = assignments.find(x=>x.key===sel.dataset.h2);
    sel.value = row?.person2Id || "";
    sel.addEventListener("change", ()=>{
      const p = people.find(x=>x.id===sel.value);
      row.person2Id = sel.value; row.person2Name = p?.name || "";
      markUnsaved("Se editaron asignaciones.");
      if(sel.value) warnDuplicateAssignments({ popup:true, saveStatus:true });
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
  assignments = normalizeAssignmentsForCurrentSettings(assignments);
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
  const automaticRepeats = [];

  for(const row of assignments){
    const candidates = people.filter(p=>Rules.allowedFor(row.type, p));
    if(!row.person1Id){
      const picked = chooseLeastRecentlyUsedCandidate({
        candidates,
        historyByPerson:byPerson,
        currentUsedIds:currentUsed,
        partType:row.type
      });
      const best = picked.person;
      if(best){
        row.person1Id = best.id;
        row.person1Name = best.name;
        if(picked.repeated) automaticRepeats.push(`${best.name} en ${row.title || row.type}`);
        currentUsed.add(best.id);
      }
    } else currentUsed.add(row.person1Id);

    if(row.needsHelper && !row.person2Id){
      const main = people.find(x=>x.id===row.person1Id);
      const helperCandidates = people.filter(p=>Rules.helperAllowed(main, p));
      const picked = chooseLeastRecentlyUsedCandidate({
        candidates:helperCandidates,
        historyByPerson:byPerson,
        currentUsedIds:currentUsed,
        partType:"Ayudante"
      });
      const best = picked.person;
      if(best){
        row.person2Id = best.id;
        row.person2Name = best.name;
        if(picked.repeated) automaticRepeats.push(`${best.name} como ayudante en ${row.title || row.type}`);
        currentUsed.add(best.id);
      }
    } else if(row.needsHelper && row.person2Id){
      currentUsed.add(row.person2Id);
    }
  }
  renderAssignments(byPerson);
  markUnsaved("Se sugirieron asignados.");
  const duplicated = duplicateAssignmentGroups();
  if(automaticRepeats.length || duplicated.length){
    const base = automaticRepeats.length
      ? `Sugerencias aplicadas: ${countAssignedRows()} asignado(s). Se repitió automáticamente solo porque no había otra persona habilitada sin usar: ${automaticRepeats.join(", ")}.`
      : `Sugerencias aplicadas: ${countAssignedRows()} asignado(s), pero hay repetidos por asignaciones manuales previas.`;
    show(`${base} Revisá antes de guardar.`, "warn");
    warnDuplicateAssignments({ popup:true, saveStatus:true });
  } else {
    show(`Sugerencias aplicadas: ${countAssignedRows()} asignado(s). No se repitieron personas. Revisá y tocá Guardar semana para confirmarlo.`);
  }
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
    const hasAuxDiscourse = hasStudentDiscourseForAux(parts);
    setAuxRoomForWeek(hasAuxDiscourse, {
      auto:true,
      manual:false,
      reason: hasAuxDiscourse
        ? `WOL detectó un discurso en “Seamos mejores maestros”; se activó ${auxRoomName()} automáticamente. Podés desactivarla manualmente si hace falta.`
        : `WOL no detectó discurso en “Seamos mejores maestros”; ${auxRoomName()} queda desactivada esta semana. Podés activarla manualmente si hace falta.`
    });
    fields.reading.value = result.meta.reading || fields.reading.value;
    fields.openingSong.value = result.meta.openingSong || fields.openingSong.value;
    fields.middleSong.value = result.meta.middleSong || fields.middleSong.value;
    fields.closingSong.value = result.meta.closingSong || fields.closingSong.value;
    assignments = buildDefaultAssignments();
    applyWeekTypeEffects();
    updateAuxRoomAutoStatus();
    show(hasAuxDiscourse
      ? `Programa cargado desde WOL. WOL detectó discurso en Seamos mejores maestros y activó ${auxRoomName()} automáticamente.`
      : `Programa cargado desde WOL. No se detectó discurso en Seamos mejores maestros y ${auxRoomName()} quedó desactivada.`, hasAuxDiscourse ? "ok" : "warn");
  }catch(e){
    parts = makeBaseParts();
    assignments = buildDefaultAssignments();
    applyWeekTypeEffects();
    updateAuxRoomAutoStatus("No se pudo leer WOL. Se conserva la decisión manual de Sala B para esta semana.");
    show(`No se pudo leer WOL: ${e?.message || "error desconocido"}. Dejé el formulario completo para cargar todo manualmente.`, "warn");
  }
});

qs("#btnSuggest").addEventListener("click", suggest);

function collectWeekData(){
  return {
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
    auxRoomEnabled: usesAuxRoom(),
    auxRoomAutoByWOL: auxRoomEnabledField?.dataset.auto === "1",
    auxRoomManualOverride: auxRoomEnabledField?.dataset.manual === "1",
    auxRoomHasStudentDiscourse: hasStudentDiscourseForAux(parts),
    auxRoomName: auxRoomName(),
    parts: isNoMeeting() ? [] : parts
  };
}

async function saveCurrentWeek({withHistory=false}={}){
  syncAssignmentsFromDOM();
  if(!confirmDuplicateAssignmentsBeforeSave()){
    throw new Error("Guardado cancelado: hay asignaciones repetidas para revisar.");
  }
  const weekISO = currentWeek();
  const weekData = collectWeekData();
  const expectedAssigned = isNoMeeting() ? 0 : countAssignedRows(assignments);
  await saveWeek(weekISO, weekData);
  await saveAssignments(weekISO, isNoMeeting() ? [] : assignments);
  const savedRows = isNoMeeting() ? [] : await loadAssignments(weekISO);
  const savedAssigned = countAssignedRows(savedRows);
  if(expectedAssigned > 0 && savedAssigned < expectedAssigned){
    throw new Error(`Firebase guardó ${savedAssigned} de ${expectedAssigned} asignado(s). Revisá permisos/reglas y volvé a intentar.`);
  }
  if(withHistory && !isNoMeeting()) await appendHistoryFromWeek(weekISO);
  Storage.set("currentWeekISO", weekISO);
  return { weekISO, assignedCount:savedAssigned, rowCount:savedRows.length };
}
qs("#btnToBoard").addEventListener("click", async ()=>{
  try{
    const result = await saveCurrentWeek();
    location.href = `tablero.html?week=${encodeURIComponent(result.weekISO)}`;
  }catch(e){
    show(`No se pudo preparar el tablero: ${e?.message || e}`, "err");
  }
});

qs("#btnSave").addEventListener("click", async ()=>{
  const btn = qs("#btnSave");
  try{
    btn.disabled = true;
    btn.textContent = "Guardando...";
    const result = await saveCurrentWeek({withHistory:true});
    const stamp = new Date().toLocaleTimeString("es-AR", {hour:"2-digit", minute:"2-digit", second:"2-digit"});
    const text = `Guardado confirmado a las ${stamp}: ${result.assignedCount} asignado(s) en ${result.rowCount} renglón(es). Al volver a elegir esta semana se cargará lo guardado.`;
    show(text);
    setSaveStatus(text, true);
    showToast("Guardado confirmado");
  }catch(e){
    const text = `No se pudo guardar la semana: ${e?.message || e}`;
    show(text, "err");
    setSaveStatus(text, false);
  }finally{
    btn.disabled = false;
    btn.textContent = "Guardar semana";
  }
});


function blankAssignedPeople(){
  syncAssignmentsFromDOM();
  assignments = normalizeAssignmentsForCurrentSettings(assignments).map(r=>({
    ...r,
    person1Id:"",
    person1Name:"",
    person2Id:"",
    person2Name:""
  }));
  renderAssignments();
}

qs("#btnClearAssigned")?.addEventListener("click", async ()=>{
  if(!confirm("¿Limpiar los asignados de esta semana y guardar la semana sin nombres? El programa y las partes quedan igual.")) return;
  try{
    blankAssignedPeople();
    const result = await saveCurrentWeek({withHistory:false});
    const text = `Asignados limpiados y guardados. Quedaron ${result.assignedCount} asignado(s). Ahora podés usar Sugerir asignados para arrancar de nuevo.`;
    show(text, "warn");
    setSaveStatus(text, true);
    showToast("Asignados limpiados");
  }catch(e){
    const text = `No se pudieron limpiar los asignados: ${e?.message || e}`;
    show(text, "err");
    setSaveStatus(text, false);
  }
});

qs("#btnDeleteWeekAssignments")?.addEventListener("click", async ()=>{
  if(!confirm("¿Eliminar de Firebase los documentos de asignados de esta semana? Esto deja la semana lista para cargar/sugerir de nuevo.")) return;
  try{
    await clearAssignmentsForWeek(currentWeek());
    assignments = buildDefaultAssignments();
    renderAssignments();
    const text = "Asignados guardados eliminados de esta semana. Podés usar Sugerir asignados y luego Guardar semana.";
    show(text, "warn");
    setSaveStatus(text, true);
    showToast("Asignados eliminados");
  }catch(e){
    const text = `No se pudieron eliminar los asignados: ${e?.message || e}`;
    show(text, "err");
    setSaveStatus(text, false);
  }
});

loadAll();
