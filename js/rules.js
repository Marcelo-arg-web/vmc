function norm(s){ return (s || "").toLowerCase(); }
const isApprovedBrother = p => p.sex === 'H' && p.approved === true;
const isBrother = p => p.sex === 'H';
const isElder = p => p.role === 'Anciano';
const isSM = p => p.role === 'Siervo Ministerial';
const hasCan = (p, key) => p?.can?.[key] === true;

function maestroSubtype(row){
  const label = norm(`${row.type} ${row.title || ''}`);
  if (label.includes('empiece conversaciones')) return 'empiece';
  if (label.includes('haga revisitas')) return 'revisita';
  if (label.includes('haga discip')) return 'discipulos';
  if (label.includes('explique sus creencias')) return 'explique';
  if (label.includes('discurso')) return 'discurso';
  return 'maestros';
}
function vidaSubtype(row){
  const label = norm(`${row.type} ${row.title || ''}`);
  if (label.includes('necesidades')) return 'necesidades';
  if (label.includes('análisis con el auditorio') || label.includes('analisis con el auditorio')) return 'analisis';
  return 'vida';
}

export const Rules = {
  rowNeedsHelper(row){
    return row?.type?.startsWith('Maestros') && maestroSubtype(row) !== 'discurso';
  },
  isFixedExternal(row){
    return row?.type === 'Discurso del viajante';
  },
  allowedFor(row, person, isHelper=false, mainPerson=null){
    if (!row || !person || person.active === false || this.isFixedExternal(row)) return false;
    if (isHelper){
      if (!this.rowNeedsHelper(row) || !mainPerson || person.id === mainPerson.id) return false;
      if (mainPerson.sex && person.sex && mainPerson.sex !== person.sex) return false;
      return true;
    }
    if (row.type === 'Presidente') return hasCan(person,'presidir') || isElder(person) || isSM(person);
    if (row.type === 'Oración (inicio)' || row.type === 'Oración (final)') return isApprovedBrother(person) && (hasCan(person,'oracion') || hasCan(person,'lecturaBiblia') || isElder(person) || isSM(person));
    if (row.type === 'Tesoros 1 (Discurso)') return hasCan(person,'tesoros') || isElder(person) || isSM(person);
    if (row.type === 'Tesoros 2 (Perlas)') return hasCan(person,'perlas') || isElder(person) || isSM(person);
    if (row.type === 'Tesoros 3 (Lectura Biblia)') return hasCan(person,'lecturaBiblia') || isApprovedBrother(person);
    if (row.type === 'Estudio bíblico (Conductor)') return hasCan(person,'ebcConductor') || isElder(person) || isSM(person);
    if (row.type === 'Estudio bíblico (Lector)') return hasCan(person,'ebcLector') || isApprovedBrother(person);
    if (row.type === 'Repaso y anuncios') return isElder(person) || isSM(person) || hasCan(person,'vidaCristiana');
    if (row.type?.startsWith('Vida Cristiana')){
      const sub = vidaSubtype(row);
      if (sub === 'necesidades') return hasCan(person,'necesidades') || isElder(person);
      return hasCan(person,'vidaCristiana') || isElder(person) || isSM(person);
    }
    if (row.type?.startsWith('Maestros')){
      const sub = maestroSubtype(row);
      if (sub === 'discurso') return hasCan(person,'discursoEstudiante') || (person.student && isBrother(person));
      if (sub === 'explique' && norm(row.title).includes('discurso')) return hasCan(person,'expliqueDiscurso') || (person.student && isBrother(person));
      return person.student === true || person.active !== false;
    }
    return person.active !== false;
  }
};

function weekDiff(fromISO, toISO){
  if(!fromISO || !toISO) return 999;
  const a = new Date(`${fromISO}T00:00:00`);
  const b = new Date(`${toISO}T00:00:00`);
  return Math.floor((b - a) / (86400000 * 7));
}

export function scoreCandidate({person, currentWeekISO, historyByPerson}){
  const h = historyByPerson[person.id] || [];
  const latest = h.sort((a,b)=> String(b.weekISO).localeCompare(String(a.weekISO)))[0];
  const weeksAway = latest ? weekDiff(latest.weekISO, currentWeekISO) : 999;
  let score = -weeksAway * 100;
  score += h.length * 2;
  if (person.role === 'Anciano') score += 2;
  if (person.role === 'Siervo Ministerial') score += 1;
  return score;
}
