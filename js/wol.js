import { markUnsaved } from "./app.js";

export function buildFetchUrl(wolUrl, proxyBase){
  const clean = (wolUrl || "").trim();
  if(!clean) return null;
  if(proxyBase) return proxyBase + encodeURIComponent(clean);
  return "https://r.jina.ai/http://" + clean.replace(/^https?:\/\//, "");
}

function compact(s){
  return (s || "").replace(/\s+/g, " ").trim();
}

function normalizeForSearch(s){
  return (s || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

function cleanSourceText(raw){
  return (raw || "")
    .replace(/\r/g, "")
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/\[([^\]]+)\]\((?:https?:\/\/)?[^)]+\)/g, "$1")
    .replace(/\*\*/g, "")
    .replace(/[`>*_]/g, "")
    .replace(/\u00a0/g, " ")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n");
}

function splitLines(text){
  return cleanSourceText(text)
    .split("\n")
    .map(line => compact(line))
    .filter(Boolean);
}

function parseHeadingNumber(line){
  const m = line.match(/^#+\s*(\d+)\.\s+(.+)$/);
  if(m) return { num: Number(m[1]), title: compact(m[2]) };
  const m2 = line.match(/^(\d+)\.\s+(.+)$/);
  if(m2) return { num: Number(m2[1]), title: compact(m2[2]) };
  return null;
}

function parseMinutes(text){
  const m = (text || "").match(/\((\d+)\s*min/i);
  return m ? Number(m[1]) : "";
}

function takeFirstMatch(lines, regex){
  for(const line of lines){
    const m = line.match(regex);
    if(m) return m;
  }
  return null;
}

function parseReading(lines){
  const explicit = takeFirstMatch(lines, /lectura semanal de la biblia\s*[:| -]*\s*(.+)$/i);
  if(explicit) return compact(explicit[1]);
  const line = lines.find(l => /^##\s+/.test(l) && !/^(##\s+tesoros|##\s+seamos|##\s+nuestra)/i.test(l));
  if(line){
    return compact(line.replace(/^##\s+/, ""));
  }
  return "";
}

function parseSongs(lines){
  let openingSong = "";
  let middleSong = "";
  let closingSong = "";

  const opening = lines.find(l => /canci[oó]n\s+\d+\s+y\s+oraci[oó]n/i.test(l));
  const closing = [...lines].reverse().find(l => /canci[oó]n\s+\d+\s+y\s+oraci[oó]n/i.test(l));
  const middle = lines.find(l => /^#+\s*canci[oó]n\s+\d+$/i.test(l));

  if(opening){
    const m = opening.match(/canci[oó]n\s+(\d+)/i);
    if(m) openingSong = m[1];
  }
  if(closing){
    const m = closing.match(/canci[oó]n\s+(\d+)/i);
    if(m) closingSong = m[1];
  }
  if(middle){
    const m = middle.match(/canci[oó]n\s+(\d+)/i);
    if(m) middleSong = m[1];
  }

  return { openingSong, middleSong, closingSong };
}

function parseBibleReadingDetail(lines){
  const idx = lines.findIndex(l => /lectura de la biblia/i.test(l));
  if(idx === -1) return "";
  for(let i = idx + 1; i < Math.min(lines.length, idx + 4); i++){
    const m = lines[i].match(/^\((\d+)\s*mins?\.?(?:\))?\s*(.+)$/i);
    if(m){
      const after = compact(m[2].replace(/\([^)]*\)\.?$/g, ""));
      if(after) return after;
    }
    const m2 = lines[i].match(/^(.+?)\s*\((?:th|lmd)\b/i);
    if(m2) return compact(m2[1]);
  }
  return "";
}

function parseStudyDetail(lines){
  const idx = lines.findIndex(l => /estudio b[ií]blico de la congregaci[oó]n/i.test(l));
  if(idx === -1) return "";
  for(let i = idx + 1; i < Math.min(lines.length, idx + 4); i++){
    if(/^\(/.test(lines[i])){
      const m = lines[i].match(/^\((\d+)\s*mins?\.?(?:\))?\s*(.+)$/i);
      if(m) return compact(m[2]);
    }
  }
  return "";
}

function parseStructuredParts(lines){
  const items = [];
  let currentSection = "";

  for(let i = 0; i < lines.length; i++){
    const line = lines[i];
    const n = normalizeForSearch(line);

    if(/##\s+tesoros de la biblia/i.test(line)){
      currentSection = "Tesoros de la Biblia";
      continue;
    }
    if(/##\s+seamos mejores maestros/i.test(line)){
      currentSection = "Seamos mejores maestros";
      continue;
    }
    if(/##\s+nuestra vida cristiana/i.test(line)){
      currentSection = "Nuestra vida cristiana";
      continue;
    }

    const heading = parseHeadingNumber(line);
    if(!heading) continue;

    const detailLines = [];
    for(let j = i + 1; j < lines.length; j++){
      const next = lines[j];
      if(/^##\s+/.test(next) || parseHeadingNumber(next) || /^#+\s*canci[oó]n\s+\d+/i.test(next) || /palabras de conclusi[oó]n/i.test(next)) break;
      detailLines.push(next);
    }

    const minutes = parseMinutes(detailLines[0] || "") || parseMinutes(heading.title) || "";
    const detailText = compact(detailLines.join(" "));
    items.push({
      section: currentSection,
      num: heading.num,
      title: heading.title,
      minutes,
      detailText
    });
  }
  return items;
}

function buildPartsFromItems(lines, items){
  const parts = [];
  const readingRange = parseBibleReadingDetail(lines);
  const studyDetail = parseStudyDetail(lines);

  for(const item of items){
    const titleNorm = normalizeForSearch(item.title);

    if(item.section === "Tesoros de la Biblia"){
      if(item.num === 1){
        parts.push({ section:item.section, type:"Tesoros", title:item.title, minutes:item.minutes || 10, detail:item.detailText });
      } else if(item.num === 2){
        parts.push({ section:item.section, type:"Perlas", title:"Busquemos perlas escondidas", minutes:item.minutes || 10 });
      } else if(item.num === 3){
        parts.push({ section:item.section, type:"Lectura de la Biblia", title:"Lectura de la Biblia", minutes:item.minutes || 4, detail: readingRange });
      }
      continue;
    }

    if(item.section === "Seamos mejores maestros"){
      parts.push({
        section:item.section,
        type:/discurso/i.test(titleNorm) ? "Discurso de estudiante" : "Asignación estudiantil",
        title:item.title,
        minutes:item.minutes || "",
        detail:item.detailText,
        needsHelper: !/discurso/i.test(titleNorm)
      });
      continue;
    }

    if(item.section === "Nuestra vida cristiana"){
      if(/estudio b[ií]blico de la congregaci[oó]n/i.test(titleNorm)){
        const ebcTitle = studyDetail ? `Estudio bíblico de la congregación — ${studyDetail}` : "Estudio bíblico de la congregación";
        parts.push({ section:item.section, type:"Conductor EBC", title: ebcTitle, minutes:item.minutes || 30, detail: studyDetail });
        parts.push({ section:item.section, type:"Lector EBC", title: ebcTitle, minutes:item.minutes || 30, detail: studyDetail });
      } else if(!/cancion/i.test(titleNorm) && !/palabras de conclusion/i.test(titleNorm)){
        parts.push({
          section:item.section,
          type:/necesidades de la congregacion/i.test(titleNorm) ? "Necesidades de la congregación" : "Nuestra vida cristiana",
          title:item.title,
          minutes:item.minutes || "",
          detail:item.detailText
        });
      }
    }
  }

  return parts;
}

export async function fetchAndParseWOL({ wolUrl, proxyBase = null }){
  const url = buildFetchUrl(wolUrl, proxyBase);
  if(!url) throw new Error("Pegá un link de WOL.");

  const res = await fetch(url);
  if(!res.ok) throw new Error("No se pudo leer WOL.");
  const raw = await res.text();
  const lines = splitLines(raw);
  const reading = parseReading(lines);
  const songs = parseSongs(lines);
  const items = parseStructuredParts(lines);
  const parts = buildPartsFromItems(lines, items);

  if(!parts.length) throw new Error("No se detectaron asignaciones en WOL.");

  markUnsaved("Se cargó el programa desde WOL.");
  return {
    parts,
    meta: {
      reading,
      openingSong: songs.openingSong,
      middleSong: songs.middleSong,
      closingSong: songs.closingSong,
      ebcTitle: (parts.find(p => p.type === "Conductor EBC") || {}).detail || ""
    },
    rawTextSample: lines.slice(0, 120).join("\n")
  };
}
