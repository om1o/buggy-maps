import {readFile} from 'node:fs/promises';
import {parseArgs} from 'node:util';
import {validateDataset} from '../dist/buggy/data-loader.js';
import {buildSchoolBrief, searchBriefSchools} from '../dist/buggy/school-brief.js';
import {createSchoolDirectory} from '../dist/buggy/school-mode.js';

const usage = [
  'node scripts/agent-schools.mjs search --query "Coconut Grove" [--limit 6] [--language en|es] [--directory FILE]',
  'node scripts/agent-schools.mjs brief --school fl-13-0841 [--school ID ...] [--language en|es] [--directory FILE]',
  'FILE is a local schools.json snapshot. The default is the included dist/buggy/data/schools.json.'
].join('\n');

async function run([command, ...args]) {
  if (command === '--help' || command === '-h') return console.log(usage);
  if (!['search', 'brief'].includes(command)) throw Error('Expected search or brief. Use --help for examples.');
  const options = {
    language: {type: 'string', default: 'en'},
    directory: {type: 'string'}
  };
  if (command === 'search') {
    options.query = {type: 'string'};
    options.limit = {type: 'string', default: '6'};
  } else {
    options.school = {type: 'string', multiple: true};
  }
  const {values, tokens} = parseArgs({args, options, tokens: true});
  const seen = new Set();
  for (const {name} of tokens) {
    if (name !== 'school' && seen.has(name)) throw Error('Repeat only --school when selecting several campuses.');
    seen.add(name);
  }
  if (!['en', 'es'].includes(values.language)) throw Error('--language must be en or es.');
  if (command === 'search' && !values.query?.trim()) throw Error('Supply a school name or ZIP with --query.');
  if (command === 'search' && !/^(?:[1-9]|1[0-9]|20)$/.test(values.limit)) throw Error('--limit must be an integer from 1 to 20.');
  if (command === 'brief' && !values.school?.length) throw Error('Select one to three explicit directory IDs with --school.');
  if (values.directory !== undefined && (!values.directory.trim() || /^(?:[a-z][a-z0-9+.-]*:\/\/|[\\/]{2})/i.test(values.directory))) {
    throw Error('--directory requires a local file path.');
  }

  const path = values.directory ?? new URL('../dist/buggy/data/schools.json', import.meta.url);
  let source;
  try {
    source = await readFile(path, 'utf8');
  } catch {
    throw Error('Cannot read the school directory. Restore dist/buggy/data/schools.json or pass --directory with a readable schools.json file.');
  }
  let dataset;
  try {
    dataset = validateDataset('data/schools.json', JSON.parse(source));
  } catch {
    throw Error('Invalid school directory. Supply a valid Buggy Maps schools.json snapshot.');
  }
  const directory = createSchoolDirectory(async () => dataset);
  await directory.load();
  const result = command === 'brief'
    ? buildSchoolBrief(values.school, directory, values.language)
    : {language: values.language, schools: searchBriefSchools(directory, values.query.trim(), Number(values.limit))};
  console.log(JSON.stringify(result));
}

try {
  await run(process.argv.slice(2));
} catch (error) {
  console.error(JSON.stringify({error: error.message}));
  process.exitCode = 1;
}
