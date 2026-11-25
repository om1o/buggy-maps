// The bundled geometry uses integer Web Mercator pixels at zoom 16.
const NATIVE_ZOOM = 16;
const CELL = 4096;
const DATA_URL = new URL('./miami.vmap', import.meta.url);
const palette = {
  land: '#e8ebe4', park: '#c9dfc9', campus: '#dce5d8', coast: '#9fc7cf',
  water: '#b8dce7', block: '#d2d8cf', street: '#fbfcf8',
  arterialCase: '#c5c9bd', arterial: '#fffdf4',
  highwayCase: '#d4bb8e', highway: '#fff1c8', label: '#5a6871'
};
const labelFont = '500 10px system-ui, -apple-system, sans-serif';
let datasetPromise;

function decode(buffer) {
  const bytes = new Uint8Array(buffer);
  const view = new DataView(buffer);
  if (view.getUint32(0) !== 0x42474d31) throw new Error('Invalid Miami map data');
  const originX = view.getInt32(4, true), originY = view.getInt32(8, true);
  let cursor = 12;
  function unsigned() {
    let number = 0, shift = 0;
    while (cursor < bytes.length) {
      const next = bytes[cursor++];
      number += (next & 127) * 2 ** shift;
      if (next < 128) return number;
      shift += 7;
      if (shift > 35) throw new Error('Invalid map geometry');
    }
    throw new Error('Truncated Miami map');
  }
  function signed() {
    const number = unsigned();
    return (number & 1) ? -(number + 1) / 2 : number / 2;
  }
  const nameLength = unsigned();
  const names = new TextDecoder().decode(bytes.subarray(cursor, cursor + nameLength)).split('\0');
  cursor += nameLength;
  const count = unsigned(), features = [], bins = new Map(), large = [];
  for (let id = 0; id < count; id++) {
    const type = unsigned(), name = names[unsigned()], pathCount = unsigned(), paths = [];
    let left = Infinity, right = -Infinity, top = Infinity, bottom = -Infinity;
    for (let i = 0; i < pathCount; i++) {
      const n = unsigned(), points = new Int32Array(n * 2);
      let x = originX, y = originY;
      for (let j = 0; j < points.length; j += 2) {
        x += signed(); y += signed();
        points[j] = x; points[j + 1] = y;
        left = Math.min(x, left); right = Math.max(x, right);
        top = Math.min(y, top); bottom = Math.max(y, bottom);
      }
      paths.push(points);
    }
    const feature = { id, type, name, paths, left, right, top, bottom };
    features.push(feature);
    const x1 = Math.floor(left / CELL), x2 = Math.floor(right / CELL);
    const y1 = Math.floor(top / CELL), y2 = Math.floor(bottom / CELL);
    if ((x2 - x1 + 1) * (y2 - y1 + 1) > 48) { large.push(id); continue; }
    for (let x = x1; x <= x2; x++) for (let y = y1; y <= y2; y++) {
      const key = x + ',' + y;
      const bin = bins.get(key);
      if (bin) bin.push(id); else bins.set(key, [id]);
    }
  }
  return { features, bins, large };
}
function loadData() {
  if (!datasetPromise) datasetPromise = fetch(DATA_URL).then(response => {
    if (!response.ok) throw new Error('Miami street map unavailable');
    return response.arrayBuffer();
  }).then(decode).catch(error => { datasetPromise = null; throw error; });
  return datasetPromise;
}
function nearby(data, left, top, right, bottom, scale, zoom) {
  const found = new Set(data.large);
  for (let i = Math.floor(left / CELL); i <= Math.floor(right / CELL); i++) {
    for (let j = Math.floor(top / CELL); j <= Math.floor(bottom / CELL); j++) {
      const bin = data.bins.get(i + ',' + j);
      if (bin) for (const id of bin) found.add(id);
    }
  }
  const groups = [[], [], [], [], [], [], []];
  for (const id of found) {
    const f = data.features[id];
    if (f.right < left || f.left > right || f.bottom < top || f.top > bottom) continue;
    const extent = Math.max(f.right - f.left, f.bottom - f.top) * scale;
    if (extent < (f.type <= 2 ? 1.1 : .65)) continue;
    if (f.type === 3 && (zoom < 11 || (zoom === 11 && extent < 9))) continue;
    if (f.type === 4 && zoom <= 10 && extent < 14) continue;
    groups[f.type].push(f);
  }
  return groups;
}
function trace(context, feature, scale, offsetX, offsetY, closed) {
  for (const p of feature.paths) {
    context.moveTo(p[0] * scale - offsetX, p[1] * scale - offsetY);
    for (let i = 2; i < p.length; i += 2) context.lineTo(p[i] * scale - offsetX, p[i + 1] * scale - offsetY);
    if (closed) context.closePath();
  }
}
function drawTile(canvas, coords, data) {
  const dpr = canvas.width / 256, ctx = canvas.getContext('2d');
  const z = coords.z, scale = 2 ** (z - NATIVE_ZOOM), ox = coords.x * 256, oy = coords.y * 256;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.fillStyle = palette.land;
  ctx.fillRect(0, 0, 256, 256);
  // Continue Atlantic water beyond the seaward TIGER county boundary.
  const offshore = [[25.99,-80.082],[25.94,-80.08],[25.84,-80.079],[25.77,-80.085],[25.67,-80.108],[25.55,-80.135],[25.45,-80.176],[25.33,-80.205],[25.10,-80.234]];
  function offshorePoint(lat, lng) {
    return [(lng + 180) / 360 * 2 ** 24 * scale - ox,
      (1 - Math.asinh(Math.tan(lat * Math.PI / 180)) / Math.PI) / 2 * 2 ** 24 * scale - oy];
  }
  ctx.fillStyle = palette.water;
  ctx.beginPath();
  const sea = [[30,-70], [30,-80.073], ...offshore, [22,-80.25], [22,-70]].map(p => offshorePoint(...p));
  sea.forEach(([x,y], i) => { if (i) ctx.lineTo(x,y); else ctx.moveTo(x,y); });
  ctx.fill();
  if (!data) return;
  const pad = 10 / scale;
  const groups = nearby(data, ox / scale - pad, oy / scale - pad, (ox + 256) / scale + pad, (oy + 256) / scale + pad, scale, z);
  for (const type of [1, 2, 0]) {
    ctx.fillStyle = [palette.water, palette.park, palette.campus][type];
    ctx.strokeStyle = type === 0 ? palette.coast : '#c6d8c1'; ctx.lineWidth = .65;
    for (const f of groups[type]) {
      ctx.beginPath(); trace(ctx, f, scale, ox, oy, true); ctx.fill('evenodd'); ctx.stroke();
    }
  }
  ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  const factor = Math.max(.55, Math.min(2.8, 2 ** ((z - 13) * .38)));
  const widths = [0,0,0, 1.05 * factor, 1.65 * factor, 2.55 * factor, 3.4 * factor];
  for (const type of [3,4,5,6]) {
    ctx.beginPath();
    for (const f of groups[type]) trace(ctx, f, scale, ox, oy, false);
    if (z >= 12 || type >= 5) {
      ctx.strokeStyle = type >= 6 ? palette.highwayCase : (type >= 4 ? palette.arterialCase : palette.block);
      ctx.lineWidth = widths[type] + (type >= 5 ? 1.34 : .68);
      ctx.stroke();
    }
    ctx.strokeStyle = type === 6 ? palette.highway : (type >= 4 ? palette.arterial : palette.street);
    ctx.lineWidth = widths[type]; ctx.stroke();
  }
  if (z < 12) return;
  const used = [], names = new Set();
  ctx.font = labelFont; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  for (const type of (z >= 15 ? [6,5,4,3] : [6,5,4])) {
    for (const f of groups[type]) {
      if (!f.name || names.has(f.name) || /ramp|unnamed|private/i.test(f.name)) continue;
      const name = f.name.replace(/^Interstate /i, 'I-').replace(/^State (Road|Rte|Hwy) /i, 'SR ').replace(/^United States Highway /i,'US ');
      const width = ctx.measureText(name).width + 8;
      if (width > 130) continue;
      let best = null;
      for (const p of f.paths) {
        for (let j = 0; j < p.length - 2; j += 2) {
          const ax = p[j] * scale - ox, ay = p[j+1] * scale - oy;
          const bx = p[j+2] * scale - ox, by = p[j+3] * scale - oy;
          const length = Math.hypot(bx-ax, by-ay);
          if (length < width * .60) continue;
          // Take a point on the visible portion, even on roads many tiles long.
          const t = Math.max(.1, Math.min(.9, ((128-ax)*(bx-ax)+(128-ay)*(by-ay))/(length*length)));
          const x = ax+(bx-ax)*t, y = ay+(by-ay)*t;
          let angle = Math.atan2(by-ay,bx-ax);
          if (angle > Math.PI/2) angle -= Math.PI;
          if (angle < -Math.PI/2) angle += Math.PI;
          const hw = Math.abs(Math.cos(angle))*width/2 + 8, hh=Math.abs(Math.sin(angle))*width/2 + 8;
          if (x<hw || x>256-hw || y<hh || y>256-hh) continue;
          if (used.some(r=>Math.abs(r.x-x)<r.w+hw+8 && Math.abs(r.y-y)<r.h+hh+8)) continue;
          if (!best || length>best.length) best={x,y,angle,length,w:hw,h:hh};
        }
      }
      if (!best) continue;
      names.add(f.name); used.push(best);
      ctx.save(); ctx.translate(best.x,best.y); ctx.rotate(best.angle);
      ctx.lineWidth=3; ctx.strokeStyle='rgba(250,251,247,.96)'; ctx.strokeText(name,0,0);
      ctx.fillStyle = palette.label; ctx.fillText(name,0,0);ctx.restore();
      if (used.length >= (z >= 15 ? 8 : 3)) return;
    }
  }
}

export function createStreetLayer(L, map, onFailure, onReady) {
  let data;
  const Layer = L.GridLayer.extend({
    createTile(coords) {
      const canvas = document.createElement('canvas');
      const dpr = Math.min(2, Math.max(1, window.devicePixelRatio || 1));
      canvas.width = canvas.height = Math.round(256 * dpr);
      canvas.setAttribute('role','presentation');
      drawTile(canvas, coords, data);
      return canvas;
    }
  });
  const layer = new Layer({tileSize:256,keepBuffer:2,updateWhenIdle:true,maxNativeZoom:18,noWrap:true}).addTo(map);
  loadData().then(result => {
    data = result;
    if (map.hasLayer(layer)) {
      layer.redraw();
      map.getContainer().classList.add('bm-cartography-ready');
      onReady?.();
    }
  }).catch(() => { if (map.hasLayer(layer)) onFailure(); });
  return layer;
}
