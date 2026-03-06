import { qs, Storage, fmtDateAR } from "./app.js";
import { mountHeader } from "./ui_common.js";
import { loadAssignments, loadWeek } from "./data.js";

mountHeader();

const weekISO = Storage.get('currentWeekISO', '');
qs('#weekPretty').textContent = fmtDateAR(weekISO);

function addSectionTitle(container, title){
  const div = document.createElement('div');
  div.className = 'board-section';
  div.textContent = title;
  container.appendChild(div);
}

function addSongLine(container, text){
  if(!text) return;
  const div = document.createElement('div');
  div.className = 'song-line';
  div.textContent = text;
  container.appendChild(div);
}

async function load(){
  const week = await loadWeek(weekISO);
  const asg = await loadAssignments(weekISO);
  const meta = week?.meta || {};
  qs('#cong').textContent = Storage.get('congregacion', 'CONG.: "VILLA FIAD"');
  qs('#title').textContent = 'Vida y Ministerio Cristianos';
  qs('#date').textContent = meta.weekLabel || fmtDateAR(weekISO);
  qs('#bibleReading').textContent = meta.bibleReading || '';

  const get = (type) => asg.find(x=>x.type===type);
  qs('#pres').textContent = get('Presidente')?.person1Name || '—';
  qs('#or1').textContent = get('Oración (inicio)')?.person1Name || '—';
  qs('#or2').textContent = get('Oración (final)')?.person1Name || '—';

  const listEl = qs('#partsList');
  listEl.innerHTML = '';

  if(week?.weekMode === 'sin_reunion'){
    const div = document.createElement('div');
    div.className = 'notice warn';
    div.innerHTML = `<b>Semana sin reunión VMC</b><br/>${week?.specialReason || 'Sin reunión.'}`;
    listEl.appendChild(div);
    return;
  }

  addSongLine(listEl, meta.songOpening);

  const groups = [
    { title:'TESOROS DE LA BIBLIA', match:x=>String(x.type).startsWith('Tesoros') },
    { title:'SEAMOS MEJORES MAESTROS', match:x=>String(x.type).startsWith('Maestros') },
    { title:'NUESTRA VIDA CRISTIANA', match:x=>String(x.type).startsWith('Vida Cristiana') || String(x.type).startsWith('Estudio bíblico') || x.type==='Discurso de servicio (viajante)' },
  ];

  const intro = get('Palabras de introducción');
  if(intro){
    const div = document.createElement('div');
    div.className='board-row compact';
    div.innerHTML = `<div class="left"><div class="main">Palabras de introducción</div></div><div class="right"><div class="name">${intro.person1Name || '—'}</div></div>`;
    listEl.appendChild(div);
  }

  for(const group of groups){
    const rows = asg.filter(group.match);
    if(!rows.length) continue;
    addSectionTitle(listEl, group.title);
    if(group.title === 'NUESTRA VIDA CRISTIANA') addSongLine(listEl, meta.songMiddle);
    for(const row of rows){
      const div = document.createElement('div');
      div.className='board-row';
      const helper = row.person2Name ? ` / ${row.person2Name}` : '';
      const number = row.partNo ? `${row.partNo}. ` : '';
      div.innerHTML = `<div class="left"><div class="sec">${row.minutes ? `${row.minutes} min` : ''}</div><div class="main">${number}${row.title || ''}</div><div class="small">${row.type}</div></div><div class="right"><div class="name">${(row.person1Name || '—') + helper}</div></div>`;
      listEl.appendChild(div);
    }
  }

  const conclusion = get('Palabras de conclusión');
  if(conclusion){
    const div = document.createElement('div');
    div.className='board-row compact';
    div.innerHTML = `<div class="left"><div class="main">Palabras de conclusión</div><div class="small">3 min</div></div><div class="right"><div class="name">${conclusion.person1Name || '—'}</div></div>`;
    listEl.appendChild(div);
  }

  addSongLine(listEl, meta.songClosing);
}
qs('#btnPrint').addEventListener('click', ()=>window.print());
qs('#btnPNG').addEventListener('click', async ()=>{
  const el = qs('#board');
  const canvas = await window.html2canvas(el, { scale: 2 });
  const a = document.createElement('a');
  a.download = `VMC_${weekISO}.png`;
  a.href = canvas.toDataURL('image/png');
  a.click();
});
load().catch(console.error);
