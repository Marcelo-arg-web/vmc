import { qs, debounce, normalizeName } from "./app.js";
import { mountHeader } from "./ui_common.js";
import { loadPeople, savePerson, deletePerson } from "./data.js";

mountHeader();

let people = [];
let currentIndex = -1;
let editingId = null;

const form = qs("#personForm");
const tblBody = qs("#tblPeople tbody");
const datalist = qs("#datalistName");
const statusEl = qs("#status");
const navInfo = qs("#navInfo");

function stripAccents(s){ return (s || "").normalize("NFD").replace(/[\u0300-\u036f]/g, ""); }
function byId(id){ return people.find(p => p.id === id); }

function guessSexByName(fullName){
  const n = normalizeName(fullName || "");
  const first = stripAccents((n.split(/[ ,]+/)[0] || "")).toLowerCase();
  const fem = new Set(["erica","paola","carmen","gloria","belen","elida","ruth","carla","maria","ana","maricel","maricela","graciela","silvia","viviana","rosa","claudia"]);
  const masc = new Set(["marcelo","sergio","leonardo","luis","eduardo","hugo","omar","epifanio","roberto","rodolfo","david","emanuel","martin","braian","brian","isaias","facundo","juan","daniel"]);
  if (fem.has(first)) return "M";
  if (masc.has(first)) return "H";
  if (first.endsWith("a") && !["elias","isaias","matias","luca"].includes(first)) return "M";
  return "";
}

function getFormData(){
  return {
    id: editingId,
    name: normalizeName(qs("#name").value),
    sex: qs("#sex").value,
    role: qs("#role").value,
    student: qs("#student").checked,
    approved: qs("#approved").checked,
    spouseOnly: qs("#spouseOnly").checked,
    active: qs("#active").checked,
    can: {
      presidir: qs("#puedePresidir").checked,
      oracion: qs("#puedeOracion").checked,
      tesoros: qs("#puedeTesoros").checked,
      perlas: qs("#puedePerlas").checked,
      lecturaBiblia: qs("#puedeLecturaBiblia").checked,
      vidaCristiana: qs("#puedeVidaCristiana").checked,
      ebcConductor: qs("#puedeEBCConductor").checked,
      ebcLector: qs("#puedeEBCLector").checked,
      discursoEstudiante: qs("#puedeDiscursoEstudiante").checked,
      expliqueDiscurso: qs("#puedeExpliqueDiscurso").checked,
      necesidades: qs("#puedeNecesidades").checked,
    },
    notes: qs("#notes").value.trim(),
  };
}

function setChecks(can = {}){
  qs("#puedePresidir").checked = !!can.presidir;
  qs("#puedeOracion").checked = !!can.oracion;
  qs("#puedeTesoros").checked = !!can.tesoros;
  qs("#puedePerlas").checked = !!can.perlas;
  qs("#puedeLecturaBiblia").checked = !!can.lecturaBiblia;
  qs("#puedeVidaCristiana").checked = !!can.vidaCristiana;
  qs("#puedeEBCConductor").checked = !!can.ebcConductor;
  qs("#puedeEBCLector").checked = !!can.ebcLector;
  qs("#puedeDiscursoEstudiante").checked = !!can.discursoEstudiante;
  qs("#puedeExpliqueDiscurso").checked = !!can.expliqueDiscurso;
  qs("#puedeNecesidades").checked = !!can.necesidades;
}

function setFormData(person = null){
  editingId = person?.id || null;
  qs("#formTitle").textContent = editingId ? "Editar persona" : "Agregar persona";
  qs("#btnCancel").style.display = editingId ? "inline-flex" : "none";
  qs("#name").value = person?.name || "";
  qs("#sex").value = person?.sex || "";
  qs("#role").value = person?.role || "";
  qs("#student").checked = !!person?.student;
  qs("#approved").checked = !!person?.approved;
  qs("#spouseOnly").checked = !!person?.spouseOnly;
  qs("#active").checked = person ? person.active !== false : true;
  setChecks(person?.can || {});
  qs("#notes").value = person?.notes || "";
}

function clearForm(){
  setFormData(null);
  currentIndex = -1;
  updateNavInfo();
}

function updateNavInfo(){
  if (!people.length) navInfo.textContent = "Sin personas cargadas";
  else if (currentIndex < 0) navInfo.textContent = `${people.length} personas cargadas`;
  else navInfo.textContent = `${currentIndex + 1} de ${people.length}`;
}

