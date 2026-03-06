import { markUnsaved } from "./app.js";

const AUTO_WOL_BASE = {
  anchorISO: "2026-04-02",
  anchorCode: 202026085,
  urlPrefix: "https://wol.jw.org/es/wol/d/r4/lp-s/"
};

function parseISODate(iso){
  const [y,m,d] = (iso || "").split("-").map(Number);
  if(!y || !m || !d) return null;
  return new Date(y, m-1, d);
}

function isoFromDate(d){
  const year = d.getFullYear();
  const month = String(d.getMonth()+1).padStart(2,"0");
  const day = String(d.getDate()).padStart(2,"0");
  return `${year}-${month}-${day}`;
}

function normalizeToMeetingWeekThursday(iso){
  const d = parseISODate(iso);
  if(!d) return null;
  const jsDay = d.getDay();
  const mondayBased = (jsDay + 6) % 7;
  const monday = new Date(d);
  monday.setDate(d.getDate() - mondayBased);
  const thursday = new Date(monday);
  thursday.setDate(monday.getDate() + 3);
  return thursday;
}

export function predictWOLUrlFromWeekISO(weekISO){
  const targetThursday = normalizeToMeetingWeekThursday(weekISO);
  const anchorThursday = parseISODate(AUTO_WOL_BASE.anchorISO);
  if(!targetThursday || !anchorThursday) return "";
  if(targetThursday < anchorThursday) return "";
  const diffWeeks = Math.round((targetThursday - anchorThursday) / 604800000);
  const code = AUTO_WOL_BASE.anchorCode + diffWeeks;
  return `${AUTO_WOL_BASE.urlPrefix}${code}`;
}

