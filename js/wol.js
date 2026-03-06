import { markUnsaved } from "./app.js";

/**
 * Para evitar CORS desde GitHub Pages:
 * usamos un "mirror" que devuelve el HTML como texto.
 * Si un día falla, se puede cambiar por un Worker/Proxy.
 */
export function buildFetchUrl(wolUrl, proxyBase){
  const clean = wolUrl.trim();
  if(!clean) return null;
  if(proxyBase){
    // proxyBase example: https://your-worker.example.workers.dev/?url=
    return proxyBase + encodeURIComponent(clean);
  }
  // default: r.jina.ai mirror
  // Works for many sites, returns page content without CORS.
  return "https://r.jina.ai/http://" + clean.replace(/^https?:\/\//,"");
}

function stripTags(html){
  return html.replace(/<script[\s\S]*?<\/script>/gi,"")
             .replace(/<style[\s\S]*?<\/style>/gi,"");
}

function textFromHTML(html){
  const cleaned = stripTags(html);
  const doc = new DOMParser().parseFromString(cleaned, "text/html");
  const text = doc.body ? doc.body.innerText : "";
  return text.replace(/\r/g,"").replace(/[ \t]+/g," ").replace(/\n{3,}/g,"\n\n");
}

function pickSection(text, startMarkers, endMarkers){
  const lower = text.toLowerCase();
  let startIdx = -1;
  for(const m of startMarkers){
    const i = lower.indexOf(m.toLowerCase());
    if(i !== -1){ startIdx=i; break; }
  }
  if(startIdx === -1) return "";
  let endIdx = lower.length;
  for(const m of endMarkers){
    const i = lower.indexOf(m.toLowerCase(), startIdx+10);
    if(i !== -1){ endIdx = Math.min(endIdx, i); }
  }
  return text.slice(startIdx, endIdx);
}

function parseItems(sectionText){
  // Try to capture numbered parts like:
  // "1 "Yo soy Dios..." (10 mins.)"
  // or "1 ... (10 min.)"
  const lines = sectionText.split("\n").map(l=>l.trim()).filter(Boolean);
  const joined = lines.join("\n");
  const re = /(?:^|\n)\s*(\d{1,2})\s+([^\n]+?)(?:\((\d+)\s*(?:min\.?|mins\.?|minutos?)\))/gi;
  const items=[];
  let m;
  while((m = re.exec(joined)) !== null){
    items.push({
      num: parseInt(m[1],10),
      title: m[2].trim().replace(/\s+/g," "),
      minutes: parseInt(m[3],10)
    });
  }
  // Fallback: if regex didn't catch minutes, capture num + title
  if(items.length===0){
    const re2 = /(?:^|\n)\s*(\d{1,2})\s+([^\n]+)/g;
    while((m = re2.exec(joined)) !== null){
      items.push({ num: parseInt(m[1],10), title: m[2].trim(), minutes: null });
    }
  }
  return items;
}

export async function fetchAndParseWOL({ wolUrl, proxyBase=null }){
  const url = buildFetchUrl(wolUrl, proxyBase);
  if(!url) throw new Error("Pega un link de WOL.");
  const res = await fetch(url);
  if(!res.ok) throw new Error("No se pudo leer WOL. Probá de nuevo o usá un proxy.");
  const html = await res.text();
  const text = textFromHTML(html);

  // Sections
  const tes = pickSection(text, ["TESOROS DE LA BIBLIA"], ["SEAMOS MEJORES MAESTROS", "NUESTRA VIDA CRISTIANA"]);
  const mae = pickSection(text, ["SEAMOS MEJORES MAESTROS"], ["NUESTRA VIDA CRISTIANA"]);
  const vida = pickSection(text, ["NUESTRA VIDA CRISTIANA"], ["S-140", "SEMANA", "SEMANAS", "NOTAS", "FIN"]);

  const tesItems = parseItems(tes).filter(x=>[1,2,3].includes(x.num));
  const maeItems = parseItems(mae).filter(x=>[4,5,6].includes(x.num));
  const vidaItems = parseItems(vida).filter(x=>[8,9].includes(x.num));

  // sometimes 7 is 'Canción' and not assigned.
  // EBC part usually present; try to find "Estudio bíblico de la congregación" with minutes ~30.
  let ebc = null;
  const ebcMatch = /Estudio bíblico de la congregación\s*\((\d+)\s*min/gi.exec(text);
  if(ebcMatch){
    ebc = { key:"EBC", title:"Estudio bíblico de la congregación", minutes: parseInt(ebcMatch[1],10) };
  }else{
    // fallback
    const ebcMatch2 = /Estudio bíblico.*\((\d+)\s*min/gi.exec(text);
    if(ebcMatch2) ebc = { key:"EBC", title:"Estudio bíblico de la congregación", minutes: parseInt(ebcMatch2[1],10) };
  }

  const parts = [];
  for(const it of tesItems){
    parts.push({
      partNo: it.num,
      section: "Tesoros de la Biblia",
      type: it.num===1 ? "Tesoros 1 (Discurso)" : it.num===2 ? "Tesoros 2 (Perlas)" : "Tesoros 3 (Lectura Biblia)",
      title: it.title,
      minutes: it.minutes ?? ""
    });
  }
  for(const it of maeItems){
    parts.push({
      partNo: it.num,
      section: "Seamos mejores maestros",
      type: it.num===4 ? "Maestros 4" : it.num===5 ? "Maestros 5" : "Maestros 6",
      title: it.title,
      minutes: it.minutes ?? ""
    });
  }
  for(const it of vidaItems){
    parts.push({
      partNo: it.num,
      section: "Nuestra vida cristiana",
      type: it.num===8 ? "Vida Cristiana 8" : "Vida Cristiana 9",
      title: it.title,
      minutes: it.minutes ?? ""
    });
  }
  if(ebc){
    parts.push({
      partNo: 0,
      section: "Nuestra vida cristiana",
      type: "Estudio bíblico (Conductor)",
      title: ebc.title,
      minutes: ebc.minutes ?? 30
    });
    parts.push({
      partNo: 0,
      section: "Nuestra vida cristiana",
      type: "Estudio bíblico (Lector)",
      title: ebc.title,
      minutes: ebc.minutes ?? 30
    });
  }

  markUnsaved("Se cargó el programa desde WOL.");
  return { parts, rawTextSample: text.slice(0, 1000) };
}
