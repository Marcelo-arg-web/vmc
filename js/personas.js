import { qs, qsa, debounce, normalizeName } from "./app.js";
import { mountHeader } from "./ui_common.js";
import { loadPeople, savePerson, deletePerson } from "./data.js";

mountHeader();


function stripAccents(s){
  return (s||"").normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}
function guessSexByName(fullName){
  const n = normalizeName(fullName||"");
  const first = stripAccents((n.split(" ")[0]||"")).toLowerCase();
  const fem = new Set([
    "erica","érica","paola","carmen","gloria","belen","belén","elida","élida","ruth","carla","maria","maría","ana","maricel","maricela"
  ]);
  const masc = new Set([
    "marcelo","sergio","leonardo","luis","eduardo","hugo","omar","epifanio","roberto","rodolfo","david","emanuel","martin","martín","braian","brian","isaias","isaías","facundo"
  ]);
  if(fem.has(first)) return "M";
  if(masc.has(first)) return "H";
  if(first.endsWith("a") && !["isaias","isaías","elias","matias","matías","luca"].includes(first)) return "M";
  return "";
}


const SEED_PEOPLE = [
  "Erica Paola Araya",
  "Leonardo Araya",
  "Carmen Ayaviri",
  "Gloria Campos",
  "Belén Correa",
  "Elida Correa",
  "Ruth Correa",
  "Carla García",
  "José Roberto Lazarte",
  "María Lazarte",
  "Maricel Lazarte",
  "Ramona Medina",
  "Cecilia Navarro",
  "Marcelo Palavecino",
  "Yesica Magalí Palavecino",
  "Epifanio Pedraza",
  "Juana Pedraza",
  "María Teresa Pedraza",
  "Sonia Pedraza",
  "Gabriela Pérez",
  "Marta Ponce",
  "Carlos Rodríguez",
  "Rebeca Rodríguez",
  "Paola Saldaña",
  "Sergio Saldaña",
  "Abigail Salica",
  "Aimé Salinas",
  "Omar Santucho",
  "Rodolfo Santucho",
  "Maira Díaz",
  "Nelson Díaz",
  "María Frías",
  "Carlos Gutiérrez",
  "Luciana Gutiérrez",
  "Sofía Gutiérrez",
  "Lucrecia Juárez",
  "Lucía Navarro",
  "Luis Navarro",
  "Maximiliano Navarro",
  "Sofía Navarro",
  "María Pérez",
  "Nora Pérez",
  "Antonella Salica",
  "David Salica",
  "Emmanuel Salica",
  "Braian Torres",
  "Luz Torres",
  "Alicia Ávila",
  "Irma Correa",
  "Hugo García",
  "Rosa Pedraza",
  "Stella Pedraza",
  "Ramona Pérez",
  "Estefanía Pérez",
  "Alfonsina Zerda",
  "Lorena Zerda",
  "Martín Zerda jr",
  "Martín Zerda",
  "Olivia Zerda",
  "Ramón Arancibia",
  "Silvia Arancibia",
  "Alicia Correa",
  "Miguel Gómez",
  "Geraldine Pereira",
  "Inés Pereyra",
  "Adriana Reinoso",
  "Alejandra Reinoso",
  "Facundo Reinoso",
  "Ramiro Reinoso",
  "Jael Salinas",
  "Eduar Jabez Salinas",
  "Emilia Salinas",
  "Josías Misael Salinas",
  "Silvina Salinas",
  "Beatriz Shell",
  "Isaías Shell",
  "Ayelén Soria",
  "Rita Véliz",
  "Erika Campero",
  "Mical Jiménez",
  "Mónica Jiménez",
  "Cristina Lazarte",
  "José Lazarte",
  "Luisiana Lazarte",
  "Ramona Lazarte",
  "Sergio Lazarte",
  "Braian Rivadeneira",
  "Eduardo Rivadeneira",
  "María Rivadeneira",
  "Melani Rivadeneira",
  "Florencia Saldaña",
  "Romina Saldaña"
];

