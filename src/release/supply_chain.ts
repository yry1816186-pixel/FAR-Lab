// src/release/supply_chain.ts
// 职责：REL-SUPPLY-001 —— 标准化供应链证据（发布工程域）。
//
//   - generateSbom(repoRoot)：SPDX-2.3-lite SBOM——根包来自 package.json（name/
//     version/license 实读），传递依赖来自 pnpm-lock.yaml `packages:` 段的确定性
//     文本解析（name@version 键），license 未在 lockfile 内声明 → NOASSERTION
//     （诚实：lockfile 不携带 license 字段，不臆造）。SBOM 哈希 = packages+
//     checksums 的 canonical 哈希（creationInfo.created 墙钟只作显示，不进哈希）。
//   - generateChecksumsManifest(artifactDir)：SHA256SUMS 清单（`<hex>  <path>` 行，
//     路径 posix 化 + 排序——字节确定性）。
//   - createSupplyBundle / revokeArtifact / verifySupplyBundle：用
//     src/security/ed25519.ts 对 checksums 清单签名（复用 signFileManifest/
//     verifyFileManifest——零新依赖）；验证 = 独立重算逐文件哈希 + 验签 + 撤销
//     名单核对。错误身份（换外部公钥）/篡改（改一字节）/撤销（REVOKED）三态
//     必须可区分且全部 FAIL。
//   - renderVerificationInstructions()：人类可读验证步骤（第三方零上下文可执行）。
//   - slsaProvenanceLite(manifest, sbom)：SLSA-lite provenance——引用 build
//     manifest 哈希与 SBOM 哈希（builder=环境快照下界，见 build_manifest.ts 边界）。
//
// 标准映射：SPDX-2.3（子集：spdxVersion/dataLicense/SPDXID/name/documentNamespace/
// creationInfo/packages/checksums）、SLSA-lite（provenance 引用 build manifest）、
// Sigstore 等价物 = Ed25519 detached signature（src/security/ed25519.ts——签名
// 语义等价于 transparency-attested artifact，非证书链 PKI）。
//
// Cannot-prove（本机制不能证明什么）：
//   - SBOM 完整性依赖 lockfile 真实性——本机制不审计 transitive deps 的上游篡改
//     （registry 投毒在发布渠道侧，非本地可证）；依赖 license 为 NOASSERTION 的
//     条目其真实 license 由 NOTICE 表与发布前人工复核承载；
//   - Ed25519 签名证明「签名时刻该公钥持有者见过这些字节」——不证明公钥身份归属
//     （PKI/信任锚是组织流程）；时间戳是签名者墙钟（非 TSA）；
//   - 撤销名单是本地 registry 文件——不提供全局在线撤销查询（离线验证语境下的
//     显式边界：撤销的时效性 = 名单分发时效性）。
//
// 零容忍合规：无 any 类型注解、ts 抑制指令、双重断言、空 catch。模型中立。

import { createHash } from 'node:crypto';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

import {
  generateKeyPair,
  signFileManifest,
  verifyFileManifest,
  type FileManifestSignature,
  type ManifestEntry,
} from '../security/ed25519.ts';
import {
  captureBuildEnvironment,
  type BuildManifest,
} from './build_manifest.ts';
import { toPosixPath } from '../paths.ts';

// ---------------------------------------------------------------------------
// SPDX-2.3-lite SBOM
// ---------------------------------------------------------------------------

export interface SbomPackage {
  readonly SPDXID: string;
  readonly name: string;
  readonly versionInfo: string;
  readonly licenseConcluded: string;
  readonly licenseDeclared: string;
  readonly downloadLocation: string;
  readonly filesAnalyzed: boolean;
}

export interface SbomChecksum {
  readonly algorithm: 'SHA256';
  readonly checksumValue: string;
}

export interface SbomDocument {
  readonly spdxVersion: 'SPDX-2.3';
  readonly dataLicense: 'CC0-1.0';
  readonly SPDXID: 'SPDXRef-Document';
  readonly name: string;
  readonly documentNamespace: string;
  readonly creationInfo: { readonly creators: readonly string[]; readonly created: string };
  readonly packages: readonly SbomPackage[];
  /** 根输入文件（package.json/pnpm-lock.yaml/tsconfig.json）内容哈希。 */
  readonly checksums: readonly (SbomChecksum & { readonly path: string })[];
  /** SBOM 内容哈希（packages+checksums canonical——created 不进哈希）。 */
  readonly sbomHash: string;
}

