const { spawn } = require('child_process');
const cli = process.env.APPDATA + '\\npm\\node_modules\\@playwright\\mcp\\cli.js';
const p = spawn(process.execPath, [cli], { stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true });
let buf = '';
p.stdout.on('data', (d) => {
  buf += d;
  for (const line of buf.split('\n')) {
    try {
      const m = JSON.parse(line);
      if (m.id === 1) { console.log('INIT ok:', JSON.stringify(m.result.serverInfo)); p.kill(); process.exit(0); }
    } catch {}
  }
  buf = buf.slice(buf.lastIndexOf('\n') + 1);
});
p.stderr.on('data', (d) => console.error('STDERR:', d.toString().slice(0, 300)));
p.stdin.write(JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2024-11-05', capabilities: {}, clientInfo: { name: 'probe', version: '0' } } }) + '\n');
setTimeout(() => { console.log('TIMEOUT'); p.kill(); process.exit(1); }, 30000);