function applyPresetByRole(){
  const role = qs("#role").value;
  const sex = qs("#sex").value;
  if (role === "Anciano"){
    qs("#approved").checked = true;
    setChecks({ presidir:true, oracion: sex === "H", tesoros:true, perlas:true, lecturaBiblia: sex === "H", vidaCristiana:true, ebcConductor:true, ebcLector: sex === "H", necesidades:true, discursoEstudiante: sex === "H", expliqueDiscurso: sex === "H" });
  } else if (role === "Siervo Ministerial"){
    qs("#approved").checked = true;
    setChecks({ oracion: sex === "H", tesoros:true, perlas:true, lecturaBiblia: sex === "H", vidaCristiana:true, ebcConductor:true, ebcLector: sex === "H", discursoEstudiante: sex === "H", expliqueDiscurso: sex === "H" });
  }
}

function renderDatalist(list = people){
  datalist.innerHTML = list.map(p => `<option value="${p.name.replace(/"/g, '&quot;')}"></option>`).join("");
}

function renderTable(list = people){
  tblBody.innerHTML = "";
  for (const p of list){
    const tr = document.createElement("tr");
    tr.innerHTML = `<td>${p.name || ""}</td><td>${p.sex || ""}</td><td>${p.role || ""}</td><td>${p.student ? "Sí" : "—"}</td><td>${p.approved ? "Sí" : "—"}</td><td>${p.active === false ? "No" : "Sí"}</td><td><div class="row"><button type="button" class="ghost" data-edit="${p.id}">Editar</button><button type="button" class="danger" data-del="${p.id}">Borrar</button></div></td>`;
    tblBody.appendChild(tr);
  }
  tblBody.querySelectorAll('[data-edit]').forEach(btn => btn.addEventListener('click', () => {
    const idx = people.findIndex(p => p.id === btn.dataset.edit);
    currentIndex = idx;
    setFormData(byId(btn.dataset.edit));
    updateNavInfo();
    window.scrollTo({ top:0, behavior:'smooth' });
  }));
  tblBody.querySelectorAll('[data-del]').forEach(btn => btn.addEventListener('click', async () => {
    const person = byId(btn.dataset.del);
    if (!person) return;
    if (!confirm(`¿Borrar a ${person.name}?`)) return;
    await deletePerson(person.id);
    await refresh();
    statusEl.textContent = 'Persona borrada.';
  }));
}

function showList(show){
  qs('#listCard').style.display = show ? 'block' : 'none';
  qs('#btnShowList').style.display = show ? 'none' : 'inline-flex';
}

function goPrev(){
  if (!people.length) return;
  currentIndex = currentIndex <= 0 ? people.length - 1 : currentIndex - 1;
  setFormData(people[currentIndex]);
  updateNavInfo();
}
function goNext(){
  if (!people.length) return;
  currentIndex = currentIndex < 0 || currentIndex >= people.length - 1 ? 0 : currentIndex + 1;
  setFormData(people[currentIndex]);
  updateNavInfo();
}

async function refresh(){
  people = await loadPeople();
  renderDatalist();
  renderTable();
  updateNavInfo();
}

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  const data = getFormData();
  if (!data.name){ statusEl.textContent = 'Poné el nombre.'; return; }
  await savePerson(data);
  await refresh();
  statusEl.textContent = editingId ? 'Persona actualizada.' : 'Persona guardada.';
  const idx = people.findIndex(p => p.id === editingId || p.name === data.name);
  currentIndex = idx;
  if (idx >= 0) setFormData(people[idx]);
  updateNavInfo();
});

qs('#btnCancel').addEventListener('click', clearForm);
qs('#role').addEventListener('change', applyPresetByRole);
qs('#sex').addEventListener('change', applyPresetByRole);
qs('#name').addEventListener('blur', () => {
  if (!qs('#sex').value){
    const g = guessSexByName(qs('#name').value);
    if (g) qs('#sex').value = g;
  }
  const found = people.find(p => stripAccents(p.name).toLowerCase() === stripAccents(qs('#name').value).toLowerCase());
  if (found){
    currentIndex = people.findIndex(p => p.id === found.id);
    setFormData(found);
    updateNavInfo();
  }
});

qs('#search').addEventListener('input', debounce(() => {
  const q = stripAccents(qs('#search').value).toLowerCase().trim();
  if (!q) return renderTable(people);
  renderTable(people.filter(p => stripAccents(`${p.name} ${p.role} ${p.notes || ''}`).toLowerCase().includes(q)));
}, 120));
qs('#btnPrev').addEventListener('click', goPrev);
qs('#btnNext').addEventListener('click', goNext);
qs('#btnShowList').addEventListener('click', () => showList(true));
qs('#btnToggleList').addEventListener('click', () => showList(false));

showList(false);
clearForm();
refresh().catch(err => { statusEl.textContent = 'Error cargando personas: ' + (err?.message || err); });
