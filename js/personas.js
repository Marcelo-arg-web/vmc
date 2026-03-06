import { qs, qsa, debounce, normalizeName } from "./app.js";
import { mountHeader } from "./ui_common.js";
import { loadPeople, savePerson, deletePerson } from "./data.js";

mountHeader();

let people = [];
let filtered = [];
let currentId = null;
let currentIndex = -1;
let originalName = "";

const CAP_KEYS = ["presidir","orar","tesoros","perlas","lecturaBiblia","estudiante","ayudante","discursoEstudiante","vidaCristiana","necesidades","conductorEbc","lectorEbc"];

function stripAccents(s){ return (s||"").normalize("NFD").replace(/[\u0300-\u036f]/g, ""); }
function guessSexByName(fullName){
  const n = normalizeName(fullName||"");
  const first = stripAccents((n.split(" ")[0]||"")).toLowerCase();
  const fem = new Set(["erica","paola","carmen","gloria","belen","elida","ruth","carla","maria","ana","maricel","maricela"]);
  const masc = new Set(["marcelo","sergio","leonardo","luis","eduardo","hugo","omar","epifanio","roberto","rodolfo","david","emanuel","martin","braian","brian","isaias","facundo"]);
  if(fem.has(first)) return "M";
  if(masc.has(first)) return "H";
  if(first.endsWith("a") && !["isaias","elias","matias","luca"].includes(first)) return "M";
  return "";
}


function findExistingByName(name){
  const target = normalizeName(name || "").toLowerCase();
  if(!target) return null;
  return people.find(p => normalizeName(p.name || "").toLowerCase() === target) || null;
}

function showList(v){
  qs("#listCard").style.display = v ? "block" : "none";
  qs("#btnShowList").style.display = v ? "none" : "inline-flex";
}

function getCanFromForm(){
  const can = {};
  for(const key of CAP_KEYS){ can[key] = !!qs(`#can_${key}`).checked; }
  return can;
}

function setCanToForm(can={}){
  for(const key of CAP_KEYS){ qs(`#can_${key}`).checked = !!can[key]; }
}

function clearForm(){
  currentId = null;
  currentIndex = -1;
  qs("#formTitle").textContent = "Agregar persona";
  qs("#personForm").reset();
  qs("#active").checked = true;
  setCanToForm({});
  originalName = "";
  qs("#btnDelete").style.display = "none";
  qs("#btnCancel").style.display = "none";
  qs("#btnSubmit").textContent = "Agregar persona";
  updateNavInfo();
}

function fillForm(p){
  currentId = p.id;
  currentIndex = filtered.findIndex(x=>x.id === p.id);
  qs("#formTitle").textContent = "Editar persona";
  originalName = p.name || "";
  qs("#name").value = p.name || "";
  qs("#familyGroup").value = p.familyGroup || "";
  qs("#sex").value = p.sex || "";
  qs("#role").value = p.role || "";
  qs("#student").checked = !!p.student;
  qs("#approved").checked = !!p.approved;
  qs("#spouseOnly").checked = !!p.spouseOnly;
  qs("#active").checked = p.active !== false;
  qs("#notes").value = p.notes || "";
  setCanToForm(p.can || {});
  qs("#btnDelete").style.display = "inline-flex";
  qs("#btnCancel").style.display = "inline-flex";
  qs("#btnSubmit").textContent = "Guardar cambios";
  updateNavInfo();
}

function updateDatalist(){
  qs("#datalistName").innerHTML = people.map(p=>`<option value="${p.name.replace(/"/g,"&quot;")}"></option>`).join("");
}

