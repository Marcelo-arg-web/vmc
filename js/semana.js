import { qs, qsa, Storage, todayISO, fmtDateAR, markUnsaved, requireSavedGuard } from "./app.js";
import { mountHeader } from "./ui_common.js";
import { fetchAndParseWOL } from "./wol.js";
import { loadPeople, loadWeek, saveWeek, loadAssignments, saveAssignments, appendHistoryFromWeek, loadRecentHistory } from "./data.js";
import { Rules, scoreCandidate } from "./rules.js";

mountHeader();

const weekInput = qs('#weekISO');
const linkInput = qs('#wolLink');
const partsBox = qs('#partsBox');
const asgBox = qs('#asgBox');
const msg = qs('#msg');

let people = [];
let parts = [];
let assignments = [];

const currentWeek = () => weekInput.value;
function show(s, kind='ok'){ msg.className = 'notice ' + (kind==='ok'?'ok':kind==='warn'?'warn':'err'); msg.textContent = s; msg.style.display='block'; }
const hideMsg = ()=> msg.style.display='none';
function guardBeforeSwitch(){ return requireSavedGuard() ? true : confirm('⚠ La semana actual NO está guardada. ¿Seguro querés cambiar de semana y perder cambios?'); }

weekInput.value = Storage.get('currentWeekISO', todayISO());
qs('#weekPretty').textContent = fmtDateAR(weekInput.value);
weekInput.addEventListener('change', async ()=>{
  if(!guardBeforeSwitch()){
    weekInput.value = Storage.get('currentWeekISO', todayISO());
    return;
  }
  Storage.set('currentWeekISO', weekInput.value);
  qs('#weekPretty').textContent = fmtDateAR(weekInput.value);
  await loadAll();
});

async function loadAll(){
  hideMsg();
  qs('#status').textContent = 'Cargando...';
  people = await loadPeople();
  const w = await loadWeek(currentWeek());
  linkInput.value = w?.wolUrl || '';
  parts = w?.parts || [];
  assignments = await loadAssignments(currentWeek());
  renderParts();
  renderAssignments();
  qs('#status').textContent = 'Listo';
}

function renderParts(){
  partsBox.innerHTML = '';
  if(!parts.length){ partsBox.innerHTML = "<div class='small'>Sin programa cargado todavía.</div>"; return; }
  const t = document.createElement('table');
  t.className='table';
  t.innerHTML = `<thead><tr><th>#</th><th>Sección</th><th>Tipo</th><th>Título</th><th>Min</th></tr></thead><tbody></tbody>`;
  const tb = t.querySelector('tbody');
  for(const p of parts){
    const tr=document.createElement('tr');
    tr.innerHTML = `<td>${p.partNo||''}</td><td>${p.section||''}</td><td>${p.type||''}</td><td>${p.title||''}</td><td>${p.minutes||''}</td>`;
    tb.appendChild(tr);
  }
  partsBox.appendChild(t);
}

function buildDefaultAssignments(){
  const rows=[]; let order=0;
  rows.push({ order:++order, key:'presidente', type:'Presidente', title:'Presidente', person1Id:'', person1Name:'' });
  rows.push({ order:++order, key:'oracion_ini', type:'Oración (inicio)', title:'Oración de apertura', person1Id:'', person1Name:'' });
  for(const p of parts){
    if(!p.type) continue;
    if(/^canci/i.test(p.title||'')) continue;
    rows.push({ order:++order, key:`p_${order}_${String(p.type).replace(/[^a-z0-9]+/gi,'_')}`, type:p.type, title:p.title, section:p.section||'', partNo:p.partNo||'', minutes:p.minutes||'', person1Id:'', person1Name:'', person2Id:'', person2Name:'' });
  }
  rows.push({ order:++order, key:'oracion_fin', type:'Oración (final)', title:'Oración final', person1Id:'', person1Name:'' });
  return rows;
}

function optionsForRow(row, isHelper=false){
  const main = isHelper ? people.find(p => p.id === row.person1Id) : null;
  const opts = ["<option value=''>—</option>"];
  for(const p of people){
    if(Rules.allowedFor(row, p, isHelper, main)) opts.push(`<option value="${p.id}">${p.name}</option>`);
  }
  return opts.join('');
}
function helperColumn(row){ return Rules.rowNeedsHelper(row) ? `<select data-h2="${row.key}">${optionsForRow(row,true)}</select>` : `<span class="small">—</span>`; }
function refreshHelperSelect(row){
  const sel = qs(`[data-h2="${row.key}"]`);
  if(!sel) return;
  const current = row.person2Id || '';
  sel.innerHTML = optionsForRow(row, true);
  if([...sel.options].some(o=>o.value===current)) sel.value=current;
  else { row.person2Id=''; row.person2Name=''; sel.value=''; }
}

