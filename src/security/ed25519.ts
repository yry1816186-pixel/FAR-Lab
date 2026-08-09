/**
 * ed25519 —— .far-proof / 任意文件 Ed25519 签名（阶段 7 P2 · TK10 签名落地·最小闭环）。
 *
 * 背景（findings TK10-1 / API1+API5 ↔ TK10 ↔ AT6）：签名能力零落地——「安全机制
 * 声明 > 实现」。本模块以 node:crypto 原生 Ed25519（零新依赖）提供：
 *
 *   - generateKeyPair()：密钥对生成（私钥 PEM + 公钥 PEM）
 *   - signFileManifest(fileList, privateKeyPem)：对「文件清单」签名（确定性：
 *     manifest 按相对路径排序 → 逐文件 SHA-256 → JSON canonical → Ed25519）
 *   - verifyFileManifest(fileList, signatureJson, publicKeyPem?)：独立重算 + 逐文件
 *     哈希核对（自含公钥时可用签名内 pubkey 验证·外部公钥可交叉验证）
 *
 * 签名对象 = { files: [{ path, sha256 }], algorithm: 'sha256' }（按 path 排序·
 * 确定性）。签名**不改变**被签文件内容（外部附加 .sig JSON）——与 .far-proof
 * integrity.json 同构但独立（签名锚定可加在任意文件/目录上）。
 *
 * 诚实边界（TK10-2 密钥生命周期·本阶段范围）：
 *   - 私钥由持有者保管（CLI 显式 --key 传入·不内置默认密钥）
 *   - 时间戳为签名者墙钟（TSA 时间戳为 V2 项）
 *   - 本机制证明「某公钥持有者签名过该清单」——不证明「公钥属于谁」（PKI/信任
 *     锚定是组织流程·非本模块）
 *
 * 模型中立（24§0.1 红线）。零容忍合规：无 any / @ts-ignore / 双重断言 / 空 catch。
 */

import {
  createHash,
  generateKeyPairSync,
  sign,
  verify,
  createPublicKey,
  createPrivateKey,
  randomUUID,
} from 'node:crypto';

/** 文件清单条目（相对路径 + SHA-256）。 */
export interface ManifestEntry {
  readonly path: string;
  readonly sha256: string;
}

/** 签名产物（外部 JSON·不含私钥）。 */
export interface FileManifestSignature {
  readonly algorithm: 'ed25519';
  readonly manifestAlgorithm: 'sha256';
  readonly signature: string; // base64
  readonly signerPublicKeyPem: string; // 自含公钥（验证免外部 key）
  readonly signedAt: string; // ISO-8601（签名者墙钟·非 TSA）
  readonly manifest: readonly ManifestEntry[];
  readonly signatureId: string; // uuid（防重放混淆·审计追踪）
}

/**
 * 生成 Ed25519 密钥对（PEM 格式）。
 * @returns { privateKeyPem, publicKeyPem }
 */
export function generateKeyPair(): { privateKeyPem: string; publicKeyPem: string } {
  const { privateKey, publicKey } = generateKeyPairSync('ed25519');
  return {
    privateKeyPem: privateKey.export({ type: 'pkcs8', format: 'pem' }).toString(),
    publicKeyPem: publicKey.export({ type: 'spki', format: 'pem' }).toString(),
  };
}

/** 计算清单的确定性 canonical JSON（按 path 排序·含算法声明）。 */
export function canonicalManifest(
  entries: readonly ManifestEntry[],
  algorithm = 'sha256',
): string {
  const sorted = [...entries]
    .map((e) => ({ path: e.path, sha256: e.sha256 }))
    .sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
  return JSON.stringify({ files: sorted, algorithm });
}

/**
 * 签名文件清单。
 *
 * @param entries   文件清单（path + sha256·调用方负责计算）
 * @param privateKeyPem PKCS8 PEM 私钥
 * @param signedAt   签名时间（缺省 now——注入可测）
 */
export function signFileManifest(
  entries: readonly ManifestEntry[],
  privateKeyPem: string,
  signedAt?: string,
): FileManifestSignature {
  if (entries.length === 0) {
    throw new Error('ed25519.signFileManifest: empty manifest (nothing to sign)');
  }
  const canonical = canonicalManifest(entries);
  const privateKey = createPrivateKey(privateKeyPem);
  const signature = sign(null, Buffer.from(canonical, 'utf8'), privateKey);
  const publicKey = createPublicKey(privateKey).export({ type: 'spki', format: 'pem' }).toString();
  return {
    algorithm: 'ed25519',
    manifestAlgorithm: 'sha256',
    signature: signature.toString('base64'),
    signerPublicKeyPem: publicKey,
    signedAt: signedAt ?? new Date().toISOString(),
    manifest: entries.map((e) => ({ path: e.path, sha256: e.sha256 })),
    signatureId: randomUUID(),
  };
}

/**
 * 验证文件清单签名。
 *
 * @param entries        待验证文件清单（独立重算·与签名内 manifest 比对）
 * @param signatureJson  签名产物
 * @param publicKeyPem   可选外部公钥（缺省用签名自含公钥）
 * @returns { ok, mismatchPaths }——ok=false 时 mismatchPaths 为不一致条目路径
 */
export function verifyFileManifest(
  entries: readonly ManifestEntry[],
  signatureJson: FileManifestSignature,
  publicKeyPem?: string,
): { ok: boolean; mismatchPaths: readonly string[] } {
  const pubPem = publicKeyPem ?? signatureJson.signerPublicKeyPem;
  // 1. 清单一致性（双向）：独立重算的 path→sha256 与签名内 manifest 完全一致——
  //    当前缺文件（签名有·当前无）与内容篡改同样必须 FAIL（防止「删文件逃逸」）。
  const signedByPath = new Map(signatureJson.manifest.map((e) => [e.path, e.sha256]));
  const currentByPath = new Map(entries.map((e) => [e.path, e.sha256]));
  const mismatchPaths: string[] = [];
  for (const entry of entries) {
    const signed = signedByPath.get(entry.path);
    if (signed === undefined || signed !== entry.sha256) {
      mismatchPaths.push(entry.path);
    }
  }
  for (const signed of signatureJson.manifest) {
    if (!currentByPath.has(signed.path)) {
      mismatchPaths.push(`${signed.path} (missing from current)`);
    }
  }
  if (mismatchPaths.length > 0) {
    return { ok: false, mismatchPaths };
  }
  // 2. 加密签名验证：canonical(manifest) 在公钥下有效。
  const canonical = canonicalManifest(signatureJson.manifest);
  const valid = verify(
    null,
    Buffer.from(canonical, 'utf8'),
    createPublicKey(pubPem),
    Buffer.from(signatureJson.signature, 'base64'),
  );
  return { ok: valid, mismatchPaths: [] };
}

/** 计算单文件 SHA-256（hex）。 */
export function sha256Hex(buffer: Buffer): string {
  return createHash('sha256').update(buffer).digest('hex');
}
