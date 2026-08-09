/**
 * sign 命令——Ed25519 文件清单签名（阶段 7 P2 · TK10 签名落地·最小闭环）。
 *
 * 用法：
 *   far keygen --out <path>                    生成 Ed25519 密钥对（私钥 PKCS8 PEM + .pub.pem）
 *   far sign <file-or-dir> --key <private.pem> [--out <sig.json>] [--json]
 *       对文件/目录生成确定性清单签名（目录 = 相对路径递归 SHA-256·按 path 排序）
 *   far verify-sig <file-or-dir> --sig <sig.json> [--pubkey <public.pem>] [--json]
 *       独立重算清单 + 逐文件哈希核对 + Ed25519 验证（缺省用签名自含公钥）
 *
 * 诚实边界：签名证明「某私钥持有者签署过该清单」——公钥归属（PKI）是组织流程；
 * 时间戳为签名者墙钟（TSA 为 V2 项）。
 *
 * 零容忍合规：无 any / @ts-ignore / 双重断言 / 空 catch。
 */

import { readFileSync, writeFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import {
  generateKeyPair,
  sha256Hex,
  signFileManifest,
  verifyFileManifest,
  type ManifestEntry,
} from '../../security/ed25519.ts';

/** 递归收集目录内全部文件的相对路径清单（按 path 排序·确定性）。 */
function collectFiles(dir: string, base: string, out: ManifestEntry[]): void {
  const entries = readdirSync(dir);
  const sorted = [...entries].sort();
  for (const name of sorted) {
    const full = join(dir, name);
    const rel = relative(base, full).replace(/\\/g, '/');
    const st = statSync(full);
    if (st.isDirectory()) {
      collectFiles(full, base, out);
    } else if (st.isFile()) {
      out.push({ path: rel, sha256: sha256Hex(readFileSync(full)) });
    }
  }
}

/** 从路径构建清单（文件 = 单条目·目录 = 递归）。 */
function buildManifest(target: string): ManifestEntry[] {
  const st = statSync(target);
  if (st.isFile()) {
    return [{ path: 'file', sha256: sha256Hex(readFileSync(target)) }];
  }
  const entries: ManifestEntry[] = [];
  collectFiles(target, target, entries);
  return entries.sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
}

/** 重建目标路径的当前清单（验证用——与 buildManifest 同构）。 */
function rebuildManifest(target: string): ManifestEntry[] {
  return buildManifest(target);
}

export function runKeygen(args: readonly string[]): number {
  const outIdx = args.indexOf('--out');
  const outPath = outIdx !== -1 ? args[outIdx + 1] : undefined;
  if (outPath === undefined || outPath.length === 0) {
    process.stderr.write('far keygen: --out <path> is required\n');
    return 2;
  }
  const pair = generateKeyPair();
  writeFileSync(outPath, pair.privateKeyPem, { encoding: 'utf8', mode: 0o600 });
  writeFileSync(`${outPath}.pub.pem`, pair.publicKeyPem, { encoding: 'utf8' });
  process.stdout.write(
    `far keygen: Ed25519 key pair written\n  private: ${outPath} (mode 0600)\n  public:  ${outPath}.pub.pem\n`,
  );
  return 0;
}

export function runSign(args: readonly string[]): number {
  const target = args[0];
  const keyIdx = args.indexOf('--key');
  const keyPath = keyIdx !== -1 ? args[keyIdx + 1] : undefined;
  const outIdx = args.indexOf('--out');
  const outPath = outIdx !== -1 ? args[idx(outIdx)] : undefined;
  if (target === undefined || keyPath === undefined || target.length === 0) {
    process.stderr.write('far sign: usage far sign <file-or-dir> --key <private.pem> [--out <sig.json>]\n');
    return 2;
  }
  try {
    const privateKeyPem = readFileSync(keyPath, 'utf8');
    const manifest = buildManifest(target);
    const sig = signFileManifest(manifest, privateKeyPem);
    const sigPath = outPath ?? `${target}.sig.json`;
    writeFileSync(sigPath, `${JSON.stringify(sig, null, 2)}\n`, { encoding: 'utf8' });
    process.stdout.write(
      `far sign: ${manifest.length} file(s) signed (Ed25519)\n  signature: ${sigPath}\n  signer:   ${sig.signerPublicKeyPem.split('\n')[0] ?? ''}\n  id:       ${sig.signatureId}\n`,
    );
    return 0;
  } catch (err) {
    process.stderr.write(`far sign: ${err instanceof Error ? err.message : String(err)}\n`);
    return 1;
  }
}

function idx(i: number): number {
  return i + 1;
}

export function runVerifySig(args: readonly string[]): number {
  const target = args[0];
  const sigIdx = args.indexOf('--sig');
  const sigPath = sigIdx !== -1 ? args[sigIdx + 1] : undefined;
  const pubIdx = args.indexOf('--pubkey');
  const pubPath = pubIdx !== -1 ? args[pubIdx + 1] : undefined;
  if (target === undefined || sigPath === undefined || target.length === 0) {
    process.stderr.write(
      'far verify-sig: usage far verify-sig <file-or-dir> --sig <sig.json> [--pubkey <public.pem>]\n',
    );
    return 2;
  }
  try {
    const sigJson = JSON.parse(readFileSync(sigPath, 'utf8')) as Parameters<
      typeof verifyFileManifest
    >[1];
    const pubPem = pubPath !== undefined ? readFileSync(pubPath, 'utf8') : undefined;
    const current = rebuildManifest(target);
    const result = verifyFileManifest(current, sigJson, pubPem);
    if (result.ok) {
      process.stdout.write(
        `far verify-sig: PASS (${current.length} file(s) match signed manifest; Ed25519 signature valid)\n`,
      );
      return 0;
    }
    process.stderr.write(
      `far verify-sig: FAIL (${result.mismatchPaths.length} path(s) differ: ${result.mismatchPaths.slice(0, 5).join(', ')}${result.mismatchPaths.length > 5 ? '…' : ''})\n`,
    );
    return 7;
  } catch (err) {
    process.stderr.write(`far verify-sig: ${err instanceof Error ? err.message : String(err)}\n`);
    return 1;
  }
}
