import {normalize, exactStreet} from './search.js';

export function exactSchool(schools, text) {
  const name = normalize(text);
  if (!name) return null;
  const matches = schools.filter(school => [school.name, ...(school.aliases || [])].some(alias => normalize(alias) === name));
  return matches.length === 1 ? matches[0] : null;
}

export function mixedPlaceResults(text, homes, schools, mode) {
  const schoolMatch = exactSchool(schools, text);
  const key = normalize(text);
  const homeMatch = homes.slice(0, 8).find(home => exactStreet(home, text) || home._mlsKey === key || home._idKey === key);
  const looksLikeHome = /^[#\s]*\d+\s+\D|^\s*(?:mls|homes? near|casas? cerca)\b/i.test(text);
  const looksLikeSchool = /\b(?:school|academy|elementary|middle|high|escuela|colegio|primaria|secundaria)\b/i.test(text);
  const firstSchools = !homeMatch && !looksLikeHome && (schoolMatch || looksLikeSchool || mode === 'schools');
  const schoolRows = schoolMatch ? [schoolMatch, ...schools.filter(school => school !== schoolMatch)] : schools;
  const homeRows = homeMatch ? [homeMatch, ...homes.filter(home => home !== homeMatch)] : homes;
  const group = (rows, kind) => rows.map(row => ({row, kind}));
  const primary = firstSchools ? group(schoolRows.slice(0, 6), 'school') : group(homeRows.slice(0, 6), 'home');
  const secondary = firstSchools ? group(homeRows.slice(0, 6), 'home') : group(schoolRows.slice(0, 6), 'school');
  const take = secondary.length ? Math.min(4, primary.length) : primary.length;
  return [...primary.slice(0, take), ...secondary.slice(0, 6 - take)];
}
