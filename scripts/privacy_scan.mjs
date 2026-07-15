// scripts/privacy_scan.mjs
// W0-7 privacy-scan CI: 确定性 secrets 泄露扫描（覆盖全仓，非仅 DASHSCOPE）。
//
// 为什么存在（与既有扫描的边界）:
//   - build-integrity.yml R9-2-15: 仅 grep `DASHSCOPE_API_KEY=sk-` 赋值形（单点）。
//   - zero_tolerance_scan.mjs hardcoded_secret_shape: 仅扫 src/ 的 sk- 形状（anti-pattern 套件之一）。
//   本扫描器是**专项 privacy/secret-leak 门**：多类密钥形状 × 全仓目录（src/tests/scripts/ci/FAR_LAB_MASTER_PLAN/frontend/src）。
//   反 theater 红线「来源不可自填」的可执行化延伸——泄露的真实凭据 = 任何人可伪造来源。
//
// 单一真实依赖（T8）: 真实 `git ls-files` 取受版本控制文件清单（不扫 .env/.git/node_modules/dist）+
//   真实正则匹配 + 真实 exit 码。无 mock、无硬编码裁决。
//
// 诚实边界（须直视）:
//   1. 正则形状匹配有假阴性——非标准格式/自定义 token 形状的密钥不被捕获。完整保证须 gitleaks/trufflehog（V2）。
//   2. allowlist 覆盖合法 env 变量名引用（process.env.X / "DASHSCOPE_API_KEY" 字面量名）与文档占位符（sk-xxx/sk-test/<KEY>）。
//   3. 高熵通用检测未实现（假阳率高，故只匹配已知形状）—— V2 可加 Shannon 熵阈值。
//
// 用法: node scripts/privacy_scan.mjs   （CI: PR + main；本地: 预提交自查）
// 退出码: 0=干净（零真实密钥形状）/ 1=发现疑似泄露（逐行打印 file:line:pattern:match）

import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';

// 受版本控制文件清单——`git ls-files` 保证只扫 tracked 文件（.env/.git/node_modules 天然排除）。
const gitLs = spawnSync('git', ['ls-files'], { encoding: 'utf8' });
if (gitLs.status !== 0) {
  console.error('privacy_scan: git ls-files 失败——须在 git 仓库内运行。');
  process.exit(2);
}
const allFiles = gitLs.stdout.split('\n').filter(Boolean);

// 扫描范围: 代码 + 脚本 + CI + 设计文档 + 前端源。排除二进制/锁文件/数据。
const scanExt = new Set([
  '.ts', '.tsx', '.js', '.mjs', '.cjs', '.py', '.sql', '.yml', '.yaml',
  '.md', '.json', '.sh', '.bash', '.ps1', '.toml', '.env.example',
  '.pem', '.key', '.crt', '.p12', '.pfx', '.txt',
]);
// skip-list: 按设计含合成假密钥的测试夹具文件（验证检测器 exit 1 用·非真实泄露）。
// 与 zero_tolerance_scan skippedFiles 同模式（scanner self-ref / meta-test）。
const SKIP_FILES = new Set([
  'tests/scripts/privacy_scan.test.mjs', // 本扫描器单测：合成 sk-/AKIA/ghp_/private-key 形状验证 exit 1
]);
const scanFiles = allFiles.filter((f) => {
  if (SKIP_FILES.has(f)) return false;
  if (f.endsWith('.lock') || f.endsWith('-lock.json') || f === 'package-lock.json') return false;
  if (f.includes('/node_modules/') || f.includes('/dist/') || f.endsWith('.pyc')) return false;
  const dot = f.lastIndexOf('.');
  if (dot < 0) return false;
  return scanExt.has(f.slice(dot).toLowerCase());
});

