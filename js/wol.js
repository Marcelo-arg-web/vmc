import { markUnsaved } from "./app.js";

const DEFAULT_PROXIES = [
  (u)=>u,
  (u)=>"https://api.allorigins.win/raw?url=" + encodeURIComponent(u),
  (u)=>"https://r.jina.ai/http://" + u.replace(/^https?:\/\//, ""),
  (u)=>"https://api.codetabs.com/v1/proxy?quest=" + encodeURIComponent(u)
];

export function buildFetchCandidates(wolUrl, proxyBase){
  const clean = (wolUrl || "").trim();
  if(!clean) return [];
  if(proxyBase) return [proxyBase + encodeURIComponent(clean)];
  return DEFAULT_PROXIES.map(fn => fn(clean));
}

function compact(s){
  return (s || "").replace(/\s+/g, " ").trim();
}

function normalizeForSearch(s){
  return (s || "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();
}

function decodeEntities(s){
  return (s || "")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/ /g, " ");
}

function cleanSourceText(raw){
  return decodeEntities(raw || "")
    .replace(//g, "")
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<br\s*\/?>/gi, "
")
    .replace(/<[^>]+>/g, " ")
    .replace(/\[([^\]]+)\]\((?:https?:\/\/)?[^)]+\)/g, "$1")
    .replace(/【\d+†[^】]*】/g, "")
    .replace(/[\[\]()*`_]/g, "")
    .replace(/[ 	]+/g, " ")
    .replace(/
{3,}/g, "

");
}

function splitLines(text){
  return cleanSourceText(text)
    .split("
")
    .map(line => compact(line))
    .filter(Boolean)
    .filter(line => !/^respuesta$/i.test(line));
}

function parseHeadingNumber(line){
  const m = line.match(/^#+\s*(\d+)\.\s+(.+)$/);
  if(m) return { num: Number(m[1]), title: compact(m[2]) };
  const m2 = line.match(/^(\d+)\.\s+(.+)$/);
  if(m2) return { num: Number(m2[1]), title: compact(m2[2]) };
  return null;
}

function parseMinutes(text){
  const m = (text || "").match(/\((\d+)\s*mins?\.?\)/i);
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
  const explicit = takeFirstMatch(lines, /lectura semanal(?: de la biblia)?\s*[:| -]*\s*(.+)$/i);
  if(explicit) return compact(explicit[1]);
  const line = lines.find(l => /^##\s+/.test(l) && !/^(##\s+tesoros|##\s+seamos|##\s+nuestra)/i.test(l));
  if(line) return compact(line.replace(/^##\s+/, ""));
  return "";
}

function parseSongs(lines){
  const songLines = lines.filter(l => /canci[oó]n\s+\d+/i.test(l));
  const nums = songLines.map(l => (l.match(/canci[oó]n\s+(\d+)/i) || [])[1]).filter(Boolean);
  return {
    openingSong: nums[0] || "",
    middleSong: nums[1] || "",
    closingSong: nums[nums.length - 1] || ""
  };
}

function cleanDetailText(s){
  return compact((s || "")
    .replace(/^\((\d+)\s*mins?\.?\)\s*/i, "")
    .replace(/\((?:th|lmd)[^)]+\)$/i, "")
    .replace(/[.;]\s*$/g, ""));
}

function parseBibleReadingDetail(lines){
  const idx = lines.findIndex(l => /lectura de la biblia/i.test(l));
  if(idx === -1) return "";
  for(let i = idx + 1; i < Math.min(lines.length, idx + 4); i++){
    const m = lines[i].match(/^\((\d+)\s*mins?\.?\)\s*(.+)$/i);
    if(m) return cleanDetailText(m[2]);
    if(/^[1-3]?\s*[A-ZÁÉÍÓÚÑa-záéíóúñ]+\s*\d/.test(lines[i])) return cleanDetailText(lines[i]);
  }
  return "";
}

function parseStudyDetail(lines){
  const idx = lines.findIndex(l => /estudio b[ií]blico de la congregaci[oó]n/i.test(l));
  if(idx === -1) return "";
  for(let i = idx + 1; i < Math.min(lines.length, idx + 4); i++){
    if(/^\(/.test(lines[i])){
      const m = lines[i].match(/^\((\d+)\s*mins?\.?\)\s*(.+)$/i);
      if(m) return cleanDetailText(m[2]);
    }
  }
  return "";
}

function parseStructuredParts(lines){
  const items = [];
  let currentSection = "";
  for(let i = 0; i < lines.length; i++){
    const line = lines[i];
    if(/##\s+tesoros de la biblia/i.test(line)){ currentSection = "Tesoros de la Biblia"; continue; }
    if(/##\s+seamos mejores maestros/i.test(line)){ currentSection = "Seamos mejores maestros"; continue; }
    if(/##\s+nuestra vida cristiana/i.test(line)){ currentSection = "Nuestra vida cristiana"; continue; }
    const heading = parseHeadingNumber(line);
    if(!heading || !currentSection) continue;
    const detailLines = [];
    for(let j = i + 1; j < lines.length; j++){
      const next = lines[j];
      if(/^##\s+/.test(next) || parseHeadingNumber(next) || /palabras de conclusi[oó]n/i.test(next)) break;
      if(/###\s*canci[oó]n\s+\d+/i.test(next)) break;
      detailLines.push(next);
    }
    const minutes = parseMinutes(detailLines[0] || "") || parseMinutes(heading.title) || "";
    const detailText = cleanDetailText(detailLines.join(" "));
    items.push({ section: currentSection, num: heading.num, title: compact(heading.title), minutes, detailText });
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
        parts.push({ section:item.section, type:"Lectura de la Biblia", title:"Lectura de la Biblia", minutes:item.minutes || 4, detail: readingRange || item.detailText });
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

async function tryFetch(url){
  const res = await fetch(url, { method: "GET" });
  if(!res.ok) throw new Error(`HTTP ${res.status}`);
  return await res.text();
}

export async function fetchAndParseWOL({ wolUrl, proxyBase = null }){
  const candidates = buildFetchCandidates(wolUrl, proxyBase);
  if(!candidates.length) throw new Error("Pegá un link de WOL.");
  let raw = "";
  let lastError = null;
  for(const candidate of candidates){
    try{
      raw = await tryFetch(candidate);
      if(raw && raw.length > 200) break;
    } catch (e){
      lastError = e;
    }
  }
  if(!raw || raw.length < 50) throw new Error(lastError?.message || "No se pudo leer WOL.");
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
    rawTextSample: lines.slice(0, 120).join("
")
  };
}
