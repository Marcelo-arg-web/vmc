import { qs, Storage, fmtDateTitle, addDaysISO } from "./app.js";
import { mountHeader } from "./ui_common.js";
import { loadWeek, loadAssignments, loadAppSettings } from "./data.js";
import { canciones as cancionesImportadas } from "./canciones.js";

const cancionesMap = (() => {
  const globalMap = (typeof window !== "undefined" && (window.canciones || window.CANCIONES)) || {};
  return { ...globalMap, ...cancionesImportadas };
})();

mountHeader();

const urlWeek = new URLSearchParams(location.search).get("week") || "";
const currentWeek = urlWeek || Storage.get("currentWeekISO", "");
if(currentWeek) Storage.set("currentWeekISO", currentWeek);
const nextWeek = currentWeek ? addDaysISO(currentWeek, 7) : "";

function byType(asg, type){ return asg.find(x=>x.type===type); }
function rowsByType(asg, types){ return asg.filter(x=>types.includes(x.type)); }
function esc(s){ return String(s || '—').replace(/[&<>"]/g, m=>({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;' }[m])); }

function songLabel(num){
  const raw = String(num || '').trim();
  if(!raw) return 'Canción —';
  const m = raw.match(/(\d{1,3})/);
  const n = m ? Number(m[1]) : NaN;
  const title = Number.isFinite(n) ? (cancionesMap[n] || cancionesMap[String(n)]) : '';
  return title ? `Canción ${n}: ${title}` : `Canción ${raw}`;
}

function rowHtml({time="", topic="", assigned="", helper="", number="", single=false}){
  const assignHtml = helper || number
    ? `<div class="asg-pair"><div class="asg-main">${esc(assigned || '—')}</div><div class="asg-num">${esc(number || '')}</div><div class="asg-help">${esc(helper || '')}</div></div>`
    : `<div class="asg-solo">${esc(assigned || '—')}</div>`;
  return `<tr><td class="cell-time">${esc(time)}</td><td class="cell-bullet">•</td><td class="cell-topic">${esc(topic)}</td><td class="cell-assign">${assignHtml}</td></tr>`;
}

function sectionTable(sectionClass, sectionTitle, rows, hint=""){
  return `
    <div class="section-band ${sectionClass}">${sectionTitle}</div>
    ${hint ? `<div class="section-hint">${hint}</div>` : ''}
    <table class="program-table"><tbody>${rows.join('')}</tbody></table>`;
}

function buildWeekSheet(weekISO, app, w, asg){
  if(!w) return `<div class="week-sheet"><div class="week-date">${fmtDateTitle(weekISO)}</div><div class="special-empty">No hay datos guardados para esta semana.</div></div>`;
  if(!asg?.length && !["asamblea","conmemoracion","sin_reunion"].includes(w.weekType)){
    return `<div class="week-sheet"><div class="week-date">${fmtDateTitle(weekISO)}</div><div class="special-empty">La semana está guardada, pero todavía no hay asignaciones guardadas para imprimir.</div></div>`;
  }
  if(["asamblea","conmemoracion","sin_reunion"].includes(w.weekType)){
    return `<div class="week-sheet"><div class="week-date">${fmtDateTitle(weekISO)}</div><div class="special-empty">Esta semana no hay reunión. ${esc(w.specialReason || "Motivo especial")}</div></div>`;
  }

  const pres = byType(asg, "Presidente")?.person1Name || "—";
  const or1 = byType(asg, "Oración inicial")?.person1Name || "—";
  const or2 = byType(asg, "Oración final")?.person1Name || "—";
  const tes = byType(asg, "Tesoros");
  const per = byType(asg, "Perlas");
  const lec = byType(asg, "Lectura de la Biblia");
  const students = rowsByType(asg, ["Asignación estudiantil","Discurso de estudiante"]);
  const vida = rowsByType(asg, ["Nuestra vida cristiana","Necesidades de la congregación","Discurso del viajante"]);
  const conductor = byType(asg, "Conductor EBC");
  const lector = byType(asg, "Lector EBC");

  const inicioRows = [
    rowHtml({time:w.meetingTime || '19:30', topic:songLabel(w.openingSong), assigned:''}),
    rowHtml({topic:'Palabras de introducción (1 min.)', assigned:pres}),
  ];

  const tesorosRows = [
    rowHtml({topic:`${tes?.title || 'Tesoros de la Biblia'}${tes?.minutes ? ` (${tes.minutes} mins.)` : ''}`, assigned: tes?.person1Name}),
    rowHtml({topic:`Busquemos perlas escondidas${per?.minutes ? ` (${per.minutes} mins.)` : ''}`, assigned: per?.person1Name}),
    rowHtml({topic:`${lec?.title || 'Lectura de la Biblia'}${lec?.minutes ? ` (${lec.minutes} mins.)` : ''}`, assigned: lec?.person1Name, number:'3'}),
  ];

  const studentRows = students.length ? students.map((r, idx)=> rowHtml({
    topic:`${r.title || r.type}${r.minutes ? ` (${r.minutes} mins.)` : ''}`,
    assigned:r.person1Name,
    helper:r.person2Name,
    number:String(idx+4)
  })) : [rowHtml({topic:'Sin asignaciones estudiantiles detectadas', assigned:''})];

  const vidaRows = [
    rowHtml({topic:songLabel(w.middleSong), assigned:''}),
    ...(vida.length ? vida.map(r=>rowHtml({topic:`${r.title || r.type}${r.minutes ? ` (${r.minutes} mins.)` : ''}`, assigned:r.person1Name})) : [rowHtml({topic:'Sin parte previa al estudio', assigned:''})]),
    ...(conductor ? [rowHtml({topic:`${conductor.title || 'Estudio bíblico de la congregación'} (${conductor.minutes || 30} mins.)`, assigned: conductor.person1Name, helper: lector?.person1Name, number:'L'})] : []),
    rowHtml({topic:'Repaso de esta reunión, adelanto de la próxima y anuncios (3 mins.)', assigned:pres}),
    rowHtml({topic:songLabel(w.closingSong), assigned:''}),
  ];

  return `
  <div class="week-sheet">
    <div class="week-top">
      <div>
        <div class="week-date">${fmtDateTitle(weekISO)}</div>
        <div class="week-reading">LECTURA SEMANAL DE LA BIBLIA | ${esc((w.reading || '').toUpperCase() || '—')}</div>
      </div>
      <div class="side-grid">
        <div class="label">Presidente:</div><div class="value">${esc(pres)}</div>
        <div class="label">Oración:</div><div class="value">${esc(or1)}</div>
      </div>
    </div>

    ${sectionTable('tesoros', 'INICIO Y TESOROS DE LA BIBLIA', [...inicioRows, ...tesorosRows], 'Auditorio principal')}
    ${sectionTable('maestros', 'SEAMOS MEJORES MAESTROS', studentRows, 'Titular / Nº / Ayudante')}
    ${sectionTable('vida', 'NUESTRA VIDA CRISTIANA', vidaRows, conductor ? 'Asignado / Lector' : '')}

    <div class="footer-line"><div></div><div class="right">Oración final: ${esc(or2)}</div></div>
  </div>`;
}

async function exportBoardAsImage(){
  const board = qs('#board');
  try {
    if (window.html2canvas) {
      const canvas = await window.html2canvas(board, {
        backgroundColor: '#ffffff',
        scale: 2,
        useCORS: true,
        logging: false,
        windowWidth: document.documentElement.scrollWidth,
      });
      const a = document.createElement('a');
      a.href = canvas.toDataURL('image/png');
      a.download = `tablero_${currentWeek || 'semana'}.png`;
      a.click();
      return;
    }
  } catch (err) {
    console.error('html2canvas falló', err);
  }

  try {
    const cloned = board.cloneNode(true);
    inlineComputedStyles(board, cloned);
    const wrapper = document.createElement('div');
    wrapper.style.background = '#fff';
    wrapper.appendChild(cloned);
    const data = new XMLSerializer().serializeToString(wrapper);
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${Math.ceil(board.scrollWidth)}" height="${Math.ceil(board.scrollHeight)}"><foreignObject width="100%" height="100%">${data}</foreignObject></svg>`;
    const blob = new Blob([svg], {type:'image/svg+xml;charset=utf-8'});
    const url = URL.createObjectURL(blob);
    const img = new Image();
    img.onload = ()=>{
      const canvas = document.createElement('canvas');
      canvas.width = img.width * 2;
      canvas.height = img.height * 2;
      const ctx = canvas.getContext('2d');
      ctx.scale(2,2);
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0,0,img.width,img.height);
      ctx.drawImage(img,0,0);
      URL.revokeObjectURL(url);
      const a = document.createElement('a');
      a.href = canvas.toDataURL('image/png');
      a.download = `tablero_${currentWeek || 'semana'}.png`;
      a.click();
    };
    img.onerror = ()=>{ URL.revokeObjectURL(url); alert('No se pudo generar la imagen en este navegador.'); };
    img.src = url;
  } catch (err) {
    console.error(err);
    alert('No se pudo generar la imagen en este navegador.');
  }
}

function inlineComputedStyles(sourceNode, targetNode){
  const sourceChildren = sourceNode.children || [];
  const targetChildren = targetNode.children || [];
  const style = window.getComputedStyle(sourceNode);
  targetNode.setAttribute('style', Array.from(style).map(p => `${p}:${style.getPropertyValue(p)};`).join(' '));
  for(let i=0;i<sourceChildren.length;i++){
    inlineComputedStyles(sourceChildren[i], targetChildren[i]);
  }
}

async function load(){
  const app = await loadAppSettings();
  qs("#cong").textContent = `CONG.: "${String(app.congregacion || "Villa Fiad").toUpperCase()}"`;
  const weeks = [currentWeek, nextWeek].filter(Boolean);
  const data = await Promise.all(weeks.map(async iso => ({ iso, w: await loadWeek(iso), asg: await loadAssignments(iso) })));
  qs("#weeksContainer").innerHTML = data.map(x=>buildWeekSheet(x.iso, app, x.w, x.asg)).join("");
}

qs("#btnPrint").addEventListener("click", ()=>window.print());
qs("#btnExportImage").addEventListener("click", exportBoardAsImage);
load();