interface RootPackageJson {
  name: string;
  version: string;
  license: string;
}

function sha256Hex(buffer: Buffer): string {
  return createHash('sha256').update(buffer).digest('hex');
}

/**
 * 解析 pnpm-lock.yaml `packages:` 段 → name@version 清单（确定性文本解析子集：
 * 仅识别 2 空格缩进的包键行；键内 last-@ 切分以兼容 scoped 包）。
 */
export function parseLockfilePackages(lockfileText: string): readonly { name: string; version: string }[] {
  const lines = lockfileText.split(/\r?\n/);
  const out: { name: string; version: string }[] = [];
  let inPackages = false;
  for (const line of lines) {
    if (/^packages:\s*$/.test(line)) {
      inPackages = true;
      continue;
    }
    if (inPackages) {
      if (line.length === 0) continue;
      if (!line.startsWith(' ')) break; // 下一顶层键（snapshots: 等）——packages 段结束
      const m = /^ {2}'([^']+)'/.exec(line) ?? /^ {2}([^'\s][^:]*)/.exec(line);
      if (m === null || m[1] === undefined) continue;
      const key = m[1].trim();
      const at = key.lastIndexOf('@');
      if (at <= 0) continue; // 无版本键（罕见）或裸 @ 开头畸形——跳过（保守）
      out.push({ name: key.slice(0, at), version: key.slice(at + 1) });
    }
  }
  return out;
}

function spdxIdForPackage(index: number): string {
  return `SPDXRef-Package-${index}`;
}

/** 生成 SPDX-2.3-lite SBOM（确定性核心 + 显示性 created——见模块头）。 */
export function generateSbom(
  repoRoot: string,
  options: { readonly created?: string } = {},
): SbomDocument {
  const pkg = JSON.parse(readFileSync(join(repoRoot, 'package.json'), 'utf8')) as RootPackageJson;
  const lockText = readFileSync(join(repoRoot, 'pnpm-lock.yaml'), 'utf8');
  const lockPackages = parseLockfilePackages(lockText);
  const packages: SbomPackage[] = [
    {
      SPDXID: 'SPDXRef-Package-Root',
      name: pkg.name,
      versionInfo: pkg.version,
      licenseConcluded: pkg.license,
      licenseDeclared: pkg.license,
      downloadLocation: 'NOASSERTION',
      filesAnalyzed: false,
    },
    ...lockPackages.map((p, i) => ({
      SPDXID: spdxIdForPackage(i + 1),
      name: p.name,
      versionInfo: p.version,
      // lockfile 不携带 license——NOASSERTION 是诚实值，不臆造（NOTICE 表承载人工复核）
      licenseConcluded: 'NOASSERTION',
      licenseDeclared: 'NOASSERTION',
      downloadLocation: 'NOASSERTION',
      filesAnalyzed: false,
    })),
  ];
  const checksums = ['package.json', 'pnpm-lock.yaml', 'tsconfig.json'].map((rel) => {
    const buffer = readFileSync(join(repoRoot, rel));
    return { algorithm: 'SHA256' as const, checksumValue: sha256Hex(buffer), path: rel };
  });
  const core = { name: `${pkg.name}-${pkg.version}`, packages, checksums };
  const sbomHash = sha256Hex(Buffer.from(JSON.stringify(core), 'utf8'));
  return {
    spdxVersion: 'SPDX-2.3',
    dataLicense: 'CC0-1.0',
    SPDXID: 'SPDXRef-Document',
    name: core.name,
    documentNamespace: `https://farlab.dev/spdx/${pkg.name}/${sbomHash.slice(0, 16)}`,
    creationInfo: {
      creators: ['Tool: far-lab-release-supply-chain'],
      created: options.created ?? new Date().toISOString(),
    },
    packages,
    checksums,
    sbomHash,
  };
}

// ---------------------------------------------------------------------------
// SHA256SUMS 清单 + 签名 bundle
// ---------------------------------------------------------------------------

/** 列目录（递归）全部文件——posix 相对路径排序（确定性）。 */
export function listArtifactFiles(artifactDir: string): readonly string[] {
  const out: string[] = [];
  const walk = (dir: string, rel: string): void => {
    for (const entry of readdirSync(dir, { withFileTypes: true }).sort((a, b) => (a.name < b.name ? -1 : 1))) {
      const relPath = rel.length === 0 ? entry.name : `${rel}/${entry.name}`;
      if (entry.isDirectory()) {
        walk(join(dir, entry.name), relPath);
      } else if (entry.isFile()) {
        out.push(relPath);
      }
    }
  };
  walk(artifactDir, '');
  return out;
}