async function seedAll(){
  const msgEl = qs("#seedMsg");
  msgEl.textContent = "Cargando lista...";
  const current = await loadPeople();
  const existing = new Set(current.map(p=> normalizeName((p.nombre || p.name || "")).toLowerCase()));
  let addedCount = 0;

  for(const nombre of SEED_PEOPLE){
    const key = normalizeName(nombre).toLowerCase();
    if(existing.has(key)) continue;

    await savePerson({
      name: nombre,
      sex: "",
      role: "publicador",
      student: true,
      active: true,
      approved: false,
      spouseOnly: false,
      can: {},
      notes: ""
    });

    addedCount++;
    existing.add(key);
  }

  msgEl.textContent = "Listo. Agregados: " + addedCount + ". (Los existentes no se duplicaron)";
  people = await loadPeople();
  render();
  updateDatalist();
  updateNavInfo();
  updateDatalist();
  updateNavInfo();
  const btnPrev = qs('#btnPrev'); if(btnPrev) btnPrev.addEventListener('click', (e)=>{e.preventDefault(); goPrev();});
  const btnNext = qs('#btnNext'); if(btnNext) btnNext.addEventListener('click', (e)=>{e.preventDefault(); goNext();});
  const btnToggle = qs('#btnToggleList'); if(btnToggle) btnToggle.addEventListener('click', (e)=>{e.preventDefault(); toggleList();});
  const search = qs('#search'); if(search){
    search.addEventListener('input', ()=>{ currentIndex = 0; updateNavInfo(); });
    search.addEventListener('change', ()=>{ currentIndex = 0; const list = filteredPeople(); if(list[0]) fillForm(list[0]); updateNavInfo(); });
  }

}

const btnSeed = qs("#btnSeedAll");
if(btnSeed){
  btnSeed.addEventListener("click", async ()=>{
    if(!confirm("¿Cargar la lista completa? (Solo hace falta una vez)")) return;
    try{
      await seedAll();
    }catch(e){
      console.error(e);
      qs("#seedMsg").textContent = "Error al cargar la lista: " + (e?.message || e);
    }
  });
}


const tbl = qs("#tblPeople tbody");
const form = qs("#personForm");
let people = [];
let currentIndex = -1;

function filteredPeople(){
  const q = (qs("#search")?.value || "").trim().toLowerCase();
  if(!q) return people.slice().sort((a,b)=> (a.name||"").localeCompare(b.name||"", "es", {sensitivity:"base"}));
  return people
    .filter(p => ((p.name||"").toLowerCase().includes(q)))
    .sort((a,b)=> (a.name||"").localeCompare(b.name||"", "es", {sensitivity:"base"}));
}

function updateDatalist(){
  const dl = qs("#datalistPeople");
  if(!dl) return;
  const list = people.slice().sort((a,b)=> (a.name||"").localeCompare(b.name||"", "es", {sensitivity:"base"}));
  dl.innerHTML = list.map(p=> `<option value="${p.name}"></option>`).join("");
}

function setCurrentById(id){
  const list = filteredPeople();
  const idx = list.findIndex(p=>p.id===id);
  if(idx>=0){
    currentIndex = idx;
    fillForm(list[idx]);
    updateNavInfo();
  }
}

function updateNavInfo(){
  const info = qs("#navInfo");
  if(!info) return;
  const list = filteredPeople();
  if(list.length===0){
    info.textContent = "0 resultados";
    return;
  }
  if(currentIndex<0) currentIndex=0;
  if(currentIndex>=list.length) currentIndex=list.length-1;
  const p = list[currentIndex];
  info.textContent = `Mostrando ${currentIndex+1} de ${list.length}: ${p.name}`;
}

function goPrev(){
  const list = filteredPeople();
  if(list.length===0) return;
  if(currentIndex<0) currentIndex=0;
  currentIndex = (currentIndex-1 + list.length) % list.length;
  fillForm(list[currentIndex]);
  updateNavInfo();
}

function goNext(){
  const list = filteredPeople();
  if(list.length===0) return;
  if(currentIndex<0) currentIndex=0;
  currentIndex = (currentIndex+1) % list.length;
  fillForm(list[currentIndex]);
  updateNavInfo();
}

function toggleList(){
  const el = qs("#tableBox") || qs("#table");
  if(!el) return;
  const show = (el.style.display === "none" || !el.style.display);
  el.style.display = show ? "" : "none";
}

let editingId = null;

