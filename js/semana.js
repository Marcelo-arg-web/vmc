import { qs, qsa, Storage, todayISO, fmtDateAR, markUnsaved, requireSavedGuard, isoToWeekdayName } from "./app.js";
import { mountHeader } from "./ui_common.js";
import { fetchAndParseWOL } from "./wol.js";
import { loadPeople, loadWeek, saveWeek, loadAssignments, saveAssignments, appendHistoryFromWeek, loadRecentHistory } from "./data.js";
import { Rules, scoreCandidate } from "./rules.js";

mountHeader();

const weekInput = qs('#weekISO');
const linkInput = qs('#wolLink');
const meetingDayInput = qs('#meetingDay');
const meetingTimeInput = qs('#meetingTime');
const weekTypeInput = qs('#weekType');
const specialReasonInput = qs('#specialReason');
const travelingSpeakerInput = qs('#travelingSpeaker');
const travelingTalkTitleInput = qs('#travelingTalkTitle');
const partsBox = qs('#partsBox');
const asgBox = qs('#asgBox');
const msg = qs('#msg');

let people = [];
let parts = [];
let assignments = [];

const currentWeek = () => weekInput.value;
const weekMeta = () => ({
  meetingDay: meetingDayInput.value.trim(),
  meetingTime: meetingTimeInput.value,
  weekType: weekTypeInput.value,
  specialReason: specialReasonInput.value.trim(),
  travelingSpeaker: travelingSpeakerInput.value.trim(),
  travelingTalkTitle: travelingTalkTitleInput.value.trim()
});

function show(s, kind='ok'){
  msg.className = 'notice ' + (kind==='ok'?'ok':kind==='warn'?'warn':'err');
  msg.textContent = s;
  msg.style.display='block';
}
const hideMsg = ()=> msg.style.display='none';

function guardBeforeSwitch(){
  return requireSavedGuard() ? true : confirm('⚠ La semana actual NO está guardada. ¿Seguro que querés cambiar de semana y perder cambios?');
}

function syncAutoFields(){
  if(!meetingDayInput.dataset.touched){
    meetingDayInput.value = isoToWeekdayName(weekInput.value);
  }
  if(!meetingTimeInput.value){
    meetingTimeInput.value = Storage.get("defaultMeetingTime", "20:00");
  }
  if(!travelingSpeakerInput.value){
    travelingSpeakerInput.value = Storage.get("travelingName", "Roberto Armando");
  }
  if(!travelingTalkTitleInput.value){
    travelingTalkTitleInput.value = "Discurso de servicio del viajante";
  }
}

function syncSpecialUI(){
  const wt = weekTypeInput.value;
  travelingSpeakerInput.disabled = wt !== 'viajante';
  travelingTalkTitleInput.disabled = wt !== 'viajante';
  specialReasonInput.disabled = wt === 'normal';
  if (wt === 'conmemoracion' && !specialReasonInput.value.trim()) specialReasonInput.value = 'Conmemoración de la muerte de Cristo';
  if (wt === 'asamblea' && !specialReasonInput.value.trim()) specialReasonInput.value = 'Asamblea';
  if (wt === 'viajante' && !specialReasonInput.value.trim()) specialReasonInput.value = 'Visita del viajante';
  if (wt === 'normal') specialReasonInput.value = '';
}

function handleMetaChanged(){
  syncSpecialUI();
  assignments = buildDefaultAssignments();
  renderParts();
  renderAssignments();
  markUnsaved('Se modificó la semana.');
}

weekInput.value = Storage.get('currentWeekISO', todayISO());
qs('#weekPretty').textContent = fmtDateAR(weekInput.value);

weekInput.addEventListener('change', async ()=>{
  if(!guardBeforeSwitch()){
    weekInput.value = Storage.get('currentWeekISO', todayISO());
    return;
  }
  meetingDayInput.dataset.touched = '';
  Storage.set('currentWeekISO', weekInput.value);
  qs('#weekPretty').textContent = fmtDateAR(weekInput.value);
  await loadAll();
});

for(const el of [meetingDayInput, meetingTimeInput, weekTypeInput, specialReasonInput, travelingSpeakerInput, travelingTalkTitleInput]){
  el.addEventListener('input', handleMetaChanged);
  el.addEventListener('change', handleMetaChanged);
}
meetingDayInput.addEventListener('input', ()=> meetingDayInput.dataset.touched = '1');

