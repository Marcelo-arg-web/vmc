import { qs, qsa, debounce, normalizeName } from "./app.js";
import { mountHeader } from "./ui_common.js";
import { loadPeople, savePerson, deletePerson } from "./data.js";

mountHeader();

const tbl = qs("#tblPeople tbody");
const form = qs("#personForm");
let people = [];
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
    notes: qs("#notes").value
  };
  await savePerson(person);
  editingId=null;
  qs("#formTitle").textContent = "Agregar persona";
  qs("#btnCancel").style.display="none";
  fillForm(null);
  await refresh();
});

qs("#search").addEventListener("input", debounce(render, 100));

refresh();
