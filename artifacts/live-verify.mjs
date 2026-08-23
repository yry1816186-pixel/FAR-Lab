// Live functional verification: drive both registered MCP servers through the
// PRODUCT's own McpStdioClient (dist/agent/mcp.js) — not a hand-rolled probe.
import { McpStdioClient } from '../dist/agent/mcp.js';

const results = {};

// 1) Docling: convert the real workspace PDF (jss_metafor.pdf)
{
  const c = new McpStdioClient({
    command: 'docling-mcp-server',
    args: ['--transport', 'stdio', 'conversion'],
    env: { DOCLING_MCP_CONVERSION_MODE: 'local' },
    timeoutMs: 180000,
  });
  await c.connect();
  const tools = await c.listTools();
  const convert = tools.find((t) => t.name === 'convert_document_into_docling_document');
  const out = await c.callTool(convert.name, {
    source: 'C:/Users/RichardYuan/Desktop/new/jss_metafor.pdf',
  });
  const text = JSON.stringify(out).slice(0, 400);
  results.docling = { tools: tools.map((t) => t.name), sample: text };
  await c.close().catch(() => {});
}

console.log(JSON.stringify(results, null, 2));
process.exit(0);
