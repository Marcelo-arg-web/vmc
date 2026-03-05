import { qs, qsa, Storage, todayISO, fmtDateAR, markUnsaved, requireSavedGuard } from "./app.js";
import { mountHeader } from "./ui_common.js";
import { fetchAndParseWOL } from "./wol.js";
import { loadPeople, loadWeek, saveWeek, loadAssignments, saveAssignments, appendHistoryFromWeek, loadRecentHistory } from "./data.js";
import { Rules, scoreCandidate } from "./rules.js";

mountHeader();

const weekInput = qs("#weekISO");
const linkInput = qs("#wolLink");
const partsBox = qs("#partsBox");
const asgBox = qs("#asgBox");
const msg = qs("#msg");

let people = [];
let parts = [];
let assignments = [];

function currentWeek(){
  return weekInput.value;
}

function show(s, kind="ok"){
  msg.className = "notice " + (kind==="ok"?"ok":kind==="warn"?"warn":"err");
  msg.textContent = s;
  msg.style.display = "block";
}

function hideMsg(){ msg.style.display="none"; }

function guardBeforeSwitch(){
  if(!requireSavedGuard()){
    return confirm("⚠ La semana actual NO está guardada. ¿Seguro querés cambiar de semana y perder cambios?");
  }
  return true;
}

weekInput.value = Storage.get("currentWeekISO", todayISO());
qs("#weekPretty").textContent = fmtDateAR(weekInput.value);

weekInput.addEventListener("change", async ()=>{
  if(!guardBeforeSwitch()){
    weekInput.value = Storage.get("currentWeekISO", todayISO());
    return;
  }
  Storage.set("currentWeekISO", weekInput.value);
  qs("#weekPretty").textContent = fmtDateAR(weekInput.value);
  await loadAll();
});

async function loadAll(){
  hideMsg();
  qs("#status").textContent = "Cargando...";
  people = await loadPeople();

  const weekISO = currentWeek();
  const w = await loadWeek(weekISO);
  linkInput.value = w?.wolUrl || "";
  parts = w?.parts || [];
  assignments = await loadAssignments(weekISO);

  renderParts();
  renderAssignments();
  qs("#status").textContent = "Listo";
}

function renderParts(){
  partsBox.innerHTML = "";
  if(!parts.length){
    partsBox.innerHTML = "<div class='small'>Sin programa cargado todavía.</div>";
    return;
  }
  const t = document.createElement("table");
  t.className="table";
  t.innerHTML = `<thead><tr><th>#</th><th>Sección</th><th>Tipo</th><th>Título</th><th>Min</th></tr></thead><tbody></tbody>`;
  const tb = t.querySelector("tbody");
  for(const p of parts){
    const tr=document.createElement("tr");
    tr.innerHTML = `<td>${p.partNo||""}</td><td>${p.section||""}</td><td>${p.type||""}</td><td>${p.title||""}</td><td>${p.minutes||""}</td>`;
    tb.appendChild(tr);
  }
  partsBox.appendChild(t);
}

function buildDefaultAssignments(){
  // only parts with names + add President/Prayers
  const rows=[];
  let order=0;
  rows.push({ order:++order, key:"presidente", type:"Presidente", title:"Presidente", person1Id:"", person1Name:"" });
  rows.push({ order:++order, key:"oracion_ini", type:"Oración (inicio)", title:"Oración de apertura", person1Id:"", person1Name:"" });

  for(const p of parts){
    if(!p.type) continue;
    // skip if not assigned
    if(/^canci/i.test(p.title||"")) continue;
    // For EBC we already created two entries in parts
    rows.push({ order:++order, key:`p_${p.type}_${p.partNo}_${order}`, type:p.type, title:p.title, person1Id:"", person1Name:"", person2Id:"", person2Name:"", needsHelper: p.type.startsWith("Maestros") });
  }

  rows.push({ order:++order, key:"repaso", type:"Repaso y anuncios", title:"Repaso, adelanto y anuncios", person1Id:"", person1Name:"" });
  rows.push({ order:++order, key:"oracion_fin", type:"Oración (final)", title:"Oración final", person1Id:"", person1Name:"" });
  return rows;
}