/** SHA256SUMS 文本（`<hex>  <path>` 两空格分隔——GNU sha256sum 兼容行格式）。 */
export function generateChecksumsManifest(artifactDir: string): { text: string; entries: readonly ManifestEntry[] } {
  const entries = listArtifactFiles(artifactDir).map((rel) => ({
    path: rel,
    sha256: sha256Hex(readFileSync(join(artifactDir, rel))),
  }));
  const text = `${entries.map((e) => `${e.sha256}  ${e.path}`).join('\n')}\n`;
  return { text, entries };
}

export interface SupplyBundle {
  readonly schema: 'far-supply-bundle/1';
  readonly artifactDirBasename: string;
  readonly checksumsText: string;
  readonly signature: FileManifestSignature;
  /** 撤销名单（相对路径——追加式 revocation registry）。 */
  readonly revoked: readonly string[];
}

export interface CreateSupplyBundleOptions {
  readonly privateKeyPem: string;
  readonly signedAt?: string;
  readonly revoked?: readonly string[];
}

/** 组装供应链 bundle：checksums 清单 + Ed25519 签名（撤销名单初始为空或注入）。 */
export function createSupplyBundle(
  artifactDir: string,
  options: CreateSupplyBundleOptions,
): SupplyBundle {
  const { entries, text } = generateChecksumsManifest(artifactDir);
  const signature = signFileManifest(entries, options.privateKeyPem, options.signedAt);
  return {
    schema: 'far-supply-bundle/1',
    artifactDirBasename: toPosixPath(artifactDir).split('/').filter(Boolean).pop() ?? 'artifacts',
    checksumsText: text,
    signature,
    revoked: [...(options.revoked ?? [])],
  };
}

/** 撤销一个 artifact（追加式——撤销不可静默移除既有撤销）。 */
export function revokeArtifact(bundle: SupplyBundle, path: string): SupplyBundle {
  if (bundle.revoked.includes(path)) return bundle;
  return { ...bundle, revoked: [...bundle.revoked, path] };
}

export type SupplyVerifyStatus =
  | 'OK'
  | 'REVOKED'
  | 'TAMPERED'
  | 'MISSING_FILE'
  | 'BAD_SIGNATURE'
  | 'EMPTY';

export interface SupplyVerifyResult {
  readonly status: SupplyVerifyStatus;
  readonly ok: boolean;
  readonly problems: readonly string[];
  readonly revokedHits: readonly string[];
}

export interface VerifySupplyBundleOptions {
  /** 外部信任公钥（缺省用签名自含公钥）。错误身份用例 = 传入不同公钥 → BAD_SIGNATURE。 */
  readonly trustedPublicKeyPem?: string;
}

/**
 * 第三方验证供应链 bundle（独立重算——不信任 bundle 内嵌哈希值本身）：
 *   1. 验签（Ed25519，外部公钥或自含公钥）→ 失败 = BAD_SIGNATURE（错误身份）；
 *   2. 撤销名单命中 → REVOKED（即使哈希与签名都完好）；
 *   3. 逐文件独立重算 SHA-256 与签名 manifest 比对 → 改一字节 = TAMPERED，
 *      文件被删 = MISSING_FILE；
 *   4. 空目录 = EMPTY。
 */