export function buildFetchCandidates(wolUrl, proxyBase) {
  const clean = (wolUrl || "").trim();
  if (!clean) return [];
  const noProto = clean.replace(/^https?:\/\//i, "");
  const encoded = encodeURIComponent(clean);
  const out = [];
  const add = (u) => { if (u && !out.includes(u)) out.push(u); };
  if (proxyBase) add(proxyBase + encoded);
  add(clean);
  add(`https://api.allorigins.win/raw?url=${encoded}`);
  add(`https://api.allorigins.win/get?url=${encoded}`);
  add(`https://r.jina.ai/http://${noProto}`);
  return out;
}

function compact(s) {
  return (s || "").replace(/[ \t]+/g, " ").trim();
}

function norm(s) {
  return compact(s)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

function titleCaseBible(s) {
  return compact(s)
    .toLowerCase()
    .replace(/(^|\s)([a-záéíóúñ])/g, (_, a, b) => a + b.toUpperCase())
    .replace(/\bis\b/g, "Is")
    .replace(/\bisa[ií]as\b/g, "Isaías");
}

function cleanText(raw) {
  return (raw || "")
    .replace(/\r/g, "")
    .replace(/\u00a0/g, " ")
    .replace(/【\d+†[^\]]*】/g, " ")
    .replace(/【\d+†[^】]*】/g, " ")
    .replace(/【\d+】/g, " ")
    .replace(/\[[^\]]*\]\((?:https?:\/\/)?[^)]+\)/g, " ")
    .replace(/\*\*/g, "")
    .replace(/[_`>#]+/g, " ")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n");
}

function textFromHTML(html) {
  const withoutScripts = html
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "");

  // Convertir algunos bloques a saltos de línea para no perder estructura.
  const structural = withoutScripts
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|section|article|h1|h2|h3|h4|h5|h6|li)>/gi, "\n")
    .replace(/<li[^>]*>/gi, "• ")
    .replace(/<[^>]+>/g, " ");

  return cleanText(structural);
}

function getLines(text) {
  return cleanText(text)
    .split(/\n+/)
    .map(compact)
    .filter(Boolean);
}

function parseReading(lines) {
  // Preferir el encabezado semanal: ISAÍAS 43, 44
  for (const line of lines) {
    if (/^[1-3]?\s?[A-ZÁÉÍÓÚÑ]+\s+\d+[,:]?\s*\d*/.test(line)) {
      return titleCaseBible(line.replace(/\s+/g, " "));
    }
  }

  const readingLine = lines.find((l) => /lectura semanal/i.test(l));
  if (readingLine) {
    return titleCaseBible(
      readingLine
        .replace(/lectura semanal(?: de la biblia)?/i, "")
        .replace(/[|:]/g, " ")
    );
  }
  return "";
}

function parseSongs(lines) {
  const songNums = [];
  for (const line of lines) {
    const m = line.match(/canci[oó]n\s+(\d+)/i);
    if (m) songNums.push(m[1]);
  }
  return {
    openingSong: songNums[0] || "",
    middleSong: songNums[1] || "",
    closingSong: songNums[songNums.length - 1] || "",
  };
}

function parseMinutes(line) {
  const m = line.match(/\((\d+)\s*min/i);
  return m ? Number(m[1]) : "";
}

function parseStudentType(title) {
  const n = norm(title);
  if (n.includes("discurso")) return "Discurso de estudiante";
  return "Asignación estudiantil";
}

function sectionRange(lines, startNeedle, endNeedles) {
  const start = lines.findIndex((l) => norm(l).includes(norm(startNeedle)));
  if (start === -1) return [];
  let end = lines.length;
  for (let i = start + 1; i < lines.length; i++) {
    const n = norm(lines[i]);
    if (endNeedles.some((e) => n.includes(norm(e)))) {
      end = i;
      break;
    }
  }
  return lines.slice(start + 1, end);
}

function parseTesoros(lines, reading) {
  const sec = sectionRange(lines, "TESOROS DE LA BIBLIA", [
    "SEAMOS MEJORES MAESTROS",
    "NUESTRA VIDA CRISTIANA",
  ]);
  const parts = [];

  for (let i = 0; i < sec.length; i++) {
    const line = sec[i];
    let m = line.match(/^(\d+)\.\s+(.+)$/);
    if (!m) m = line.match(/^(\d+)\s+(.+)$/);
    if (!m) continue;

    const num = Number(m[1]);
    const title = compact(m[2]);
    let minutes = "";
    let detail = "";

    for (let j = i + 1; j < sec.length; j++) {
      const next = sec[j];
      if (/^(\d+)\.?\s+/.test(next)) break;
      if (!minutes && /\(\d+\s*min/i.test(next)) minutes = parseMinutes(next);
      if (num === 3 && !detail) {
        const d = next.match(/\b([1-3]?\s?[A-Za-zÁÉÍÓÚÑáéíóúñ]+\s+\d+:\d+(?:-\d+)?)\b/);
        if (d) detail = d[1].replace(/^is\b/i, "Is");
      }
    }

    if (num === 1) {
      parts.push({ section: "Tesoros de la Biblia", type: "Tesoros", title, minutes: minutes || 10 });
    } else if (num === 2) {
      parts.push({ section: "Tesoros de la Biblia", type: "Perlas", title: "Busquemos perlas escondidas", minutes: minutes || 10 });
    } else if (num === 3) {
      parts.push({
        section: "Tesoros de la Biblia",
        type: "Lectura de la Biblia",
        title: `Lectura de la Biblia${detail ? " — " + detail : ""}`,
        minutes: minutes || 4,
        detail: detail || reading,
      });
    }
  }
  return parts;
}

function parseStudentParts(lines) {
  const sec = sectionRange(lines, "SEAMOS MEJORES MAESTROS", ["NUESTRA VIDA CRISTIANA"]);
  const parts = [];

  for (let i = 0; i < sec.length; i++) {
    const line = sec[i];
    let m = line.match(/^(\d+)\.\s+(.+)$/);
    if (!m) m = line.match(/^(\d+)\s+(.+)$/);
    if (!m) continue;

    const order = Number(m[1]);
    const title = compact(m[2]);
    if (order < 4) continue;

    let minutes = "";
    let detail = "";

    for (let j = i + 1; j < sec.length; j++) {
      const next = sec[j];
      if (/^(\d+)\.?\s+/.test(next)) break;
      if (!minutes && /\(\d+\s*min/i.test(next)) minutes = parseMinutes(next);
      if (!detail && !/\(\d+\s*min/i.test(next)) detail = compact(next);
      else if (detail && !/\(\d+\s*min/i.test(next))) detail += " " + compact(next);
    }

    parts.push({
      section: "Seamos mejores maestros",
      type: parseStudentType(title),
      title,
      minutes,
      detail,
      needsHelper: !/discurso/i.test(norm(title)),
    });
  }
  return parts;
}

function parseVidaCristiana(lines) {
  const sec = sectionRange(lines, "NUESTRA VIDA CRISTIANA", [
    "PALABRAS DE CONCLUSIÓN",
    "PALABRAS DE CONCLUSION",
    "REPASO DE ESTA REUNIÓN",
    "REPASO DE ESTA REUNION",
  ]);
  const parts = [];
  let ebcTitle = "";

  for (let i = 0; i < sec.length; i++) {
    const line = sec[i];
    if (/^canci[oó]n\s+\d+/i.test(line)) continue;

    let m = line.match(/^(\d+)\.\s+(.+)$/);
    if (!m) m = line.match(/^(\d+)\s+(.+)$/);
    if (!m) continue;

    const title = compact(m[2]);
    const n = norm(title);
    let minutes = "";
    let detail = "";

    for (let j = i + 1; j < sec.length; j++) {
      const next = sec[j];
      if (/^(\d+)\.?\s+/.test(next)) break;
      if (!minutes && /\(\d+\s*min/i.test(next)) minutes = parseMinutes(next);
      if (!detail && !/\(\d+\s*min/i.test(next) && !/^canci[oó]n\s+\d+/i.test(next)) detail = compact(next);
      else if (detail && !/\(\d+\s*min/i.test(next) && !/^canci[oó]n\s+\d+/i.test(next)) detail += " " + compact(next);
    }

    if (n.includes("estudio biblico de la congregacion")) {
      ebcTitle = title + (detail ? " — " + detail : "");
      parts.push({ section: "Nuestra vida cristiana", type: "Conductor EBC", title: "Estudio bíblico de la congregación", minutes: minutes || 30, detail });
      parts.push({ section: "Nuestra vida cristiana", type: "Lector EBC", title: "Estudio bíblico de la congregación", minutes: minutes || 30, detail });
    } else {
      parts.push({
        section: "Nuestra vida cristiana",
        type: n.includes("necesidades de la congregacion") ? "Necesidades de la congregación" : "Nuestra vida cristiana",
        title,
        minutes,
        detail,
      });
    }
  }

  return { parts, ebcTitle };
}

export async function fetchAndParseWOL({ wolUrl, proxyBase = null }) {
  const candidates = buildFetchCandidates(wolUrl, proxyBase);
  if (!candidates.length) throw new Error("Pegá un link de WOL.");

  let raw = "";
  let lastErr = null;

  for (const candidate of candidates) {
    try {
      const res = await fetch(candidate);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const contentType = res.headers.get("content-type") || "";
      const body = await res.text();
      if (!body) throw new Error("Respuesta vacía");

      if (contentType.includes("application/json") || /^\s*\{/.test(body)) {
        try {
          const parsed = JSON.parse(body);
          raw = parsed.contents || parsed.body || parsed.html || parsed.data || "";
        } catch {
          raw = body;
        }
      } else {
        raw = body;
      }

      if (raw) break;
    } catch (err) {
      lastErr = err;
    }
  }

  if (!raw) throw new Error(lastErr?.message || "No se pudo leer WOL.");

  const text = /<html/i.test(raw) ? textFromHTML(raw) : cleanText(raw);
  const lines = getLines(text);

  const reading = parseReading(lines);
  const songs = parseSongs(lines);
  const tesoros = parseTesoros(lines, reading);
  const student = parseStudentParts(lines);
  const vida = parseVidaCristiana(lines);

  const parts = [...tesoros, ...student, ...vida.parts];
  if (!parts.length) throw new Error("No se detectaron asignaciones en la página.");

  markUnsaved("Se cargó el programa desde WOL.");
  return {
    parts,
    meta: {
      reading,
      openingSong: songs.openingSong,
      middleSong: songs.middleSong,
      closingSong: songs.closingSong,
      ebcTitle: vida.ebcTitle,
    },
    rawTextSample: lines.slice(0, 120).join("\n"),
  };
}