function renderTable(){
  const q = stripAccents((qs("#search").value||"").toLowerCase());
  filtered = people.filter(p => stripAccents(`${p.name} ${p.role||""} ${p.notes||""}`).toLowerCase().includes(q));
  const tb = qs("#tblPeople tbody");
  tb.innerHTML = "";
  for(const p of filtered){
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${p.name||""}</td>
      <td>${p.sex||""}</td>
      <td>${p.role||""}</td>
      <td>${p.active===false?"No":"Sí"}</td>
      <td>${p.notes||""}</td>
      <td><button data-edit="${p.id}" class="ghost" type="button">Editar</button></td>`;
    tb.appendChild(tr);
  }
  qsa("[data-edit]").forEach(btn=>btn.addEventListener("click", ()=>{
    const p = people.find(x=>x.id===btn.dataset.edit);
    if(p){ fillForm(p); window.scrollTo({top:0, behavior:"smooth"}); }
  }));
  updateNavInfo();
}

function updateNavInfo(){
  if(currentIndex >= 0) qs("#navInfo").textContent = `${currentIndex+1} / ${filtered.length || people.length || 1}`;
  else qs("#navInfo").textContent = `${filtered.length || people.length || 0} cargados`;
}

function statusText(s){
  qs("#status").textContent = s;
}

function goPrev(){
  if(!filtered.length) return;
  const idx = currentIndex <= 0 ? filtered.length - 1 : currentIndex - 1;
  fillForm(filtered[idx]);
}
function goNext(){
  if(!filtered.length) return;
  const idx = currentIndex < 0 || currentIndex >= filtered.length - 1 ? 0 : currentIndex + 1;
  fillForm(filtered[idx]);
}

async function reload(){
  people = await loadPeople();
  updateDatalist();
  renderTable();
  qs("#status").textContent = `${people.length} personas`;
}

qs("#name").addEventListener("blur", ()=>{
  const entered = qs("#name").value;
  if(!qs("#sex").value){
    const g = guessSexByName(entered);
    if(g) qs("#sex").value = g;
  }
  const existing = findExistingByName(entered);
  if(existing && existing.id !== currentId){
    fillForm(existing);
    statusText(`Ese nombre ya existe. Abrí la persona cargada para editarla.`);
  }
});

qs("#name").addEventListener("input", ()=>{
  const typed = qs("#name").value;
  const existing = findExistingByName(typed);
  if(existing && existing.id !== currentId){
    qs("#btnSubmit").textContent = "Guardar cambios";
    statusText("Ese nombre ya existe. Se editará la persona cargada, no se duplicará.");
    return;
  }
  if(currentId){
    qs("#btnSubmit").textContent = "Guardar cambios";
  }else{
    qs("#btnSubmit").textContent = "Agregar persona";
  }
});

qs("#personForm").addEventListener("submit", async (e)=>{
  e.preventDefault();
  const duplicate = findExistingByName(qs("#name").value);
  const editingExisting = duplicate && duplicate.id !== currentId ? duplicate.id : currentId;
  const addingMode = !editingExisting;
  const person = {
    id: editingExisting || null,
    name: qs("#name").value,
    familyGroup: qs("#familyGroup").value,
    sex: qs("#sex").value,
    role: qs("#role").value,
    student: qs("#student").checked,
    approved: qs("#approved").checked,
    spouseOnly: qs("#spouseOnly").checked,
    active: qs("#active").checked,
    can: getCanFromForm(),
    notes: qs("#notes").value
  };
  if(!normalizeName(person.name)){ alert("Escribí el nombre."); return; }
  if(duplicate && duplicate.id !== currentId){
    statusText("Ese nombre ya existía. Se guardaron cambios sobre la persona existente.");
  }
  await savePerson(person);
  await reload();
  if(addingMode){
    clearForm();
    qs("#name").focus();
    statusText(`Agregado: ${normalizeName(person.name)}`);
  }else{
    const saved = people.find(p=>p.id === person.id) || people.find(p=>p.name === normalizeName(person.name));
    if(saved) fillForm(saved); else clearForm();
    statusText(`Actualizado: ${normalizeName(person.name)}`);
  }
});

qs("#btnDelete").addEventListener("click", async ()=>{
  if(!currentId) return;
  if(!confirm("¿Eliminar esta persona?")) return;
  await deletePerson(currentId);
  clearForm();
  await reload();
});
qs("#btnCancel").addEventListener("click", clearForm);
qs("#btnNew").addEventListener("click", ()=>{ clearForm(); qs("#name").focus(); statusText("Modo agregar: cargá la nueva persona."); });
qs("#btnPrev").addEventListener("click", goPrev);
qs("#btnNext").addEventListener("click", goNext);
qs("#btnShowList").addEventListener("click", ()=>showList(true));
qs("#btnToggleList").addEventListener("click", ()=>showList(false));
qs("#search").addEventListener("input", debounce(renderTable, 150));

reload().then(clearForm);
