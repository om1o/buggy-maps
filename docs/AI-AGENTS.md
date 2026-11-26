# Use Buggy Maps with an AI agent

The public snapshot covers Miami-area properties and Miami-Dade schools. A web client can download the data directly. An MCP client can list the datasets, search schools and generate shareable briefs. Both routes work without a Buggy Maps or GitHub account. [Public map](https://miami-homes-march-2026.aoraboracora.chatgpt.site/buggy/) · [Data catalog](https://miami-homes-march-2026.aoraboracora.chatgpt.site/buggy/agent-tools.json)

## Download the map data

Fetch the JSON catalog and read `x-web.dataDownloadsRelativeToDescriptor`. Resolve file paths against `x-web.baseUrl` for the hosted site or `x-web.rawBaseUrl` for direct GitHub downloads. Use the raw links for cross-origin browser requests. The research archive entry opens an HTML directory on the site. [Raw catalog](https://raw.githubusercontent.com/om1o/buggy-maps/main/dist/buggy/agent-tools.json) · [Full file index](https://api.github.com/repos/om1o/buggy-maps/git/trees/main?recursive=1) · [Complete project ZIP](https://github.com/om1o/buggy-maps/archive/refs/heads/main.zip)

The property collection is a dated snapshot. Check its coverage file before describing a property's status. School records include non-campus programs. Filter on `campusType === "campus"` for a school visit. Keep the source attribution and asset-specific reuse terms with exports. [Coverage](https://raw.githubusercontent.com/om1o/buggy-maps/main/dist/buggy/data/coverage.json) · [School sources](https://raw.githubusercontent.com/om1o/buggy-maps/main/dist/buggy/data/school-sources.txt) · [Map and routing credits](https://raw.githubusercontent.com/om1o/buggy-maps/main/dist/buggy/map-assets/SOURCES.txt)

## Connect an MCP client

Install Node.js 24, then run the following from a terminal.

```sh
git clone https://github.com/om1o/buggy-maps.git
cd buggy-maps
npm ci --prefix integrations/mcp
npm test --prefix integrations/mcp
```

In a client that supports local Model Context Protocol servers, configure the command as `node` and the argument as the absolute path to `integrations/mcp/server.mjs` in your clone. For clients that use an `mcpServers` configuration, replace the example path below. Forward slashes also work in Windows paths such as `C:/projects/buggy-maps/integrations/mcp/server.mjs`. [MCP local-server setup](https://modelcontextprotocol.io/docs/develop/connect-local-servers)

```json
{
  "mcpServers": {
    "buggy-maps": {
      "command": "node",
      "args": ["/absolute/path/to/buggy-maps/integrations/mcp/server.mjs"]
    }
  }
}
```

Connect the client and ask it to list map datasets, look up schools in ZIP 33133, or prepare a Spanish brief for two selected campuses. The server reads the directory bundled with your clone.

## Select schools for a brief

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

For a direct JSON response from GitHub, use the raw school directory. To pin a snapshot, replace `main` in a raw URL with the full commit SHA. [Download raw school records](https://raw.githubusercontent.com/om1o/buggy-maps/main/dist/buggy/data/schools.json)

Keep the share URL limited to these campus and language fields. Residence, listing ID, family schedule, search query, and browser history belong outside the link. Families can verify attendance boundaries through the district. Buggy handles ride availability, fares, and bookings. [District school locator](https://app.guidek12.com/miami/school_search/current/)