function renderAssignments(){
  asgBox.innerHTML="";
  if(!assignments.length){
    assignments = buildDefaultAssignments();
  }
  const t=document.createElement("table");
  t.className="table";
  t.innerHTML = `<thead><tr><th>Parte</th><th>Título</th><th>Asignado</th><th>Ayudante</th></tr></thead><tbody></tbody>`;
  const tb=t.querySelector("tbody");

  const peopleOptions = ["<option value=''>—</option>"].concat(
    people.filter(p=>p.active!==false).map(p=>`<option value="${p.id}">${p.name}</option>`)
  ).join("");

  for(const r of assignments){
    const tr=document.createElement("tr");
    const helper = r.needsHelper ? `
      <select data-h2="${r.key}">${peopleOptions}</select>
    ` : `<span class="small">—</span>`;
    tr.innerHTML = `
      <td><span class="pill">${r.type}</span></td>
      <td>
        <input data-title="${r.key}" value="${(r.title||"").replace(/"/g,"&quot;")}" style="width:100%" />
        <div class="small">Editable (por videos / viajante / necesidad).</div>
      </td>
      <td><select data-h1="${r.key}">${peopleOptions}</select></td>
      <td>${helper}</td>
    `;
    tb.appendChild(tr);
  }
  asgBox.appendChild(t);

  // set values
  qsa("[data-h1]").forEach(sel=>{
    const key=sel.dataset.h1;
    const row=assignments.find(x=>x.key===key);
    sel.value=row?.person1Id||"";
    sel.addEventListener("change", ()=>{
      const p = people.find(x=>x.id===sel.value);
      row.person1Id = sel.value;
      row.person1Name = p?.name||"";
      markUnsaved("Se editaron asignaciones.");
    });
  });
  qsa("[data-h2]").forEach(sel=>{
    const key=sel.dataset.h2;
    const row=assignments.find(x=>x.key===key);
    sel.value=row?.person2Id||"";
    sel.addEventListener("change", ()=>{
      const p = people.find(x=>x.id===sel.value);
      row.person2Id = sel.value;
      row.person2Name = p?.name||"";
      markUnsaved("Se editaron asignaciones.");
    });
  });
  qsa("[data-title]").forEach(inp=>{
    const key=inp.dataset.title;
    const row=assignments.find(x=>x.key===key);
    inp.addEventListener("input", ()=>{
      row.title = inp.value;
      markUnsaved("Se editó el título de una parte.");
    });
  });
}

async function suggest(){
  hideMsg();
  const hist = await loadRecentHistory(800);
  const byPerson = {};
  for(const h of hist){
    if(!byPerson[h.personId]) byPerson[h.personId]=[];
    byPerson[h.personId].push(h);
  }

  for(const row of assignments){
    // helper row? skip if no person field
    if(!row.type) continue;

    // choose person1
    const candidates = people.filter(p=>{
      if(p.active===false) return false;
      if(!Rules.allowedFor(row.type, p)) return false;
      // for Maestros, if the main person is sister and helper needed, allow; if requires only brothers, user can enforce by approved+sex.
      return true;
    });

    if(!row.person1Id){
      let best=null, bestScore=1e9;
      for(const p of candidates){
        const sc = scoreCandidate({person:p, partType:row.type, historyByPerson:byPerson});
        if(sc < bestScore){
          bestScore=sc; best=p;
        }
      }
      if(best){
        row.person1Id=best.id;
        row.person1Name=best.name;
      }
    }

    if(row.needsHelper && !row.person2Id){
      // helper: avoid same as person1
      const candidates2 = people.filter(p=>{
        if(p.active===false) return false;
        if(p.id===row.person1Id) return false;
        // for helper, allow any active; superintendent can adjust
        return true;
      });
      let best=null, bestScore=1e9;
      for(const p of candidates2){
        const sc = scoreCandidate({person:p, partType:"Ayudante " + row.type, historyByPerson:byPerson});
        if(sc < bestScore){ bestScore=sc; best=p; }
      }
      if(best){
        row.person2Id=best.id;
        row.person2Name=best.name;
      }
    }
  }

  markUnsaved("Se generaron sugerencias.");
  renderAssignments();
  show("Sugerencias aplicadas. Revisá y ajustá lo necesario.", "ok");
}

qs("#btnLoadWOL").addEventListener("click", async ()=>{
  const wolUrl = linkInput.value.trim();
  if(!wolUrl){ show("Pegá el link de WOL.", "warn"); return; }
  qs("#btnLoadWOL").disabled = true;
  try{
    const proxyBase = Storage.get("proxyBase", "") || null;
    const result = await fetchAndParseWOL({ wolUrl, proxyBase });
    parts = result.parts;
    assignments = buildDefaultAssignments();
    renderParts();
    renderAssignments();
    show("Programa cargado desde WOL. Ahora podés sugerir y guardar.", "ok");
  }catch(e){
    show(e?.message || String(e), "err");
  }finally{
    qs("#btnLoadWOL").disabled = false;
  }
});

qs("#btnSuggest").addEventListener("click", suggest);

qs("#btnSave").addEventListener("click", async ()=>{
  const weekISO = currentWeek();
  const wolUrl = linkInput.value.trim();
  await saveWeek(weekISO, { wolUrl, parts });
  await saveAssignments(weekISO, assignments);
  await appendHistoryFromWeek(weekISO);
  show("Semana guardada (y historial actualizado).", "ok");
});

qs("#btnToBoard").addEventListener("click", ()=>{
  Storage.set("currentWeekISO", currentWeek());
  location.href="tablero.html";
});

loadAll();