function renderAssignments(){
  asgBox.innerHTML='';
  if(!assignments.length) assignments = buildDefaultAssignments();
  const t=document.createElement('table');
  t.className='table';
  t.innerHTML = `<thead><tr><th>Parte</th><th>Título</th><th>Asignado</th><th>Ayudante</th></tr></thead><tbody></tbody>`;
  const tb=t.querySelector('tbody');
  for(const r of assignments){
    const tr=document.createElement('tr');
    tr.innerHTML = `<td><span class="pill">${r.type}</span><div class="small">${r.section||''}${r.minutes ? ` · ${r.minutes} min` : ''}</div></td><td><input data-title="${r.key}" value="${(r.title||'').replace(/"/g,'&quot;')}" style="width:100%" /><div class="small">Editable por cambios del programa real.</div></td><td><select data-h1="${r.key}">${optionsForRow(r)}</select></td><td>${helperColumn(r)}</td>`;
    tb.appendChild(tr);
  }
  asgBox.appendChild(t);
  qsa('[data-h1]').forEach(sel=>{
    const row=assignments.find(x=>x.key===sel.dataset.h1);
    sel.value=row?.person1Id||'';
    sel.addEventListener('change', ()=>{
      const p = people.find(x=>x.id===sel.value);
      row.person1Id=sel.value; row.person1Name=p?.name||''; refreshHelperSelect(row); markUnsaved('Se editaron asignaciones.');
    });
  });
  qsa('[data-h2]').forEach(sel=>{
    const row=assignments.find(x=>x.key===sel.dataset.h2);
    sel.value=row?.person2Id||'';
    sel.addEventListener('change', ()=>{ const p=people.find(x=>x.id===sel.value); row.person2Id=sel.value; row.person2Name=p?.name||''; markUnsaved('Se editó un ayudante.'); });
  });
  qsa('[data-title]').forEach(inp=>{
    const row=assignments.find(x=>x.key===inp.dataset.title);
    inp.addEventListener('input', ()=>{ row.title=inp.value; markUnsaved('Se editó el título de una parte.'); });
  });
}

async function suggest(){
  hideMsg();
  const hist = await loadRecentHistory(800);
  const byPerson = {};
  for(const h of hist){ if(!byPerson[h.personId]) byPerson[h.personId]=[]; byPerson[h.personId].push(h); }
  const used = new Set();
  for(const row of assignments){
    if(!row.person1Id){
      let best=null, bestScore=Infinity;
      for(const p of people.filter(p=>!used.has(p.id) && Rules.allowedFor(row,p))){
        const sc = scoreCandidate({person:p, partType:row.type, historyByPerson:byPerson});
        if(sc < bestScore){ best=p; bestScore=sc; }
      }
      if(best){ row.person1Id=best.id; row.person1Name=best.name; used.add(best.id); }
    } else used.add(row.person1Id);
    if(Rules.rowNeedsHelper(row) && !row.person2Id){
      const main = people.find(p=>p.id===row.person1Id);
      let best=null, bestScore=Infinity;
      for(const p of people.filter(p=>!used.has(p.id) && Rules.allowedFor(row,p,true,main))){
        const sc = scoreCandidate({person:p, partType:`${row.type} / ayudante`, historyByPerson:byPerson});
        if(sc < bestScore){ best=p; bestScore=sc; }
      }
      if(best){ row.person2Id=best.id; row.person2Name=best.name; used.add(best.id); }
    }
  }
  markUnsaved('Se generaron sugerencias.');
  renderAssignments();
  show('Sugerencias aplicadas. Revisá y ajustá lo necesario.', 'ok');
}

qs('#btnLoadWOL').addEventListener('click', async ()=>{
  const wolUrl = linkInput.value.trim();
  if(!wolUrl){ show('Pegá el link de WOL.', 'warn'); return; }
  qs('#btnLoadWOL').disabled = true;
  try{
    const proxyBase = Storage.get('proxyBase', '') || null;
    const result = await fetchAndParseWOL({ wolUrl, proxyBase });
    parts = result.parts;
    assignments = buildDefaultAssignments();
    renderParts(); renderAssignments();
    show('Programa cargado desde WOL. Ahora podés sugerir y guardar.', 'ok');
  }catch(e){ show(e?.message || String(e), 'err'); }
  finally{ qs('#btnLoadWOL').disabled = false; }
});
qs('#btnSuggest').addEventListener('click', suggest);
qs('#btnSave').addEventListener('click', async ()=>{
  await saveWeek(currentWeek(), { wolUrl: linkInput.value.trim(), parts });
  await saveAssignments(currentWeek(), assignments);
  await appendHistoryFromWeek(currentWeek());
  show('Semana guardada y lista para el tablero.', 'ok');
});
qs('#btnToBoard').addEventListener('click', ()=>{ Storage.set('currentWeekISO', currentWeek()); location.href='tablero.html'; });
loadAll().catch(err => { show('Error cargando datos: ' + (err?.message || err), 'err'); qs('#status').textContent='Error'; });
