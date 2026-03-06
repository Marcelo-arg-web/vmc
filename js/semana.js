import { qs, qsa, Storage, todayISO, fmtDateAR, markUnsaved, requireSavedGuard } from "./app.js";
import { mountHeader } from "./ui_common.js";
import { fetchAndParseWOL } from "./wol.js";
import { loadPeople, loadWeek, saveWeek, loadAssignments, saveAssignments, appendHistoryFromWeek, loadRecentHistory } from "./data.js";
import { Rules, scoreCandidate } from "./rules.js";

mountHeader();

const weekInput = qs('#weekISO');
const weekMode = qs('#weekMode');
const linkInput = qs('#wolLink');
const specialReasonInput = qs('#specialReason');
const travelerInput = qs('#travelerName');
const weekLabelInput = qs('#weekLabel');
const bibleReadingInput = qs('#bibleReading');
const songOpeningInput = qs('#songOpening');
const songMiddleInput = qs('#songMiddle');
const songClosingInput = qs('#songClosing');
const partsBox = qs('#partsBox');
const asgBox = qs('#asgBox');
const msg = qs('#msg');

let people = [];
let parts = [];
let assignments = [];
let meta = {};

const currentWeek = () => weekInput.value;
function show(s, kind='ok'){ msg.className = 'notice ' + (kind==='ok'?'ok':kind==='warn'?'warn':'err'); msg.textContent = s; msg.style.display='block'; }
const hideMsg = ()=> msg.style.display='none';
function guardBeforeSwitch(){ return requireSavedGuard() ? true : confirm('⚠ La semana actual NO está guardada. ¿Seguro querés cambiar de semana y perder cambios?'); }
function normalizedSpecialDates(){ return Storage.get('specialDates', [{ date:'2026-04-02', reason:'Conmemoración' }]); }
function detectAutoMode(weekISO){
  const found = normalizedSpecialDates().find(x => x.date === weekISO);
  if(found) return { mode:'sin_reunion', reason: found.reason || 'Sin reunión' };
  return null;
}
function disableByMode(){
  const off = weekMode.value === 'sin_reunion';
  linkInput.disabled = off;
  qs('#btnLoadWOL').disabled = off;
  specialReasonInput.disabled = !off;
  travelerInput.disabled = weekMode.value !== 'viajante';
}

function readMetaFromForm(){
  return {
    weekLabel: weekLabelInput.value.trim(),
    bibleReading: bibleReadingInput.value.trim(),
    songOpening: songOpeningInput.value.trim(),
    songMiddle: songMiddleInput.value.trim(),
    songClosing: songClosingInput.value.trim(),
  };
}
function writeMetaToForm(data={}){
  weekLabelInput.value = data.weekLabel || '';
  bibleReadingInput.value = data.bibleReading || '';
  songOpeningInput.value = data.songOpening || '';
  songMiddleInput.value = data.songMiddle || '';
  songClosingInput.value = data.songClosing || '';
}
function wireMetaUnsaved(){
  [weekLabelInput,bibleReadingInput,songOpeningInput,songMiddleInput,songClosingInput].forEach(el=>{
    el.addEventListener('input', ()=>{ meta = readMetaFromForm(); markUnsaved('Se modificaron los datos del programa.'); });
  });
}

weekInput.value = Storage.get('currentWeekISO', todayISO());
qs('#weekPretty').textContent = fmtDateAR(weekInput.value);
travelerInput.value = Storage.get('viajanteNombre', 'Roberto Armando');
wireMetaUnsaved();

weekInput.addEventListener('change', async ()=>{
  if(!guardBeforeSwitch()){
    weekInput.value = Storage.get('currentWeekISO', todayISO());
    return;
  }
  Storage.set('currentWeekISO', weekInput.value);
  qs('#weekPretty').textContent = fmtDateAR(weekInput.value);
  await loadAll();
});
weekMode.addEventListener('change', ()=>{ applyModeTransform(false); markUnsaved('Se cambió el tipo de semana.'); });
specialReasonInput.addEventListener('input', ()=> markUnsaved('Se cambió el motivo de la semana especial.'));
travelerInput.addEventListener('input', ()=> markUnsaved('Se cambió el nombre del viajante.'));

function defaultPartRows(){
  return [
    { partNo: 1, section:'Tesoros de la Biblia', type:'Tesoros 1 (Discurso)', title:'Tesoros de la Biblia', minutes:10 },
    { partNo: 2, section:'Tesoros de la Biblia', type:'Tesoros 2 (Perlas)', title:'Busquemos perlas escondidas', minutes:10 },
    { partNo: 3, section:'Tesoros de la Biblia', type:'Tesoros 3 (Lectura Biblia)', title:'Lectura de la Biblia', minutes:4 },
  ];
}