async function loadAll(){
  hideMsg();
  qs('#status').textContent = 'Cargando...';
  people = await loadPeople();
  const w = await loadWeek(currentWeek());
  linkInput.value = w?.wolUrl || '';
  parts = w?.parts || [];
  meetingDayInput.value = w?.meetingDay || isoToWeekdayName(currentWeek());
  meetingTimeInput.value = w?.meetingTime || Storage.get("defaultMeetingTime", "20:00");
  weekTypeInput.value = (currentWeek()==='2026-04-02' && !w?.weekType) ? 'conmemoracion' : (w?.weekType || 'normal');
  specialReasonInput.value = w?.specialReason || (currentWeek()==='2026-04-02' ? 'Conmemoración de la muerte de Cristo' : '');
  travelingSpeakerInput.value = w?.travelingSpeaker || Storage.get("travelingName", "Roberto Armando");
  travelingTalkTitleInput.value = w?.travelingTalkTitle || 'Discurso de servicio del viajante';
  assignments = await loadAssignments(currentWeek());
  if(!assignments.length) assignments = buildDefaultAssignments();
  syncSpecialUI();
  renderParts();
  renderAssignments();
  qs('#status').textContent = 'Listo';
}

function renderParts(){
  partsBox.innerHTML = '';
  if(['asamblea','conmemoracion','sin_reunion'].includes(weekTypeInput.value)){
    const txt = weekTypeInput.value === 'asamblea' ? 'Semana sin reunión por asamblea.' :
      weekTypeInput.value === 'conmemoracion' ? 'Semana sin reunión por conmemoración.' :
      'Semana sin reunión.';
    partsBox.innerHTML = `<div class='notice warn'>${txt}<div class='small'>${specialReasonInput.value || ''}</div></div>`;
    return;
  }
  if(!parts.length){
    partsBox.innerHTML = "<div class='small'>Sin programa cargado todavía.</div>";
    return;
  }
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
  if(['asamblea','conmemoracion','sin_reunion'].includes(weekTypeInput.value)) return [];
  const rows=[]; let order=0;
  rows.push({ order:++order, key:'presidente', type:'Presidente', title:'Presidente', person1Id:'', person1Name:'' });
  rows.push({ order:++order, key:'oracion_ini', type:'Oración (inicio)', title:'Oración de apertura', person1Id:'', person1Name:'' });
  for(const p of parts){
    if(!p.type) continue;
    if(/^canci/i.test(p.title||'')) continue;
    if(weekTypeInput.value === 'viajante' && (p.type === 'Estudio bíblico (Conductor)' || p.type === 'Estudio bíblico (Lector)')) continue;
    rows.push({ order:++order, key:`p_${order}_${String(p.type).replace(/[^a-z0-9]+/gi,'_')}`,
      type:p.type, title:p.title, section:p.section||'', partNo:p.partNo||'', minutes:p.minutes||'',
      person1Id:'', person1Name:'', person2Id:'', person2Name:'' });
  }
  if(weekTypeInput.value === 'viajante'){
    rows.push({ order:++order, key:'viajante', type:'Discurso del viajante', title: travelingTalkTitleInput.value.trim() || 'Discurso de servicio del viajante', section:'Nuestra vida cristiana', minutes:30, person1Id:'__visitante__', person1Name: travelingSpeakerInput.value.trim() || Storage.get('travelingName', 'Roberto Armando'), person2Id:'', person2Name:'' });
  }
  rows.push({ order:++order, key:'oracion_fin', type:'Oración (final)', title:'Oración final', person1Id:'', person1Name:'' });
  return rows;
}

function optionsForRow(row, isHelper=false){
  if(Rules.isFixedExternal(row)) return "<option value=''>—</option>";
  const main = isHelper ? people.find(p => p.id === row.person1Id) : null;
  const opts = ["<option value=''>—</option>"];
  for(const p of people){
    if(Rules.allowedFor(row, p, isHelper, main)) opts.push(`<option value="${p.id}">${p.name}</option>`);
  }
  return opts.join('');
}