function render(){
  const q = qs("#search").value.trim().toLowerCase();
  tbl.innerHTML = "";
  const filtered = people.filter(p=>(p.name||"").toLowerCase().includes(q));
  for(const p of filtered){
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${p.name||""}</td>
      <td>${p.sex||""}</td>
      <td>${p.role||""}</td>
      <td>${p.student ? "Sí":"No"}</td>
      <td>${p.approved ? "Sí":"No"}</td>
      <td>${p.active===false ? "No":"Sí"}</td>
      <td>
        <button class="ghost" data-edit="${p.id}">Editar</button>
        <button class="danger" data-del="${p.id}">Eliminar</button>
      </td>
    `;
    tbl.appendChild(tr);
  }
  qsa("[data-edit]").forEach(b=>b.addEventListener("click", ()=>startEdit(b.dataset.edit)));
  qsa("[data-del]").forEach(b=>b.addEventListener("click", async ()=>{
    const id=b.dataset.del;
    const p=people.find(x=>x.id===id);
    if(confirm(`¿Eliminar a ${p?.name||"esta persona"}?`)){
      await deletePerson(id);
      await refresh();
    }
  }));
}

async function refresh(){
  qs("#status").textContent = "Cargando...";
  people = await loadPeople();
  qs("#status").textContent = people.length ? `${people.length} personas` : "Sin datos";
  render();
}

function fillForm(p){
  qs("#name").value = p?.name||"";
  qs("#sex").value = p?.sex||"";
  qs("#role").value = p?.role||"";
  qs("#student").checked = !!p?.student;
  qs("#approved").checked = !!p?.approved;
  qs("#active").checked = p?.active !== false;
  qs("#spouseOnly").checked = !!p?.spouseOnly;
  qs("#notes").value = p?.notes||"";
}

function startEdit(id){
  const p = people.find(x=>x.id===id);
  editingId = id;
  qs("#formTitle").textContent = "Editar persona";
  fillForm(p);
  qs("#btnCancel").style.display="inline-flex";
  window.scrollTo({top:0, behavior:"smooth"});
}

qs("#btnCancel").addEventListener("click", ()=>{
  editingId=null;
  qs("#formTitle").textContent = "Agregar persona";
  fillForm(null);
  qs("#btnCancel").style.display="none";
});

form.addEventListener("submit", async (e)=>{
  e.preventDefault();
  const name = normalizeName(qs("#name").value);
  if(!name){ alert("Nombre requerido"); return; }
  const person = {
    id: editingId,
    name,
    sex: qs("#sex").value,
    role: qs("#role").value,
    student: qs("#student").checked,
    approved: qs("#approved").checked,
    active: qs("#active").checked,
    spouseOnly: qs("#spouseOnly").checked,
    can: {
      presidir: qs("#puedePresidir")?.checked || false,
      oracion: qs("#puedeOracion")?.checked || false,
      tesoros: qs("#puedeTesoros")?.checked || false,
      perlas: qs("#puedePerlas")?.checked || false
    },
    notes: qs("#notes").value
  };
  // Evitar duplicados (mismo nombre normalizado)
  const key = normalizeName(person.name).toLowerCase();
  const dup = people.find(x => x.id !== person.id && normalizeName(x.name).toLowerCase() === key);
  if(dup){
    alert('Ya existe un nombre igual o muy parecido: ' + dup.name + '.\nSi es la misma persona, editá esa.');
    return;
  }
  await savePerson(person);
  editingId=null;
  qs("#formTitle").textContent = "Agregar persona";
  qs("#btnCancel").style.display="none";
  fillForm(null);
  await refresh();
});

qs("#search").addEventListener("input", debounce(render, 100));

refresh();

async function repairSeed(){
  const msgEl = qs("#seedMsg");
  msgEl.textContent = "Reparando (borrando vacíos)...";

  const current = await loadPeople();
  const empty = current.filter(p => !((p.name || "").trim()));
  for(const p of empty){
    await deletePerson(p.id);
  }

  msgEl.textContent = `Borrados vacíos: ${empty.length}. Ahora recargando lista...`;
  await seedAll();
}

const btnRepair = qs("#btnRepairSeed");
if(btnRepair){
  btnRepair.addEventListener("click", async ()=>{
    if(!confirm("Esto borra registros de personas SIN nombre y vuelve a cargar la lista completa. ¿Continuar?")) return;
    try{
      await repairSeed();
    }catch(e){
      console.error(e);
      qs("#seedMsg").textContent = "Error al reparar: " + (e?.message || e);
    }
  });
}


// Sugerencia automática de sexo (editable)
qs("#name").addEventListener("blur", ()=>{
  if(qs("#sex").value) return;
  const g = guessSexByName(qs("#name").value);
  if(g) qs("#sex").value = g;
});
