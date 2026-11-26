# Search schools and build a family brief

Use these tools when a family or real-estate professional wants public school information they can share. Search by school name, alias, or ZIP. Show the names, grade ranges, and campus addresses so the person can choose among similar results. Build a brief from one to three confirmed campus IDs. A family can open the resulting link without supplying a home address.

## Local commands

From the GitHub project root or the extracted Buggy Maps bundle, run these commands with Node.js 24.

```sh
node scripts/agent-schools.mjs search --query "Coconut Grove" --limit 6
node scripts/agent-schools.mjs brief --school fl-13-0841 --school fl-13-6741 --language es
```

Both commands read the included `dist/buggy/data/schools.json`. To use another local v14 school snapshot, supply its file path.

```sh
node scripts/agent-schools.mjs search --directory "/path/to/dist/buggy/data/schools.json" --query "33133"
```

- **Search** returns `{"language":"en","schools":[...]}`. An empty array means the query found no campuses. The default limit is six. Set `--limit` to an integer from one through twenty.
- **Brief** accepts a separate `--school` for each confirmed ID, in display order. It returns `language`, `schools`, `shareUrl`, and `districtLocator`. Duplicate, unknown, and non-campus IDs produce an error.
- **School records** contain `id`, `name`, `grades`, `type`, `address`, `city`, `state`, `zip`, `website`, and `sourceUrl`. The address belongs to the school. Missing optional details appear as empty strings.
- **Language** defaults to `en`. Use `--language es` for a Spanish map link. Names and addresses retain their published spelling.
- **Output** is one JSON object on stdout. Errors produce `{"error":"..."}` on stderr and exit code 1. The CLI reads local files and makes no network requests.

The machine-readable descriptor defines command inputs, result and error schemas, and example invocations. [Agent tool descriptor](../dist/buggy/agent-tools.json)

## Web-only agents

1. Fetch the public school directory once and search its `schools` array in memory. Match the person's school name, aliases, or ZIP against records whose `campusType` equals `campus`. [Public school directory](https://miami-homes-march-2026.aoraboracora.chatgpt.site/buggy/data/schools.json)
2. Present the candidates. Resolve each selected ID against a physical campus in that snapshot. Keep the family's order and require one to three distinct IDs. If the requested campus is missing, report it and ask for a different selection.
3. Start a fresh URL at the [public map](https://miami-homes-march-2026.aoraboracora.chatgpt.site/buggy/). Set `mode=schools`. For one campus, set `school` to its ID. For two or three campuses, set `campuses` to the IDs joined by a comma. Use normal query-string encoding and append `lang=es` for Spanish. [Two-school example in Spanish](https://miami-homes-march-2026.aoraboracora.chatgpt.site/buggy/?mode=schools&campuses=fl-13-0841%2Cfl-13-6741&lang=es)

If your web tool cannot read the directory, use the copy in a project checkout or the portable bundle. [Directory snapshot in this repository](../dist/buggy/data/schools.json)

Keep the share URL limited to these campus and language fields. Residence, listing ID, family schedule, search query, and browser history belong outside the link. Families can verify attendance boundaries through the district. Buggy handles ride availability, fares, and bookings. [District school locator](https://app.guidek12.com/miami/school_search/current/)
