// URL order follows a geographic bounding box: west, south, east, north.
export function parseArea(value) {
  if (typeof value !== 'string' || value.length > 80) return null;
  const parts = value.split(',');
  if (parts.length !== 4 || parts.some(part => !/^-?\d+(\.\d+)?$/.test(part))) return null;
  const box = parts.map(Number);
  const [west, south, east, north] = box;
  if (west < -180 || east > 180 || south < -90 || north > 90 || west >= east || south >= north) return null;
  return box;
}

export function encodeArea(values) {
  if (!Array.isArray(values) || !values.every(Number.isFinite)) return '';
  const value = values.map(number => Number(number.toFixed(5))).join(',');
  return parseArea(value) ? value : '';
}

export function rowsInArea(rows, box) {
  if (!box) return rows;
  const [west, south, east, north] = box;
  return rows.filter(({lat, lng, withheld}) => !withheld && Number.isFinite(lat) && Number.isFinite(lng) &&
    lng >= west && lng <= east && lat >= south && lat <= north);
}
