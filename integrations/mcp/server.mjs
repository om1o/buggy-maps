import {readFile} from 'node:fs/promises';
import {serveStdio} from '@modelcontextprotocol/server/stdio';
import descriptor from '../../dist/buggy/agent-tools.json' with {type: 'json'};
import {schoolServerFactory} from './tools.mjs';

const directory = new URL('../../dist/buggy/' + descriptor['x-web'].localDirectoryRelativeToDescriptor, import.meta.url);
await serveStdio(schoolServerFactory(descriptor, async () => {
  try {
    return JSON.parse(await readFile(directory, 'utf8'));
  } catch {
    throw new Error('Restore dist/buggy/data/schools.json from the Buggy Maps checkout.');
  }
}, {dataset: process.env.BUGGY_BRIDGE_DATASET, token: process.env.BUGGY_BRIDGE_SERVER_TOKEN}));