function buildAssignmentsFromParts(sourceParts){
  const rows=[]; let order=0;
  rows.push({ order:++order, key:'presidente', type:'Presidente', title:'Presidente', person1Id:'', person1Name:'' });
  rows.push({ order:++order, key:'oracion_ini', type:'Oración (inicio)', title:'Oración de apertura', person1Id:'', person1Name:'' });
  rows.push({ order:++order, key:'intro', type:'Palabras de introducción', title:'Palabras de introducción', minutes:1, person1Id:'', person1Name:'' });
  for(const p of sourceParts){
    rows.push({ order:++order, key:`p_${order}_${String(p.type).replace(/[^a-z0-9]+/gi,'_')}`.toLowerCase(), type:p.type, title:p.title, section:p.section||'', partNo:p.partNo||'', minutes:p.minutes||'', person1Id:'', person1Name:'', person2Id:'', person2Name:'', isDisabled:false });
  }
  rows.push({ order:++order, key:'conclusion', type:'Palabras de conclusión', title:'Palabras de conclusión', minutes:3, person1Id:'', person1Name:'' });
  rows.push({ order:++order, key:'oracion_fin', type:'Oración (final)', title:'Oración final', person1Id:'', person1Name:'' });
  return rows;
}

function mergeAssignments(prevRows, sourceParts){
  const fresh = buildAssignmentsFromParts(sourceParts);
  const pool = [...(prevRows || [])];
  for(const row of fresh){
    const prev = pool.find(x => x.key === row.key)
      || pool.find(x => x.type === row.type && x.title === row.title)
      || pool.find(x => x.type === row.type && !x.person2Id);
    if(prev){
      row.person1Id = prev.person1Id || '';
      row.person1Name = prev.person1Name || '';
      row.person2Id = prev.person2Id || '';
      row.person2Name = prev.person2Name || '';
      row.isDisabled = !!prev.isDisabled;
    }
  }
  return fresh;
}

function ensureFixedBaseParts(currentParts){
  const fixed = defaultPartRows();
  const dynamic = (currentParts || []).filter(p => !String(p.type).startsWith('Tesoros '));
  return [...fixed, ...dynamic];
}

function applyModeTransform(preserveExisting=true){
  disableByMode();
  meta = readMetaFromForm();
  const mode = weekMode.value;

  if(mode === 'sin_reunion'){
    const reason = specialReasonInput.value.trim() || 'Sin reunión';
    parts = [{ partNo:0, section:'Semana especial', type:'Sin reunión', title:reason, minutes:'' }];
    assignments = [];
    renderParts();
    renderAssignments();
    return;
  }

  if(!parts.length || (parts.length===1 && parts[0].type==='Sin reunión')) parts = defaultPartRows();
  parts = ensureFixedBaseParts(parts);

  if(mode === 'viajante'){
    const traveler = travelerInput.value.trim() || Storage.get('viajanteNombre', 'Roberto Armando') || 'Roberto Armando';
    const filtered = parts.filter(p => !String(p.type).startsWith('Estudio bíblico'));
    if(!filtered.some(p => p.type === 'Discurso de servicio (viajante)')){
      filtered.push({ partNo: 9, section:'Nuestra vida cristiana', type:'Discurso de servicio (viajante)', title:'Discurso de servicio del viajante', minutes:30 });
    }
    parts = filtered;
    assignments = preserveExisting ? mergeAssignments(assignments, parts) : buildAssignmentsFromParts(parts);
    const row = assignments.find(x => x.type === 'Discurso de servicio (viajante)');
    if(row){ row.person1Name = traveler; row.person1Id = `manual:${traveler}`; row.isDisabled = true; }
  } else {
    parts = parts.filter(p => p.type !== 'Discurso de servicio (viajante)');
    assignments = preserveExisting ? mergeAssignments(assignments, parts) : buildAssignmentsFromParts(parts);
  }

  renderParts();
  renderAssignments();
}

async function loadAll(){
  hideMsg();
  qs('#status').textContent = 'Cargando...';
  people = await loadPeople();
  const auto = detectAutoMode(currentWeek());
  const w = await loadWeek(currentWeek());
  linkInput.value = w?.wolUrl || '';
  travelerInput.value = w?.travelerName || Storage.get('viajanteNombre', 'Roberto Armando');
  weekMode.value = w?.weekMode || auto?.mode || 'normal';
  specialReasonInput.value = w?.specialReason || auto?.reason || '';
  parts = w?.parts?.length ? w.parts : (weekMode.value === 'normal' ? defaultPartRows() : []);
  meta = w?.meta || {};
  writeMetaToForm(meta);
  assignments = await loadAssignments(currentWeek());
  if(weekMode.value === 'sin_reunion' && !parts.length) parts = [{ partNo:0, section:'Semana especial', type:'Sin reunión', title:specialReasonInput.value || auto?.reason || 'Sin reunión', minutes:'' }];
  applyModeTransform(true);
  qs('#status').textContent = 'Listo';
}

