import { qs, Storage, fmtDateTitle, addDaysISO } from "./app.js";
import { mountHeader, requireAuthOrRedirect } from "./ui_common.js";
import { loadWeek, loadAssignments, loadAppSettings } from "./data.js";
import { canciones } from "./canciones.js";

mountHeader();
await requireAuthOrRedirect();

const urlWeek = new URLSearchParams(location.search).get("week") || "";
const currentWeek = urlWeek || Storage.get("currentWeekISO", "");
if(currentWeek) Storage.set("currentWeekISO", currentWeek);
const nextWeek = currentWeek ? addDaysISO(currentWeek, 7) : "";

function byType(asg, type){ return asg.find(x=>x.type===type); }
function rowsByType(asg, types){ return asg.filter(x=>types.includes(x.type)); }
function isAuxRow(row){ return row?.isAuxRoom === true || String(row?.key || "").endsWith("_sala_b"); }
function isMainRow(row){ return !isAuxRow(row); }
function roomName(row, fallback="Auditorio principal"){ return String(row?.room || fallback).trim(); }
function topicWithRoom(row, fallbackRoom="Auditorio principal"){
  const base = row?.title || row?.type || "";
  return row?.room ? `${base} — ${roomName(row, fallbackRoom)}` : base;
}
function esc(s){ return String(s || '—').replace(/[&<>"]/g, m=>({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;' }[m])); }

function songLabel(num){
  const raw = String(num || '').trim();
  if(!raw) return 'Canción —';
  const m = raw.match(/(\d{1,3})/);
  const n = m ? Number(m[1]) : NaN;
  const title = Number.isFinite(n) ? canciones[n] : '';
  return title ? `Canción ${n}: ${title}` : `Canción ${raw}`;
}

function rowHtml({time="", topic="", assigned="", helper="", number="", marker="", single=false}){
  const assignHtml = helper
    ? `<div class="asg-pair"><div class="asg-main">${esc(assigned || '—')}</div><div class="asg-num">${esc(number || '')}</div><div class="asg-help">${esc(helper || '')}</div></div>`
    : `<div class="asg-solo">${esc(assigned || '—')}</div>`;
  const bullet = marker || (number ? String(number) : '•');
  return `<tr><td class="cell-time">${esc(time)}</td><td class="cell-bullet ${number ? 'is-number' : ''}">${esc(bullet)}</td><td class="cell-topic">${esc(topic)}</td><td class="cell-assign">${assignHtml}</td></tr>`;
}

function sectionTable(sectionClass, sectionTitle, rows, hint=""){
  return `
    <div class="section-band ${sectionClass}">${sectionTitle}</div>
    ${hint ? `<div class="section-hint">${hint}</div>` : ''}
    <table class="program-table"><tbody>${rows.join('')}</tbody></table>`;
}

function buildWeekSheet(weekISO, app, w, asg){
  const displayISO = w?.meetingDateISO || w?.weekISO || weekISO;
  if(!w) return `<div class="week-sheet"><div class="week-date">${fmtDateTitle(displayISO)}</div><div class="special-empty">No hay datos guardados para esta semana.</div></div>`;
  if(!asg?.length && !["asamblea","conmemoracion","sin_reunion"].includes(w.weekType)){
    return `<div class="week-sheet"><div class="week-date">${fmtDateTitle(displayISO)}</div><div class="special-empty">La semana está guardada, pero todavía no hay asignaciones guardadas para imprimir.</div></div>`;
  }
  if(["asamblea","conmemoracion","sin_reunion"].includes(w.weekType)){
    return `<div class="week-sheet"><div class="week-date">${fmtDateTitle(displayISO)}</div><div class="special-empty">Esta semana no hay reunión. ${esc(w.specialReason || "Motivo especial")}</div></div>`;
  }

  const auxEnabled = typeof w?.auxRoomEnabled === "boolean" ? w.auxRoomEnabled : (app?.enableAuxRoom === true || asg.some(isAuxRow));
  const visibleAsg = auxEnabled ? asg : asg.filter(isMainRow);
  const auxLabel = String(w?.auxRoomName || app?.auxRoomName || "Sala B").trim() || "Sala B";
  const pres = byType(visibleAsg, "Presidente")?.person1Name || "—";
  const or1 = byType(visibleAsg, "Oración inicial")?.person1Name || "—";
  const or2 = byType(visibleAsg, "Oración final")?.person1Name || "—";
  const tes = byType(visibleAsg, "Tesoros");
  const per = byType(visibleAsg, "Perlas");
  const lecturas = rowsByType(visibleAsg, ["Lectura de la Biblia"]);
  const lecMain = lecturas.find(isMainRow) || lecturas[0];
  const lecAux = lecturas.find(isAuxRow);
  const students = rowsByType(visibleAsg, ["Asignación estudiantil","Discurso de estudiante"]);
  const vida = rowsByType(visibleAsg, ["Nuestra vida cristiana","Necesidades de la congregación","Discurso del viajante"]);
  const conductor = byType(visibleAsg, "Conductor EBC");
  const lector = byType(visibleAsg, "Lector EBC");

  const inicioRows = [
    rowHtml({time:w.meetingTime || '19:30', topic:songLabel(w.openingSong), assigned:''}),
    rowHtml({topic:'Palabras de introducción (1 min.)', assigned:pres, marker:'•'}),
  ];

  const lecturaRows = [];
  if(lecMain){
    lecturaRows.push(rowHtml({
      topic:`${topicWithRoom(lecMain)}${lecMain?.minutes ? ` (${lecMain.minutes} mins.)` : ''}`,
      assigned: lecMain?.person1Name,
      number: lecMain?.number || '3'
    }));
  }
  if(auxEnabled && lecAux){
    lecturaRows.push(rowHtml({
      topic:`${topicWithRoom(lecAux, auxLabel)}${lecAux?.minutes ? ` (${lecAux.minutes} mins.)` : ''}`,
      assigned: lecAux?.person1Name,
      number: lecAux?.number || '3'
    }));
  }

  const tesorosRows = [
    rowHtml({topic:`${tes?.title || 'Tesoros de la Biblia'}${tes?.minutes ? ` (${tes.minutes} mins.)` : ''}`, assigned: tes?.person1Name, number: tes?.number || '1'}),
    rowHtml({topic:`Busquemos perlas escondidas${per?.minutes ? ` (${per.minutes} mins.)` : ''}`, assigned: per?.person1Name, number: per?.number || '2'}),
    ...(lecturaRows.length ? lecturaRows : [rowHtml({topic:'Lectura de la Biblia', assigned:'', number:'3'})]),
  ];

  const studentRows = students.length ? students.map((r, idx)=> rowHtml({
    topic:`${topicWithRoom(r, isAuxRow(r) ? auxLabel : 'Auditorio principal')}${r.minutes ? ` (${r.minutes} mins.)` : ''}`,
    assigned:r.person1Name,
    helper:r.person2Name,
    number:r.number || String(idx+4)
  })) : [rowHtml({topic:'Sin asignaciones estudiantiles detectadas', assigned:''})];

  const vidaRows = [
    rowHtml({topic:songLabel(w.middleSong), assigned:'', marker:'•'}),
    ...(vida.length ? vida.map((r, idx)=>rowHtml({topic:`${r.title || r.type}${r.minutes ? ` (${r.minutes} mins.)` : ''}`, assigned:r.person1Name, number: r.number || String(idx + 8)})) : [rowHtml({topic:'Sin parte previa al estudio', assigned:''})]),
    ...(conductor ? [rowHtml({topic:`${conductor.title || 'Estudio bíblico de la congregación'} (${conductor.minutes || 30} mins.)`, assigned: conductor.person1Name, helper: lector?.person1Name, number:'L', marker: conductor.number || '9'})] : []),
    rowHtml({topic:'Repaso de esta reunión, adelanto de la próxima y anuncios (3 mins.)', assigned:pres, marker:'•'}),
    rowHtml({topic:songLabel(w.closingSong), assigned:'', marker:'•'}),
  ];

  return `
  <div class="week-sheet">
    <div class="week-top">
      <div>
        <div class="week-date">${fmtDateTitle(displayISO)}</div>
        <div class="week-reading">LECTURA SEMANAL DE LA BIBLIA | ${esc((w.reading || '').toUpperCase() || '—')}</div>
      </div>
      <div class="side-grid">
        <div class="label">Presidente:</div><div class="value">${esc(pres)}</div>
        <div class="label">Oración:</div><div class="value">${esc(or1)}</div>
        ${auxEnabled ? `<div class="label">Sala auxiliar:</div><div class="value">${esc(auxLabel)}</div>` : ''}
      </div>
    </div>

    ${sectionTable('tesoros', 'INICIO Y TESOROS DE LA BIBLIA', [...inicioRows, ...tesorosRows], auxEnabled ? `Auditorio principal y ${auxLabel}` : 'Auditorio principal')}
    ${sectionTable('maestros', 'SEAMOS MEJORES MAESTROS', studentRows, auxEnabled ? `Auditorio principal y ${auxLabel} / Titular / Nº / Ayudante` : 'Titular / Nº / Ayudante')}
    ${sectionTable('vida', 'NUESTRA VIDA CRISTIANA', vidaRows, conductor ? 'Asignado / Lector' : '')}

    <div class="footer-line"><div></div><div class="right">Oración final: ${esc(or2)}</div></div>
  </div>`;
}

async function exportBoardAsImage(){
  const board = qs('#board');
  const styles = Array.from(document.querySelectorAll('style,link[rel="stylesheet"]')).map(el=>el.outerHTML).join('');
  const clone = board.cloneNode(true);
  const wrapper = document.createElement('div');
  wrapper.appendChild(clone);
  const html = `<!doctype html><html><head><meta charset="utf-8">${styles}</head><body class="image-exporting">${wrapper.innerHTML}</body></html>`;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1400" height="${Math.ceil(board.scrollHeight * 1400 / board.scrollWidth)}"><foreignObject width="100%" height="100%">${html.replace(/&/g, '&amp;').replace(/#/g, '%23')}</foreignObject></svg>`;
  const blob = new Blob([svg], {type:'image/svg+xml;charset=utf-8'});
  const url = URL.createObjectURL(blob);
  const img = new Image();
  img.onload = ()=>{
    const canvas = document.createElement('canvas');
    canvas.width = img.width;
    canvas.height = img.height;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0,0,canvas.width,canvas.height);
    ctx.drawImage(img,0,0);
    URL.revokeObjectURL(url);
    canvas.toBlob(blob=>{
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `tablero_${currentWeek || 'semana'}.png`;
      a.click();
      setTimeout(()=>URL.revokeObjectURL(a.href), 1000);
    }, 'image/png');
  };
  img.onerror = ()=>{ URL.revokeObjectURL(url); alert('No se pudo generar la imagen en este navegador.'); };
  img.src = url;
}

async function load(){
  const app = await loadAppSettings();
  qs("#cong").textContent = `CONG.: "${String(app.congregacion || "").toUpperCase()}"`;
  const weeks = [currentWeek, nextWeek].filter(Boolean);
  const data = await Promise.all(weeks.map(async iso => ({ iso, w: await loadWeek(iso), asg: await loadAssignments(iso) })));
  qs("#weeksContainer").innerHTML = data.map(x=>buildWeekSheet(x.iso, app, x.w, x.asg)).join("");
}

qs("#btnPrint").addEventListener("click", ()=>window.print());
qs("#btnExportImage").addEventListener("click", exportBoardAsImage);
load();