// 密钥形状（已知格式，低假阳）。每条: 真实泄露时会命中的正则。
const secretPatterns = [
  { name: 'aws_access_key_id', pattern: /\bAKIA[0-9A-Z]{16}\b/ },
  { name: 'aws_secret', pattern: /\baws_secret_access_key\s*[=:]\s*['"][A-Za-z0-9/+=]{40}['"]/i },
  { name: 'github_pat', pattern: /\bgh[pousr]_[A-Za-z0-9]{36,}\b/ },
  { name: 'github_legacy_token', pattern: /\bghp_[A-Za-z0-9]{36}\b/ },
  { name: 'private_key_block', pattern: /-----BEGIN (?:RSA |EC |OPENSSH |DSA |PGP )?PRIVATE KEY-----/ },
  { name: 'jwt_token', pattern: /\beyJ[A-Za-z0-9_-]{8,}\.eyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]*\b/ },
  { name: 'slack_token', pattern: /\bxox[baprs]-[A-Za-z0-9-]{10,}\b/ },
  { name: 'google_api_key', pattern: /\bAIza[0-9A-Za-z_-]{35}\b/ },
  { name: 'stripe_key', pattern: /\b(?:sk|pk|rk)_(?:live|test)_[0-9A-Za-z]{24,}\b/ },
  // DASHSCOPE/通义: sk- 前缀 + 20+ 字符（真实 key 形状）。sk-xxx(3)/sk-test(4)/sk-wJL(占位) 不命中。
  { name: 'dashscope_or_openai_key', pattern: /\bsk-[A-Za-z0-9]{20,}\b/ },
  // 通用裸赋值: secret/token/api_key/password = "高熵串"（排除明显占位符与 env 变量名）。
  { name: 'generic_secret_assignment', pattern: /\b(?:secret|api[_-]?key|access[_-]?token|password|passwd)\b\s*[=:]\s*['"][A-Za-z0-9+/=_-]{32,}['"]/i },
];

// allowlist: 合法引用 env 变量名（非值）+ 文档占位符。命中 allowlist 的行跳过。
const allowlistPatterns = [
  /process\.env\.\w+/i,                 // process.env.DASHSCOPE_API_KEY —— 变量名引用，非值
  /\$\{?(?:DASHSCOPE_API_KEY|API_KEY|SECRET|TOKEN)/i, // ${VAR} / $VAR shell 展开
  /DASHSCOPE_API_KEY=sk-xxx/i,          // 文档示例占位符（§F note 用的 sk-xxx）
  /\bsk-(?:xxx|test|your[_-]?key|<key>|REDACTED)\b/i, // 明显占位符
  /::set-env\s+name=/i,                 // GitHub Actions set-env 语法
];

function isAllowlisted(line) {
  return allowlistPatterns.some((p) => p.test(line));
}

const findings = [];
for (const filePath of scanFiles) {
  let text;
  try {
    text = readFileSync(filePath, 'utf8');
  } catch {
    continue;
  }
  const lines = text.split(/\r?\n/);
  for (const [index, rawLine] of lines.entries()) {
    if (isAllowlisted(rawLine)) continue;
    for (const check of secretPatterns) {
      const m = rawLine.match(check.pattern);
      if (m) {
        // 二次 allowlist: 命中的具体串是否为占位符
        const hit = m[0];
        if (/^(sk-xxx|sk-test|sk-your)/i.test(hit)) continue;
        findings.push(`${filePath}:${index + 1}: ${check.name}: ${hit}`);
      }
    }
  }
}

if (findings.length > 0) {
  console.error(`privacy_scan: 发现 ${findings.length} 处疑似密钥泄露（逐行见下）:`);
  for (const f of findings) console.error('  ' + f);
  console.error('\n若是误报（env 变量名/占位符），加 allowlist 或改引用 process.env.X。');
  console.error('若是真实泄露，立即 rotate 撤销该密钥，再从历史清除。');
  process.exit(1);
}

console.log(`privacy_scan: ✅ 零疑似密钥泄露（扫描 ${scanFiles.length} 个 tracked 文件 · ${secretPatterns.length} 类密钥形状）。`);
console.log('  诚实边界: 正则形状匹配有假阴性；非标准 token 形状/高熵检测属 V2（gitleaks/trufflehog）。');
process.exit(0);