function renderParts(){
  partsBox.innerHTML = '';
  if(!parts.length){ partsBox.innerHTML = "<div class='small'>Sin programa cargado todavía.</div>"; return; }
  if(parts[0]?.type === 'Sin reunión'){
    partsBox.innerHTML = `<div class="notice warn"><b>Semana sin reunión.</b><br/>${parts[0].title || 'Sin reunión VMC.'}</div>`;
    return;
  }
  const intro = document.createElement('div');
  intro.className = 'notice';
  intro.innerHTML = `<b>${weekLabelInput.value || 'Semana cargada'}</b><br/>${bibleReadingInput.value || 'Lectura bíblica semanal'}${songOpeningInput.value ? `<br/>${songOpeningInput.value}` : ''}${songMiddleInput.value ? `<br/>${songMiddleInput.value}` : ''}${songClosingInput.value ? `<br/>${songClosingInput.value}` : ''}`;
  partsBox.appendChild(intro);
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

function optionsForRow(row, isHelper=false){
  if(row.isDisabled) return `<option value="${row.person1Id || ''}">${row.person1Name || '—'}</option>`;
  const main = isHelper ? people.find(p => p.id === row.person1Id) : null;
  const opts = ["<option value=''>—</option>"];
  for(const p of people){
    if(Rules.allowedFor(row, p, isHelper, main)) opts.push(`<option value="${p.id}">${p.name}</option>`);
  }
  return opts.join('');
}
function helperColumn(row){
  if(row.isDisabled) return `<span class="small">—</span>`;
  return Rules.rowNeedsHelper(row) ? `<select data-h2="${row.key}">${optionsForRow(row,true)}</select>` : `<span class="small">—</span>`;
}
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
  if(weekMode.value === 'sin_reunion'){
    asgBox.innerHTML = `<div class="notice warn"><b>No se generaron asignaciones.</b><br/>${specialReasonInput.value || 'Semana sin reunión.'}</div>`;
    return;
  }
  if(!assignments.length) assignments = buildAssignmentsFromParts(parts);
  const t=document.createElement('table');
  t.className='table';
  t.innerHTML = `<thead><tr><th>Parte</th><th>Título</th><th>Asignado</th><th>Ayudante</th></tr></thead><tbody></tbody>`;
  const tb=t.querySelector('tbody');
  for(const r of assignments){
    const tr=document.createElement('tr');
    const disabled = r.isDisabled ? 'disabled' : '';
    tr.innerHTML = `<td><span class="pill">${r.type}</span><div class="small">${r.section||''}${r.minutes ? ` · ${r.minutes} min` : ''}</div></td><td><input data-title="${r.key}" value="${(r.title||'').replace(/"/g,'&quot;')}" style="width:100%" ${disabled} /><div class="small">Editable según la guía de la semana.</div></td><td><select data-h1="${r.key}" ${disabled}>${optionsForRow(r)}</select></td><td>${helperColumn(r)}</td>`;
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
  if(weekMode.value === 'sin_reunion'){ show('Esta semana no tiene reunión.', 'warn'); return; }
  const hist = await loadRecentHistory(800);
  const byPerson = {};
  for(const h of hist){ if(!byPerson[h.personId]) byPerson[h.personId]=[]; byPerson[h.personId].push(h); }
  const used = new Set();
  for(const row of assignments){
    if(row.isDisabled) continue;
    if(!row.person1Id){
      let best=null, bestScore=Infinity;
      for(const p of people.filter(p=>!used.has(p.id) && Rules.allowedFor(row,p))){
        const sc = scoreCandidate({person:p, partType:row.type, historyByPerson:byPerson});
        if(sc < bestScore){ best=p; bestScore=sc; }
      }
      if(best){ row.person1Id=best.id; row.person1Name=best.name; used.add(best.id); }
    } else if(!String(row.person1Id).startsWith('manual:')) used.add(row.person1Id);
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
  show('Listo. Se sugirieron asignados según roles e historial.');
}

qs('#btnLoadWOL').addEventListener('click', async ()=>{
  hideMsg();
  try{
    if(weekMode.value === 'sin_reunion'){ show('Esta semana está marcada como sin reunión.', 'warn'); return; }
    qs('#status').textContent = 'Leyendo WOL...';
    const proxyBase = Storage.get('proxyBase', null);
    const data = await fetchAndParseWOL({ wolUrl: linkInput.value, proxyBase });
    parts = data.parts;
    meta = data.meta || {};
    writeMetaToForm(meta);
    applyModeTransform(false);
    qs('#status').textContent = 'Programa detectado';
    show('Programa cargado desde WOL.');
  }catch(err){
    qs('#status').textContent = 'Error';
    show(err?.message || String(err), 'err');
  }
});

qs('#btnSuggest').addEventListener('click', suggest);
qs('#btnSave').addEventListener('click', async ()=>{
  hideMsg();
  try{
    const payload = {
      wolUrl: linkInput.value.trim(),
      weekMode: weekMode.value,
      specialReason: specialReasonInput.value.trim(),
      travelerName: travelerInput.value.trim() || Storage.get('viajanteNombre', 'Roberto Armando'),
      meta: readMetaFromForm(),
      parts,
    };
    await saveWeek(currentWeek(), payload);
    await saveAssignments(currentWeek(), assignments);
    await appendHistoryFromWeek(currentWeek());
    Storage.set('viajanteNombre', payload.travelerName);
    show('Semana guardada.');
  }catch(err){ show(err?.message || String(err), 'err'); }
});
qs('#btnToBoard').addEventListener('click', ()=> location.href='tablero.html');

loadAll();
