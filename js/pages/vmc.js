import { auth, db } from "../firebase-config.js";
import { onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/12.9.0/firebase-auth.js";
import {
  collection,
  getDocs,
  doc,
  getDoc,
  setDoc,
  serverTimestamp,
} from "https://www.gstatic.com/firebasejs/12.9.0/firebase-firestore.js";

const $ = (id) => document.getElementById(id);
const smmHost = $("smmHost");
const nvcHost = $("nvcHost");

function normalize(s) {
  return String(s || "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ");
}
function esc(str) {
  return String(str ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}
function isoToday() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const da = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${da}`;
}
function addDaysISO(iso, days) {
  const d = new Date(`${iso}T00:00:00`);
  if (Number.isNaN(d.getTime())) return "";
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}
function fmtAR(iso) {
  if (!iso) return "";
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y}`;
}
function upcomingThursdayISO(fromISO = isoToday()) {
  const d = new Date(`${fromISO}T00:00:00`);
  const day = d.getDay();
  const delta = (4 - day + 7) % 7;
  d.setDate(d.getDate() + delta);
  return d.toISOString().slice(0, 10);
}
function shiftWeekISO(iso, weeks) {
  return addDaysISO(iso, weeks * 7);
}
function rolesOf(persona) {
  return Array.isArray(persona?.roles) ? persona.roles.map(normalize) : [];
}
function roleHas(persona, role) {
  return rolesOf(persona).includes(normalize(role));
}
function bool(v) { return v === true; }
function vmcOf(persona) { return persona?.vmc || {}; }
function displayName(p) { return p?.nombre || ""; }

let personas = [];
let isAdmin = true;

const smmDefs = [1,2,3];
const nvcDefs = [1,2];
const smmTypes = [
  "Empiece conversaciones",
  "Haga revisitas",
  "Haga discípulos",
  "Explique sus creencias",
  "Discurso",
  "Análisis con el auditorio",
];
const circunstancias = ["", "De casa en casa", "Predicación informal", "Predicación pública", "Discurso", "Escenificación"];
const nvcTypes = ["Discurso", "Análisis con el auditorio", "Video", "Entrevista", "Necesidades de la congregación"];

async function getUsuario(uid){
  try{
    const snap = await getDoc(doc(db,"usuarios",uid));
    return snap.exists() ? snap.data() : null;
  }catch(e){ console.error(e); return null; }
}

function renderTopbar(active){
  const el = document.getElementById("topbar");
  if(!el) return;
  el.innerHTML = `
    <div class="topbar">
      <div class="brand"><span class="brand-dot"></span>Villa Fiad</div>
      <div class="links">
        <a href="panel.html" class="${active==='panel'?'active':''}">Panel</a>
        <a href="asignaciones.html" class="${active==='asignaciones'?'active':''}">Asignaciones</a>
        <a href="programa-mensual.html" class="${active==='programa'?'active':''}">Programa mensual</a>
        <a href="tablero-acomodadores.html" class="${active==='acomodadores'?'active':''}">Acom/AV</a>
        <a href="visitantes.html" class="${active==='visitantes'?'active':''}">Visitantes</a>
        <a href="salientes.html" class="${active==='salientes'?'active':''}">Salientes</a>
        <a href="personas.html" class="${active==='personas'?'active':''}">Personas</a>
        <a href="vmc.html" class="${active==='vmc'?'active':''}">VMC</a>
        <a href="discursantes.html" class="${active==='discursantes'?'active':''}">Discursantes</a>
        <a href="estadisticas.html" class="${active==='estadisticas'?'active':''}">Estadísticas</a>
        <a href="doc-presi.html" class="${active==='docpresi'?'active':''}">Visitas/Salidas</a>
        <a href="imprimir.html" class="${active==='imprimir'?'active':''}">Imprimir</a>
        <a href="importar.html" class="${active==='importar'?'active':''}">Importar</a>
        <a href="usuarios.html" class="${active==='usuarios'?'active':''}">Usuarios</a>
      </div>
      <div class="actions"><button id="btnSalir" class="btn danger sm" type="button">Salir</button></div>
    </div>`;
  document.getElementById("btnSalir")?.addEventListener("click", async ()=>{
    try{ await signOut(auth); }catch(e){}
    window.location.href = "index.html";
  });
}

async function requireActiveUser(activePage){
  return new Promise((resolve)=>{
    onAuthStateChanged(auth, async (user)=>{
      if(!user){ window.location.href="index.html"; return; }
      const u = await getUsuario(user.uid);
      if(!u?.activo){
        await signOut(auth);
        window.location.href="index.html";
        return;
      }
      renderTopbar(activePage, u?.rol);
      resolve({ user, usuario:u });
    });
  });
}

function setStatus(msg, isError = false) {
  const box = $("status");
  if (!box) return;
  box.style.display = msg ? "block" : "none";
  box.textContent = msg || "";
  box.style.background = isError ? "#fff1f2" : "#eff6ff";
  box.style.borderColor = isError ? "#fecdd3" : "#bfdbfe";
  box.style.color = isError ? "#9f1239" : "#1e3a8a";
}

function personOptions(list, placeholder = "Seleccionar") {
  const opts = [`<option value="">${placeholder}</option>`];
  list.forEach((p) => opts.push(`<option value="${esc(p.id)}">${esc(displayName(p))}</option>`));
  return opts.join("");
}
function setOptions(selectId, list, placeholder) {
  const sel = $(selectId);
  if (!sel) return;
  const prev = sel.value;
  sel.innerHTML = personOptions(list, placeholder);
  if (list.some(p => p.id === prev)) sel.value = prev;
}

function isMale(p){
  const vmc = vmcOf(p);
  return normalize(vmc.sexo) === "hermano" || bool(vmc.varon) || roleHas(p, "varon") || roleHas(p, "hermano");
}
function isFemale(p){ return normalize(vmcOf(p).sexo) === "hermana" || roleHas(p, "hermana"); }
function isAnciano(p){ return bool(vmcOf(p).anciano) || roleHas(p, "anciano"); }
function isSiervo(p){ return bool(vmcOf(p).siervoMinisterial) || roleHas(p, "siervo") || roleHas(p, "siervo ministerial"); }
function isAncianoOSiervo(p){ return isAnciano(p) || isSiervo(p); }
function isActivo(p){ return p?.activo !== false; }
function canPray(p){ return bool(vmcOf(p).puedeOrar) || roleHas(p, "oracion") || roleHas(p, "oración") || isMale(p); }
function canPreside(p){ return bool(vmcOf(p).puedePresidir) || roleHas(p, "presidente") || isAncianoOSiervo(p); }
function canTreasures(p){ return bool(vmcOf(p).puedeTesoros) || isAncianoOSiervo(p); }
function canLife(p){ return bool(vmcOf(p).puedeVidaCristiana) || isAncianoOSiervo(p); }
function canCongNeeds(p){ return bool(vmcOf(p).puedeNecesidades) || isAnciano(p); }
function canBibleReading(p){ return isMale(p) && (bool(vmcOf(p).puedeLecturaBiblia) || bool(vmcOf(p).estudianteAprobado) || roleHas(p, "lector") || roleHas(p, "lectura")); }
function canStudentTalk(p){ return isMale(p) && (bool(vmcOf(p).puedeDiscursoEstudiante) || bool(vmcOf(p).estudianteAprobado)); }
function canStudentScene(p){ return bool(vmcOf(p).estudianteAprobado) || isMale(p) || isFemale(p) || roleHas(p, "estudiante"); }
function canHelper(p){ return bool(vmcOf(p).puedeAyudante) || canStudentScene(p); }
function canEbcConductor(p){ return bool(vmcOf(p).puedeConducirEbc) || isAncianoOSiervo(p); }
function canEbcLector(p){ return isMale(p) && (bool(vmcOf(p).puedeLeerEbc) || roleHas(p, "lector") || canBibleReading(p)); }

function filterPeople(fn){
  return personas.filter((p)=> isActivo(p) && fn(p)).sort((a,b)=> displayName(a).localeCompare(displayName(b), "es"));
}
function getPerson(id){ return personas.find((p)=>p.id===id) || null; }

function buildSmmCards() {
  smmHost.innerHTML = smmDefs.map((n) => `
    <div class="card mini" style="margin-bottom:12px;">
      <div class="section-title"><h4 style="margin:0;">Parte ${n}</h4><span class="pill">Estudiante</span></div>
      <div class="grid three">
        <div class="field"><div class="label">Tipo</div><select id="smm${n}_tipo">${smmTypes.map(v=>`<option>${esc(v)}</option>`).join("")}</select></div>
        <div class="field"><div class="label">Circunstancia</div><select id="smm${n}_circ">${circunstancias.map(v=>`<option value="${esc(v)}">${esc(v || '—')}</option>`).join("")}</select></div>
        <div class="field"><div class="label">Tiempo</div><input id="smm${n}_tiempo" class="input" placeholder="Ej: 3 mins."/></div>
      </div>
      <div class="grid two">
        <div class="field"><div class="label">Título / referencia</div><input id="smm${n}_titulo" class="input" placeholder="Ej: ¿Cómo superar el miedo a la muerte?"/></div>
        <div class="field"><div class="label">Lección</div><input id="smm${n}_leccion" class="input" placeholder="Ej: th lección 1"/></div>
      </div>
      <div class="grid two">
        <div class="field"><div class="label">Asignado</div><select id="smm${n}_asignado"></select></div>
        <div class="field"><div class="label">Ayudante</div><select id="smm${n}_ayudante"></select></div>
      </div>
    </div>
  `).join("");
}
function buildNvcCards() {
  nvcHost.innerHTML = nvcDefs.map((n) => `
    <div class="card mini" style="margin-bottom:12px;">
      <div class="section-title"><h4 style="margin:0;">Parte ${n}</h4><span class="pill">Aplicación práctica</span></div>
      <div class="grid three">
        <div class="field"><div class="label">Título</div><input id="nvc${n}_titulo" class="input"/></div>
        <div class="field"><div class="label">Tipo</div><select id="nvc${n}_tipo">${nvcTypes.map(v=>`<option>${esc(v)}</option>`).join("")}</select></div>
        <div class="field"><div class="label">Tiempo</div><input id="nvc${n}_tiempo" class="input" placeholder="Ej: 5 mins."/></div>
      </div>
      <div class="field"><div class="label">Asignado</div><select id="nvc${n}_asignado"></select></div>
    </div>
  `).join("");
}

function assignableForSmm(n) {
  const tipo = $(`smm${n}_tipo`)?.value || "";
  if (normalize(tipo) === normalize("Discurso")) return filterPeople(canStudentTalk);
  if (normalize(tipo) === normalize("Explique sus creencias")) {
    const circ = $(`smm${n}_circ`)?.value || "";
    if (normalize(circ) === normalize("Discurso")) return filterPeople(canStudentTalk);
    return filterPeople(canStudentScene);
  }
  if (normalize(tipo) === normalize("Análisis con el auditorio")) return filterPeople(canTreasures);
  return filterPeople(canStudentScene);
}

function helperForSmm(n) {
  const tipo = $(`smm${n}_tipo`)?.value || "";
  if (normalize(tipo) === normalize("Discurso") || normalize(tipo) === normalize("Análisis con el auditorio")) return [];
  const assigned = getPerson($( `smm${n}_asignado`)?.value);
  let list = filterPeople(canHelper);
  if (assigned) {
    if (isMale(assigned)) list = list.filter(p => isMale(p));
    if (isFemale(assigned)) list = list.filter(p => isFemale(p));
  }
  return list;
}

function assignableForNvc(n) {
  const tipo = $(`nvc${n}_tipo`)?.value || "";
  if (normalize(tipo) === normalize("Necesidades de la congregación")) return filterPeople(canCongNeeds);
  if (normalize(tipo) === normalize("Video")) return filterPeople(canPreside);
  return filterPeople(canLife);
}

function refreshOptions() {
  setOptions("presidente", filterPeople(canPreside), "Seleccionar presidente");
  setOptions("oracionInicial", filterPeople(canPray), "Seleccionar oración inicial");
  setOptions("oracionFinal", filterPeople(canPray), "Seleccionar oración final");
  setOptions("tesorosAsignado", filterPeople(canTreasures), "Seleccionar hermano");
  setOptions("perlasAsignado", filterPeople(canTreasures), "Seleccionar hermano");
  setOptions("lecturaAsignado", filterPeople(canBibleReading), "Seleccionar lector");
  setOptions("ebcConductor", filterPeople(canEbcConductor), "Seleccionar conductor");
  setOptions("ebcLector", filterPeople(canEbcLector), "Seleccionar lector");

  smmDefs.forEach((n) => {
    setOptions(`smm${n}_asignado`, assignableForSmm(n), "Seleccionar participante");
    setOptions(`smm${n}_ayudante`, helperForSmm(n), "Sin ayudante");
  });
  nvcDefs.forEach((n) => setOptions(`nvc${n}_asignado`, assignableForNvc(n), "Seleccionar hermano"));
}

function bindDynamics() {
  const watch = [];
  smmDefs.forEach((n) => {
    [ `smm${n}_tipo`, `smm${n}_circ`, `smm${n}_asignado`, `smm${n}_ayudante`, `smm${n}_titulo`, `smm${n}_leccion`, `smm${n}_tiempo` ].forEach(id => watch.push(id));
  });
  nvcDefs.forEach((n) => {
    [ `nvc${n}_titulo`, `nvc${n}_tipo`, `nvc${n}_tiempo`, `nvc${n}_asignado` ].forEach(id => watch.push(id));
  });
  ["semana","lecturaSemana","presidente","oracionInicial","introMin","cancionInicial","cancionMedia","cancionFinal","tesorosTema","tesorosAsignado","perlasAsignado","lecturaPasaje","lecturaAsignado","ebcMaterial","ebcConductor","ebcLector","conclusionMin","oracionFinal"].forEach(id=>watch.push(id));
  watch.forEach((id) => $(id)?.addEventListener("input", () => { refreshOptions(); renderPreview(); }));
  watch.forEach((id) => $(id)?.addEventListener("change", () => { refreshOptions(); renderPreview(); }));
}

function collectData() {
  const smm = smmDefs.map((n) => ({
    tipo: $(`smm${n}_tipo`)?.value || "",
    circunstancia: $(`smm${n}_circ`)?.value || "",
    tiempo: $(`smm${n}_tiempo`)?.value || "",
    titulo: $(`smm${n}_titulo`)?.value || "",
    leccion: $(`smm${n}_leccion`)?.value || "",
    asignadoId: $(`smm${n}_asignado`)?.value || "",
    ayudanteId: $(`smm${n}_ayudante`)?.value || "",
  }));
  const nvc = nvcDefs.map((n) => ({
    titulo: $(`nvc${n}_titulo`)?.value || "",
    tipo: $(`nvc${n}_tipo`)?.value || "",
    tiempo: $(`nvc${n}_tiempo`)?.value || "",
    asignadoId: $(`nvc${n}_asignado`)?.value || "",
  }));
  return {
    semana: $("semana")?.value || "",
    lecturaSemana: $("lecturaSemana")?.value || "",
    presidenteId: $("presidente")?.value || "",
    oracionInicialId: $("oracionInicial")?.value || "",
    introMin: $("introMin")?.value || "",
    cancionInicial: $("cancionInicial")?.value || "",
    cancionMedia: $("cancionMedia")?.value || "",
    cancionFinal: $("cancionFinal")?.value || "",
    tesorosTema: $("tesorosTema")?.value || "",
    tesorosAsignadoId: $("tesorosAsignado")?.value || "",
    perlasAsignadoId: $("perlasAsignado")?.value || "",
    lecturaPasaje: $("lecturaPasaje")?.value || "",
    lecturaAsignadoId: $("lecturaAsignado")?.value || "",
    smm,
    nvc,
    ebcMaterial: $("ebcMaterial")?.value || "",
    ebcConductorId: $("ebcConductor")?.value || "",
    ebcLectorId: $("ebcLector")?.value || "",
    conclusionMin: $("conclusionMin")?.value || "",
    oracionFinalId: $("oracionFinal")?.value || "",
  };
}

function fillData(data = {}) {
  ["semana","lecturaSemana","introMin","cancionInicial","cancionMedia","cancionFinal","tesorosTema","lecturaPasaje","ebcMaterial","conclusionMin"].forEach(id=>{
    if ($(id) && data[id] != null) $(id).value = data[id];
  });
  [
    ["presidente", data.presidenteId],
    ["oracionInicial", data.oracionInicialId],
    ["oracionFinal", data.oracionFinalId],
    ["tesorosAsignado", data.tesorosAsignadoId],
    ["perlasAsignado", data.perlasAsignadoId],
    ["lecturaAsignado", data.lecturaAsignadoId],
    ["ebcConductor", data.ebcConductorId],
    ["ebcLector", data.ebcLectorId],
  ].forEach(([id,val])=>{ if ($(id) && val != null) $(id).value = val; });

  smmDefs.forEach((n, idx) => {
    const part = data.smm?.[idx] || {};
    if ($(`smm${n}_tipo`) && part.tipo != null) $(`smm${n}_tipo`).value = part.tipo;
    if ($(`smm${n}_circ`) && part.circunstancia != null) $(`smm${n}_circ`).value = part.circunstancia;
    if ($(`smm${n}_tiempo`) && part.tiempo != null) $(`smm${n}_tiempo`).value = part.tiempo;
    if ($(`smm${n}_titulo`) && part.titulo != null) $(`smm${n}_titulo`).value = part.titulo;
    if ($(`smm${n}_leccion`) && part.leccion != null) $(`smm${n}_leccion`).value = part.leccion;
    if ($(`smm${n}_asignado`) && part.asignadoId != null) $(`smm${n}_asignado`).value = part.asignadoId;
    if ($(`smm${n}_ayudante`) && part.ayudanteId != null) $(`smm${n}_ayudante`).value = part.ayudanteId;
  });

  nvcDefs.forEach((n, idx) => {
    const part = data.nvc?.[idx] || {};
    if ($(`nvc${n}_titulo`) && part.titulo != null) $(`nvc${n}_titulo`).value = part.titulo;
    if ($(`nvc${n}_tipo`) && part.tipo != null) $(`nvc${n}_tipo`).value = part.tipo;
    if ($(`nvc${n}_tiempo`) && part.tiempo != null) $(`nvc${n}_tiempo`).value = part.tiempo;
    if ($(`nvc${n}_asignado`) && part.asignadoId != null) $(`nvc${n}_asignado`).value = part.asignadoId;
  });
}

function linePersona(id) {
  return esc(displayName(getPerson(id)) || "—");
}

function renderPreview() {
  const d = collectData();
  const preview = $("preview");
  if (!preview) return;
  preview.innerHTML = `
    <div class="month-banner" style="padding:12px;">
      <div class="meta">
        <div class="left">Semana del ${esc(fmtAR(d.semana) || '—')}</div>
        <div class="right">${esc(d.lecturaSemana || 'Lectura bíblica sin cargar')}</div>
      </div>
    </div>
    <div class="card mini" style="margin-bottom:10px;">
      <b>Presidente:</b> ${linePersona(d.presidenteId)}<br>
      <b>Oración inicial:</b> ${linePersona(d.oracionInicialId)}<br>
      <b>Oración final:</b> ${linePersona(d.oracionFinalId)}
    </div>
    <div class="card mini" style="margin-bottom:10px;">
      <div><b>Tesoros:</b> ${esc(d.tesorosTema || '—')} · ${linePersona(d.tesorosAsignadoId)}</div>
      <div><b>Perlas:</b> ${linePersona(d.perlasAsignadoId)}</div>
      <div><b>Lectura:</b> ${esc(d.lecturaPasaje || '—')} · ${linePersona(d.lecturaAsignadoId)}</div>
    </div>
    <div class="card mini" style="margin-bottom:10px;">
      <b>Seamos mejores maestros</b>
      <ol style="margin:8px 0 0 18px; padding:0;">
        ${d.smm.map((p)=>`<li><b>${esc(p.tipo || 'Parte')}</b>${p.titulo ? ` · ${esc(p.titulo)}` : ''}<br><span class="small">${linePersona(p.asignadoId)}${p.ayudanteId ? ` · ayudante: ${linePersona(p.ayudanteId)}` : ''}</span></li>`).join('')}
      </ol>
    </div>
    <div class="card mini" style="margin-bottom:10px;">
      <b>Nuestra vida cristiana</b>
      <ol style="margin:8px 0 0 18px; padding:0;">
        ${d.nvc.map((p)=>`<li><b>${esc(p.titulo || 'Parte')}</b> · ${esc(p.tipo || '—')}<br><span class="small">${linePersona(p.asignadoId)}</span></li>`).join('')}
      </ol>
    </div>
    <div class="card mini">
      <div><b>EBC:</b> ${esc(d.ebcMaterial || '—')}</div>
      <div><b>Conductor:</b> ${linePersona(d.ebcConductorId)}</div>
      <div><b>Lector:</b> ${linePersona(d.ebcLectorId)}</div>
    </div>
  `;

  const print = $("printVmc");
  if (print) {
    print.innerHTML = `
      <div class="card pad" style="box-shadow:none; border:none;">
        <h1 class="print-title">Vida y Ministerio Cristianos</h1>
        <div style="text-align:center; font-weight:700; margin-bottom:12px;">Semana del ${esc(fmtAR(d.semana) || '—')} · ${esc(d.lecturaSemana || '')}</div>
        <table class="table board">
          <tbody>
            <tr><th colspan="2">Encabezado</th></tr>
            <tr><td>Presidente</td><td>${linePersona(d.presidenteId)}</td></tr>
            <tr><td>Oración inicial</td><td>${linePersona(d.oracionInicialId)}</td></tr>
            <tr><td>Canciones</td><td>${esc(d.cancionInicial || '—')} / ${esc(d.cancionMedia || '—')} / ${esc(d.cancionFinal || '—')}</td></tr>
            <tr><th colspan="2">Tesoros de la Biblia</th></tr>
            <tr><td>Discurso</td><td>${esc(d.tesorosTema || '—')} · ${linePersona(d.tesorosAsignadoId)}</td></tr>
            <tr><td>Perlas escondidas</td><td>${linePersona(d.perlasAsignadoId)}</td></tr>
            <tr><td>Lectura de la Biblia</td><td>${esc(d.lecturaPasaje || '—')} · ${linePersona(d.lecturaAsignadoId)}</td></tr>
            <tr><th colspan="2">Seamos mejores maestros</th></tr>
            ${d.smm.map((p, i)=>`<tr><td>${i+1}. ${esc(p.tipo || 'Parte')}</td><td>${esc(p.titulo || '—')} · ${linePersona(p.asignadoId)}${p.ayudanteId ? ` · ayudante: ${linePersona(p.ayudanteId)}` : ''}</td></tr>`).join('')}
            <tr><th colspan="2">Nuestra vida cristiana</th></tr>
            ${d.nvc.map((p, i)=>`<tr><td>${i+1}. ${esc(p.titulo || 'Parte')}</td><td>${esc(p.tipo || '—')} · ${linePersona(p.asignadoId)}</td></tr>`).join('')}
            <tr><th colspan="2">Estudio bíblico de la congregación</th></tr>
            <tr><td>Material</td><td>${esc(d.ebcMaterial || '—')}</td></tr>
            <tr><td>Conductor</td><td>${linePersona(d.ebcConductorId)}</td></tr>
            <tr><td>Lector</td><td>${linePersona(d.ebcLectorId)}</td></tr>
            <tr><td>Oración final</td><td>${linePersona(d.oracionFinalId)}</td></tr>
          </tbody>
        </table>
      </div>`;
  }
}

async function cargarPersonas() {
  const snap = await getDocs(collection(db, "personas"));
  personas = snap.docs.map((d) => ({ id: d.id, ...d.data() })).filter((p) => p?.nombre);
}

async function cargarSemana() {
  const semana = $("semana")?.value || "";
  if (!semana) return setStatus("Elegí una semana.", true);
  const snap = await getDoc(doc(db, "vmc_semanal", semana));
  if (!snap.exists()) {
    setStatus("No había datos guardados para esa semana. Podés cargarla ahora.");
    refreshOptions();
    renderPreview();
    return;
  }
  fillData({ semana, ...snap.data() });
  refreshOptions();
  renderPreview();
  setStatus(`Semana ${fmtAR(semana)} cargada.`);
}

function limpiarFormulario() {
  const semana = $("semana")?.value || upcomingThursdayISO();
  document.querySelectorAll("input.input").forEach((el) => {
    if (el.id === "semana") return;
    el.value = "";
  });
  document.querySelectorAll("select").forEach((el) => {
    if (el.id === "semana") return;
    el.selectedIndex = 0;
  });
  $("semana").value = semana;
  $("introMin").value = "1 min";
  $("conclusionMin").value = "3 min";
  refreshOptions();
  renderPreview();
  setStatus("Formulario limpio.");
}

async function guardarSemana() {
  const data = collectData();
  if (!data.semana) return setStatus("Falta la semana.", true);
  if (!data.presidenteId) return setStatus("Elegí el presidente.", true);
  try {
    await setDoc(doc(db, "vmc_semanal", data.semana), {
      ...data,
      updatedAt: serverTimestamp(),
    }, { merge: true });
    setStatus(`VMC guardado para la semana ${fmtAR(data.semana)}.`);
  } catch (e) {
    console.error(e);
    setStatus("No pude guardar. Revisá permisos de Firestore.", true);
  }
}

(async function init(){
  buildSmmCards();
  buildNvcCards();
  const { usuario } = await requireActiveUser("vmc");
  isAdmin = ["admin","superadmin","editor"].includes(normalize(usuario?.rol));
  await cargarPersonas();
  $("semana").value = upcomingThursdayISO();
  $("introMin").value = "1 min";
  $("conclusionMin").value = "3 min";
  refreshOptions();
  bindDynamics();
  renderPreview();
  await cargarSemana();

  if (!isAdmin) {
    document.querySelectorAll("input, select, textarea, button#btnGuardar, button#btnLimpiar").forEach((el)=>{
      if (el.id === "btnCargar" || el.id === "btnImprimir" || el.id === "btnEstaSemana" || el.id === "btnAnterior" || el.id === "btnSiguiente") return;
      if (el.id === "semana") return;
      el.disabled = true;
    });
    setStatus("Modo solo lectura: podés ver e imprimir, pero no editar.");
  }

  $("btnEstaSemana")?.addEventListener("click", ()=>{ $("semana").value = upcomingThursdayISO(); cargarSemana(); });
  $("btnAnterior")?.addEventListener("click", ()=>{ $("semana").value = shiftWeekISO($("semana").value || upcomingThursdayISO(), -1); cargarSemana(); });
  $("btnSiguiente")?.addEventListener("click", ()=>{ $("semana").value = shiftWeekISO($("semana").value || upcomingThursdayISO(), 1); cargarSemana(); });
  $("btnCargar")?.addEventListener("click", cargarSemana);
  $("btnLimpiar")?.addEventListener("click", limpiarFormulario);
  $("btnGuardar")?.addEventListener("click", guardarSemana);
  $("btnImprimir")?.addEventListener("click", ()=>{
    document.body.classList.add("print-vmc");
    window.print();
    setTimeout(()=>document.body.classList.remove("print-vmc"), 300);
  });
})();
