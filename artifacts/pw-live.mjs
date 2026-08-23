// Live functional verification: Playwright MCP via PRODUCT's McpStdioClient.
import { McpStdioClient } from '../dist/agent/mcp.js';

const c = new McpStdioClient({
  command: process.execPath,
  args: [process.env.APPDATA + '\\npm\\node_modules\\@playwright\\mcp\\cli.js', '--headless'],
  timeoutMs: 120000,
});
await c.connect();
const tools = await c.listTools();

// navigate to a real page
const nav = tools.find((t) => t.name === 'browser_navigate');
const r1 = await c.callTool(nav.name, { url: 'https://example.com' });
const navText = r1.content.map((x) => x.text).join('\n');

// take an accessibility snapshot (the deterministic core of playwright-mcp)
const snap = tools.find((t) => t.name === 'browser_snapshot');
const r2 = await c.callTool(snap.name, {});
const snapText = r2.content.map((x) => x.text).join('\n');

console.log(JSON.stringify({
  toolCount: tools.length,
  navigated: navText.includes('Example Domain') || navText.toLowerCase().includes('example'),
  snapshotHasHeading: snapText.includes('heading'),
  sample: snapText.slice(0, 300),
}, null, 2));
await c.close().catch(() => {});
process.exit(0);
