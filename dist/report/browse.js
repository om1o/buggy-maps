const byId = id => document.getElementById(id);
const selector = byId('dataset');
const finder = byId('finder');
const body = byId('properties');
const dialog = byId('property');
const pageSize = 12;
const dollars = new Intl.NumberFormat('en-US', {style: 'currency', currency: 'USD', maximumFractionDigits: 0});
let datasets = [];
let matches = [];
let page = 0;

function label(field) {
  const labels = {zpid:'Zillow ID', mls_id:'MLS ID', zipcode:'ZIP code', zip_code:'ZIP code', captured_utc:'Capture time (UTC)', previous_1000:'Included in the original 1,000 (1 = yes)'};
  return labels[field] || field.replaceAll('_', ' ').replace(/\b(usd|utc|mls|zip|id|fips)\b/gi, x => x.toUpperCase()).replace(/^./, x => x.toUpperCase());
}

function address(record) {
  return record.street_address || 'Street address withheld';
}

function openRecord(record) {
  byId('address').textContent = address(record);
  const list = byId('facts');
  list.replaceChildren();
  Object.entries(record).forEach(([key, value]) => {
    const name = document.createElement('dt');
    name.textContent = label(key);
    const fact = document.createElement('dd');
    if (typeof value === 'string' && value.startsWith('https://')) {
      const link = document.createElement('a');
      link.href = value;
      link.textContent = value;
      fact.append(link);
    } else {
      fact.textContent = value === null || value === '' ? 'Unreported' : value;
    }
    list.append(name, fact);
  });
  dialog.showModal();
}

function displayPage() {
  const dataset = datasets[Number(selector.value)];
  body.replaceChildren();
  for (const row of matches.slice(page * pageSize, (page + 1) * pageSize)) {
    const tr = document.createElement('tr');
    const cell = tr.insertCell();
    const button = document.createElement('button');
    button.className = 'street';
    button.textContent = address(row);
    button.addEventListener('click', () => openRecord(row));
    cell.append(button);
    const zip = document.createElement('small');
    zip.textContent = [row.city || row.mailing_city || 'Miami', row.zip_code].filter(Boolean).join(' · ');
    cell.append(zip);
    const amount = Number(row[dataset.price]);
    const price = tr.insertCell();
    price.textContent = amount > 0 ? dollars.format(amount) : 'Unavailable';
    const detail = document.createElement('small');
    detail.textContent = row.price_context ? row.price_context + ' · ' + row.price_date : dataset.prefix || row.history_event;
    price.append(detail);
    tr.insertCell().textContent = dataset.source || row.source_groups;
    body.append(tr);
  }
  byId('matches').textContent = matches.length.toLocaleString('en-US') + (matches.length === 1 ? ' matching record' : ' matching records');
  byId('where').textContent = matches.length ? 'Page ' + (page + 1) + ' of ' + Math.ceil(matches.length / pageSize) : 'No matches';
  byId('earlier').disabled = page === 0;
  byId('later').disabled = (page + 1) * pageSize >= matches.length;
}

function refresh() {
  if (!datasets.length) return;
  const query = finder.value.toLowerCase().trim().split(/\s+/).filter(Boolean);
  matches = datasets[Number(selector.value)].records.filter(row => {
    const searchable = Object.values(row).join(' ').toLowerCase();
    return query.every(term => searchable.includes(term));
  });
  page = 0;
  displayPage();
}

selector.addEventListener('change', refresh);
finder.addEventListener('input', refresh);
byId('earlier').addEventListener('click', () => {page--; displayPage();});
byId('later').addEventListener('click', () => {page++; displayPage();});
byId('close-record').addEventListener('click', () => dialog.close());

fetch('records.json').then(response => {
  if (!response.ok) throw new Error('records unavailable');
  return response.json();
}).then(data => {
  datasets = data;
  data.forEach((dataset, index) => selector.add(new Option(dataset.name, index)));
  refresh();
}).catch(() => {
  byId('matches').textContent = 'The records could not load. Download the spreadsheet or data ZIP above.';
  byId('earlier').disabled = byId('later').disabled = true;
});
