import {districtSchoolLocator} from './school-discovery.js';
import {schoolOnlyURL} from './share-link.js';
import {isDirectorySchoolId} from './trip-location.js';

function eligible(row) {
  return row?.campusType === 'campus' && isDirectorySchoolId(row.id);
}

function publicURL(value) {
  try {
    const url = new URL(value);
    if (['https:', 'http:'].includes(url.protocol) && !url.username && !url.password) return url.href;
  } catch { /* Records may omit a published link. */ }
  return '';
}

function schoolFacts(row) {
  const {id, name, type, address, city, state, zip} = row;
  const grades = Array.isArray(row.grades) ? row.grades.join(', ') : row.grades;
  return {id, name, grades: grades || '', type: type || '', address: address || '',
    city: city || '', state: state || '', zip: zip || '',
    website: publicURL(row.website), sourceUrl: publicURL(row.sourceUrl)};
}

export function searchBriefSchools(directory, query, limit = 6) {
  if (!Number.isInteger(limit) || limit < 1 || limit > 20) throw new Error('Result limit must be 1–20.');
  if (!query.trim()) return [];
  return directory.search(query).filter(eligible).slice(0, limit).map(schoolFacts);
}

export function buildSchoolBrief(ids, directory, language = 'en') {
  if (!['en', 'es'].includes(language)) throw new Error('Choose en or es.');
  if (!Array.isArray(ids) || ids.length < 1 || ids.length > 3 || new Set(ids).size !== ids.length) {
    throw new Error('Choose one to three distinct school IDs.');
  }
  const schools = ids.map(id => {
    const school = directory.get(id);
    if (!eligible(school)) throw new Error('Choose a physical campus from the school directory.');
    return schoolFacts(school);
  });
  return {language, schools, shareUrl: schoolOnlyURL(schools, language), districtLocator: districtSchoolLocator};
}
