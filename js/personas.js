import { qs, qsa, debounce, normalizeName } from "./app.js";
import { mountHeader } from "./ui_common.js";
import { loadPeople, savePerson, deletePerson } from "./data.js";

mountHeader();

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
      nombre,
      sexo: "",
      rol: "publicador",
      estado: "activo",
      aprobado: false
    });

    addedCount++;
    existing.add(key);
  }

  msgEl.textContent = "Listo. Agregados: " + addedCount + ". (Los existentes no se duplicaron)";
  people = await loadPeople();
  render();
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
