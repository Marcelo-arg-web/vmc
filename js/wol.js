import { markUnsaved } from "./app.js";

export function buildFetchUrl(wolUrl, proxyBase){
  const clean = (wolUrl || '').trim();
  if(!clean) return null;
  if(proxyBase) return proxyBase + encodeURIComponent(clean);
  return "https://r.jina.ai/http://" + clean.replace(/^https?:\/\//, "");
}

function stripTags(html){
  return html.replace(/<script[\s\S]*?<\/script>/gi, "")
             .replace(/<style[\s\S]*?<\/style>/gi, "");
}

function textFromHTML(html){
  const cleaned = stripTags(html);
  const doc = new DOMParser().parseFromString(cleaned, "text/html");
  const text = doc.body ? doc.body.innerText : "";
  return text.replace(//g, "").replace(/[ 	]+/g, " ").replace(/
{3,}/g, "

");
}

function pickSection(text, startMarkers, endMarkers){
  const lower = text.toLowerCase();
  let startIdx = -1;
  for(const m of startMarkers){
    const i = lower.indexOf(m.toLowerCase());
    if(i !== -1){ startIdx = i; break; }
  }
  if(startIdx === -1) return "";
  let endIdx = lower.length;
  for(const m of endMarkers){
    const i = lower.indexOf(m.toLowerCase(), startIdx + 10);
    if(i !== -1) endIdx = Math.min(endIdx, i);
  }
  return text.slice(startIdx, endIdx);
}

function cleanTitle(s){
  return (s || '').replace(/\s+/g, ' ').replace(/\s*\|\s*/g, ' | ').trim();
}

function parseItems(sectionText, nums){
  const lines = sectionText.split('
').map(l => l.trim()).filter(Boolean);
  const items = [];
  for(let i = 0; i < lines.length; i++){
    const m = lines[i].match(/^(\d{1,2})\.\s+(.*)$/);
    if(!m) continue;
    const num = parseInt(m[1], 10);
    if(nums && !nums.includes(num)) continue;

    let block = m[2];
    let j = i + 1;
    while(j < lines.length && !/^\d{1,2}\.\s+/.test(lines[j])){
      block += ' ' + lines[j];
      j += 1;
    }
    i = j - 1;

    const mm = block.match(/\((\d+)\s*(?:min\.?|mins\.?|minutos?)\)/i);
    const minutes = mm ? parseInt(mm[1], 10) : '';
    let title = block.replace(/\((\d+)\s*(?:min\.?|mins\.?|minutos?)\)/ig, '').trim();
    title = title.replace(/^["“”]/, '').trim();
    items.push({ num, title: cleanTitle(title), minutes });
  }
  return items;
}

function detectWeekLabel(lines){
  return lines.find(line => /DE/.test(line) && /[A-ZÁÉÍÓÚÑ]/.test(line)) || '';
}

function detectBibleReading(lines){
  return lines.find(line => /^[1-3]?[A-ZÁÉÍÓÚÑ]+\s+\d+/.test(line) || /^[A-ZÁÉÍÓÚÑ]+\s+\d+/.test(line)) || '';
}

function detectSong(lines, prefix){
  const line = lines.find(l => l.toLowerCase().includes(prefix));
  if(!line) return '';
  const m = line.match(/canci[oó]n\s+(\d+)/i);
  return m ? `Canción ${m[1]}` : line;
}

function detectOpeningLine(lines){
  return lines.find(l => /Palabras de introducci[oó]n/.test(l) && /Canci[oó]n/.test(l)) || '';
}

function typeForItem(section, num, title){
  const t = (title || '').toLowerCase();
  if(section === 'Tesoros de la Biblia'){
    if(num === 1) return 'Tesoros 1 (Discurso)';
    if(num === 2) return 'Tesoros 2 (Perlas)';
    return 'Tesoros 3 (Lectura Biblia)';
  }
  if(section === 'Seamos mejores maestros') return `Maestros ${num}`;
  if(t.includes('estudio bíblico de la congregación') || t.includes('estudio biblico de la congregacion')) return 'Estudio bíblico (Conductor)';
  return `Vida Cristiana ${num}`;
}

export async function fetchAndParseWOL({ wolUrl, proxyBase = null }){
  const url = buildFetchUrl(wolUrl, proxyBase);
  if(!url) throw new Error("Pegá un link de WOL.");
  const res = await fetch(url);
  if(!res.ok) throw new Error("No se pudo leer WOL. Probá de nuevo o usá un proxy.");
  const html = await res.text();
  const text = textFromHTML(html);
  const lines = text.split('
').map(x=>x.trim()).filter(Boolean);

  const tes = pickSection(text, ["TESOROS DE LA BIBLIA"], ["SEAMOS MEJORES MAESTROS", "NUESTRA VIDA CRISTIANA"]);
  const mae = pickSection(text, ["SEAMOS MEJORES MAESTROS"], ["NUESTRA VIDA CRISTIANA"]);
  const vida = pickSection(text, ["NUESTRA VIDA CRISTIANA"], ["PALABRAS DE CONCLUSIÓN", "PALABRAS DE CONCLUSION", "S-140", "NOTAS", "FIN"]);

  const parts = [];
  for(const it of parseItems(tes, [1, 2, 3])){
    parts.push({
      partNo: it.num,
      section: 'Tesoros de la Biblia',
      type: typeForItem('Tesoros de la Biblia', it.num, it.title),
      title: it.title,
      minutes: it.minutes || ''
    });
  }
  for(const it of parseItems(mae, [4, 5, 6])){
    parts.push({
      partNo: it.num,
      section: 'Seamos mejores maestros',
      type: typeForItem('Seamos mejores maestros', it.num, it.title),
      title: it.title,
      minutes: it.minutes || ''
    });
  }
  for(const it of parseItems(vida, [7, 8, 9])){
    const low = (it.title || '').toLowerCase();
    if(low.includes('estudio bíblico de la congregación') || low.includes('estudio biblico de la congregacion')){
      parts.push({ partNo: it.num, section: 'Nuestra vida cristiana', type: 'Estudio bíblico (Conductor)', title: it.title, minutes: it.minutes || 30 });
      parts.push({ partNo: it.num, section: 'Nuestra vida cristiana', type: 'Estudio bíblico (Lector)', title: it.title, minutes: it.minutes || 30 });
    } else {
      parts.push({
        partNo: it.num,
        section: 'Nuestra vida cristiana',
        type: typeForItem('Nuestra vida cristiana', it.num, it.title),
        title: it.title,
        minutes: it.minutes || ''
      });
    }
  }

  markUnsaved("Se cargó el programa desde WOL.");
  return {
    parts,
    meta: {
      weekLabel: detectWeekLabel(lines),
      bibleReading: detectBibleReading(lines),
      openingLine: detectOpeningLine(lines),
      songOpening: detectSong(lines, 'canción'),
      songMiddle: detectSong(lines, 'nuestra vida cristiana'),
      songClosing: lines.find(l => /Palabras de conclusi[oó]n/.test(l) && /Canci[oó]n/.test(l)) || ''
    },
    rawTextSample: text.slice(0, 2000)
  };
}
