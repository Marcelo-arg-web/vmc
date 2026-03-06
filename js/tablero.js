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

function rowHtml(type, title, names){
  return `<div class="board-row"><div class="left"><div class="sec">${type}</div><div class="main">${title || ''}</div></div><div class="right"><div class="name">${names || '—'}</div></div></div>`;
}

async function load(){
  const [asg, week] = await Promise.all([loadAssignments(weekISO), loadWeek(weekISO)]);
  qs('#cong').textContent = Storage.get('congregacion', 'CONG.: "VILLA FIAD"');
  qs('#title').textContent = 'Vida y Ministerio Cristianos';
  const when = [fmtDateAR(weekISO), week?.meetingDay, week?.meetingTime].filter(Boolean).join(' · ');
  qs('#date').textContent = when || fmtDateAR(weekISO);

  const get = (type) => asg.find(x=>x.type===type);
  qs('#pres').textContent = get('Presidente')?.person1Name || '—';
  qs('#or1').textContent = get('Oración (inicio)')?.person1Name || '—';
  qs('#or2').textContent = get('Oración (final)')?.person1Name || '—';

  const listEl = qs('#partsList');
  listEl.innerHTML = '';

  if(['asamblea','conmemoracion','sin_reunion'].includes(week?.weekType)){
    addSectionTitle(listEl, 'Semana especial');
    listEl.innerHTML += rowHtml('Sin reunión', week?.specialReason || 'No habrá reunión de entre semana esta semana.', '—');
    return;
  }

  const groups = [
    { title:'Tesoros de la Biblia', match:x=>String(x.type).startsWith('Tesoros') },
    { title:'Seamos mejores maestros', match:x=>String(x.type).startsWith('Maestros') },
    { title:'Nuestra vida cristiana', match:x=>String(x.type).startsWith('Vida Cristiana') || String(x.type).startsWith('Estudio bíblico') || x.type==='Repaso y anuncios' || x.type==='Discurso del viajante' },
  ];

  for(const group of groups){
    const rows = asg.filter(group.match);
    if(!rows.length) continue;
    addSectionTitle(listEl, group.title);
    for(const row of rows){
      const helper = row.person2Name ? ` / ${row.person2Name}` : '';
      listEl.innerHTML += rowHtml(row.type, row.title || '', (row.person1Name || '—') + helper);
    }
  }
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