export function verifySupplyBundle(
  artifactDir: string,
  bundle: SupplyBundle,
  options: VerifySupplyBundleOptions = {},
): SupplyVerifyResult {
  if (!statSync(artifactDir).isDirectory()) {
    return { status: 'MISSING_FILE', ok: false, problems: [`artifact dir missing: ${artifactDir}`], revokedHits: [] };
  }
  const currentEntries = listArtifactFiles(artifactDir).map((rel) => ({
    path: rel,
    sha256: sha256Hex(readFileSync(join(artifactDir, rel))),
  }));
  if (currentEntries.length === 0) {
    return { status: 'EMPTY', ok: false, problems: ['artifact dir is empty'], revokedHits: [] };
  }
  // 1. 签名（身份）验证——对「签名内 manifest 自身」做纯密码学验证（与磁盘状态解耦：
  //    错误身份 = BAD_SIGNATURE，不与篡改混淆）
  const identityCheck = verifyFileManifest(bundle.signature.manifest, bundle.signature, options.trustedPublicKeyPem);
  if (!identityCheck.ok) {
    return {
      status: 'BAD_SIGNATURE',
      ok: false,
      problems: [
        `signature verification failed (wrong signer identity or tampered manifest): ${identityCheck.mismatchPaths.join(', ')}`,
      ],
      revokedHits: [],
    };
  }
  // 2. 撤销名单
  const revokedHits = bundle.revoked.filter((p) => currentEntries.some((e) => e.path === p));
  if (revokedHits.length > 0) {
    return { status: 'REVOKED', ok: false, problems: revokedHits.map((p) => `artifact revoked: ${p}`), revokedHits };
  }
  // 3. 逐文件哈希核对（签名 manifest vs 独立重算——verifyFileManifest 已含双向比对，
  //    此处分型 TAMPERED/MISSING_FILE 供修复指引）
  const signedByPath = new Map(bundle.signature.manifest.map((e) => [e.path, e.sha256]));
  const problems: string[] = [];
  let tampered = false;
  let missing = false;
  for (const entry of currentEntries) {
    const signed = signedByPath.get(entry.path);
    if (signed === undefined) {
      missing = true;
      problems.push(`unregistered file (not in signed manifest): ${entry.path}`);
    } else if (signed !== entry.sha256) {
      tampered = true;
      problems.push(`hash mismatch (tampered): ${entry.path}`);
    }
  }
  for (const signed of bundle.signature.manifest) {
    if (!currentEntries.some((e) => e.path === signed.path)) {
      missing = true;
      problems.push(`file deleted since signing: ${signed.path}`);
    }
  }
  if (tampered || missing) {
    return { status: tampered ? 'TAMPERED' : 'MISSING_FILE', ok: false, problems, revokedHits: [] };
  }
  return { status: 'OK', ok: true, problems: [], revokedHits: [] };
}

// ---------------------------------------------------------------------------
// SLSA-lite provenance + 验证指引
// ---------------------------------------------------------------------------

export interface SlsaProvenanceLite {
  readonly schema: 'slsa-lite/1';
  readonly buildManifestHash: string;
  readonly sbomHash: string;
  readonly builder: { readonly nodeVersion: string; readonly platform: string; readonly arch: string };
  /** 边界声明（机器内嵌——第三方读到边界即读到诚实面）。 */
  readonly cannotProve: readonly string[];
}

/** SLSA-lite provenance：引用 build manifest 哈希 + SBOM 哈希（不重复罗列文件）。 */
export function slsaProvenanceLite(manifest: BuildManifest, sbom: SbomDocument): SlsaProvenanceLite {
  return {
    schema: 'slsa-lite/1',
    buildManifestHash: manifest.manifestHash,
    sbomHash: sbom.sbomHash,
    builder: captureBuildEnvironment(),
    cannotProve: [
      'builder 环境快照是差异下界（node/platform/arch），不证明编译工具链字节级不变',
      'provenance 引用 manifest 哈希——manifest 之外的输入（OS 补丁面/native 依赖二进制）不在证明范围',
    ],
  };
}

/** 人类可读验证步骤（第三方零上下文可执行——REL-SUPPLY-001 verification instructions）。 */
export function renderVerificationInstructions(bundle: SupplyBundle, provenance: SlsaProvenanceLite): string {
  return [
    '# FAR-Lab supply bundle verification instructions',
    '',
    '1. Recompute SHA-256 for every file in the artifact directory:',
    '   sha256sum <artifact-dir>/*  (or: node -e "crypto" equivalent)',
    `2. Compare against the signed checksums manifest (signedAt ${bundle.signature.signedAt}):`,
    ...bundle.signature.manifest.map((e) => `   ${e.sha256}  ${e.path}`),
    `3. Verify the Ed25519 signature with the trusted public key (signatureId ${bundle.signature.signatureId}):`,
    '   verifyFileManifest(entries, signature, trustedPublicKeyPem) must return ok=true',
    `4. Check the revocation list (revoked artifacts must FAIL verification): [${bundle.revoked.join(', ') || 'empty'}]`,
    `5. Cross-check provenance: buildManifestHash=${provenance.buildManifestHash} sbomHash=${provenance.sbomHash}`,
    '6. Any mismatch in steps 1-5 means the bundle is NOT authentic — do not ship, escalate.',
  ].join('\n');
}

/** 密钥对生成直通（发布方入口——私钥不落仓库，见 ed25519.ts 生命周期边界）。 */
export function newSignerKeyPair(): { privateKeyPem: string; publicKeyPem: string } {
  return generateKeyPair();
}
