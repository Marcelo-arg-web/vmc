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
  if (label.includes('análisis con el auditorio') || label.includes('analisis con el auditorio')) return 'analisis';
  return 'maestros';
}
function vidaSubtype(row){
  const label = norm(`${row.type} ${row.title || ''}`);
  if (label.includes('necesidades')) return 'necesidades';
  if (label.includes('análisis con el auditorio') || label.includes('analisis con el auditorio')) return 'analisis';
  if (label.includes('viajante') || label.includes('superintendente de circuito') || label.includes('discurso de servicio')) return 'viajante';
  return 'vida';
}

export const Rules = {
  rowNeedsHelper(row){
    const label = norm(`${row.type} ${row.title || ''}`);
    return row?.type?.startsWith('Maestros') && maestroSubtype(row) !== 'discurso' && !label.includes('análisis con el auditorio') && !label.includes('analisis con el auditorio');
  },
  allowedFor(row, person, isHelper=false, mainPerson=null){
    if (!row || !person || person.active === false) return false;
    if (row.isDisabled) return false;
    if (isHelper){
      if (!this.rowNeedsHelper(row) || !mainPerson || person.id === mainPerson.id) return false;
      if (mainPerson.sex && person.sex && mainPerson.sex !== person.sex && !mainPerson.spouseOnly && !person.spouseOnly) return false;
      return true;
    }

    if (row.type === 'Presidente') return hasCan(person,'presidir') || isElder(person) || isSM(person);
    if (row.type === 'Oración (inicio)' || row.type === 'Oración (final)') return isApprovedBrother(person) && (hasCan(person,'oracion') || hasCan(person,'lecturaBiblia') || isElder(person) || isSM(person));
    if (row.type === 'Palabras de introducción' || row.type === 'Palabras de conclusión') return hasCan(person,'presidir') || isElder(person) || isSM(person);
    if (row.type === 'Tesoros 1 (Discurso)') return hasCan(person,'tesoros') || isElder(person) || isSM(person);
    if (row.type === 'Tesoros 2 (Perlas)') return hasCan(person,'perlas') || isElder(person) || isSM(person);
    if (row.type === 'Tesoros 3 (Lectura Biblia)') return hasCan(person,'lecturaBiblia') || isApprovedBrother(person);
    if (row.type === 'Estudio bíblico (Conductor)') return hasCan(person,'ebcConductor') || isElder(person) || isSM(person);
    if (row.type === 'Estudio bíblico (Lector)') return hasCan(person,'ebcLector') || isApprovedBrother(person);
    if (row.type === 'Discurso de servicio (viajante)') return true;
    if (row.type === 'Repaso y anuncios') return isElder(person) || isSM(person) || hasCan(person,'vidaCristiana');

    if (row.type?.startsWith('Vida Cristiana')){
      const sub = vidaSubtype(row);
      if (sub === 'necesidades') return hasCan(person,'necesidades') || isElder(person);
      if (sub === 'viajante') return true;
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

export function scoreCandidate({person, partType, historyByPerson}){
  const h = historyByPerson[person.id] || [];
  const same = h.find(x => x.partType === partType);
  let score = 0;
  if (!same) score -= 70;
  else {
    const d = new Date(`${same.weekISO}T00:00:00`);
    const daysAgo = Math.floor((Date.now() - d.getTime())/86400000);
    score += Math.max(0, 250 - daysAgo);
  }
  score += h.length * 3;
  if (person.role === 'Anciano') score += 4;
  if (person.role === 'Siervo Ministerial') score += 2;
  if (person.student) score -= 5;
  return score;
}