function helperColumn(row){
  return Rules.rowNeedsHelper(row)
    ? `<select data-h2="${row.key}">${optionsForRow(row,true)}</select>`
    : `<span class="small">—</span>`;
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
  if(['asamblea','conmemoracion','sin_reunion'].includes(weekTypeInput.value)){
    asgBox.innerHTML = `<div class="notice warn">No hay asignaciones esta semana.<div class="small">${specialReasonInput.value || ''}</div></div>`;
    return;
  }
  if(!assignments.length) assignments = buildDefaultAssignments();
  const t=document.createElement('table');
  t.className='table';
  t.innerHTML = `<thead><tr><th>Parte</th><th>Título</th><th>Asignado</th><th>Ayudante</th></tr></thead><tbody></tbody>`;
  const tb=t.querySelector('tbody');
  for(const r of assignments){
    const isExternal = Rules.isFixedExternal(r);
    const assigneeCell = isExternal
      ? `<input data-external="${r.key}" value="${(r.person1Name||'').replace(/"/g,'&quot;')}" style="width:100%" />`
      : `<select data-h1="${r.key}">${optionsForRow(r)}</select>`;
    const titleExtra = isExternal ? `<div class="small">Discurso de servicio del viajante.</div>` : `<div class="small">Editable por cambios del programa real.</div>`;
    const tr=document.createElement('tr');
    tr.innerHTML = `<td><span class="pill">${r.type}</span><div class="small">${r.section||''}${r.minutes ? ` · ${r.minutes} min` : ''}</div></td><td><input data-title="${r.key}" value="${(r.title||'').replace(/"/g,'&quot;')}" style="width:100%" />${titleExtra}</td><td>${assigneeCell}</td><td>${helperColumn(r)}</td>`;
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
    inp.addEventListener('input', ()=>{ row.title=inp.value; if(row.type === 'Discurso del viajante') travelingTalkTitleInput.value = inp.value; markUnsaved('Se editó el título de una parte.'); });
  });
  qsa('[data-external]').forEach(inp=>{
    const row=assignments.find(x=>x.key===inp.dataset.external);
    inp.addEventListener('input', ()=>{ row.person1Id='__visitante__'; row.person1Name=inp.value; travelingSpeakerInput.value = inp.value; markUnsaved('Se cambió el nombre del viajante.'); });
  });
}

async function suggest(){
  hideMsg();
  if(['asamblea','conmemoracion','sin_reunion'].includes(weekTypeInput.value)){
    show('Esta semana no hay reunión, así que no se generan asignaciones.', 'warn');
    return;
  }
  const hist = await loadRecentHistory(1000);
  const byPerson = {};
  for(const h of hist){
    (byPerson[h.personId] ||= []).push(h);
  }
  const used = new Set();
  for(const row of assignments){
    if(Rules.isFixedExternal(row)) continue;
    let best=null, bestScore=Infinity;
    for(const p of people){
      if(used.has(p.id)) continue;
      if(!Rules.allowedFor(row,p,false,null)) continue;
      const sc = scoreCandidate({person:p, currentWeekISO: currentWeek(), historyByPerson:byPerson});
      if(sc < bestScore){ best=p; bestScore=sc; }
    }
    row.person1Id = best?.id || '';
    row.person1Name = best?.name || '';
    if(best) used.add(best.id);
    row.person2Id=''; row.person2Name='';
    if(Rules.rowNeedsHelper(row) && row.person1Id){
      const main = people.find(p=>p.id===row.person1Id);
      let bestH=null, bestScoreH=Infinity;
      for(const p of people){
        if(used.has(p.id)) continue;
        if(!Rules.allowedFor(row,p,true,main)) continue;
        const sc = scoreCandidate({person:p, currentWeekISO: currentWeek(), historyByPerson:byPerson});
        if(sc < bestScoreH){ bestH=p; bestScoreH=sc; }
      }
      row.person2Id = bestH?.id || '';
      row.person2Name = bestH?.name || '';
      if(bestH) used.add(bestH.id);
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
  const meta = weekMeta();
  await saveWeek(currentWeek(), { wolUrl: linkInput.value.trim(), parts, ...meta });
  await saveAssignments(currentWeek(), assignments);
  if(!['asamblea','conmemoracion','sin_reunion'].includes(meta.weekType)) await appendHistoryFromWeek(currentWeek());
  show('Semana guardada y lista para el tablero.', 'ok');
});
qs('#btnToBoard').addEventListener('click', ()=>{ Storage.set('currentWeekISO', currentWeek()); location.href='tablero.html'; });
syncAutoFields();
loadAll().catch(err => { show('Error cargando datos: ' + (err?.message || err), 'err'); qs('#status').textContent='Error'; });
