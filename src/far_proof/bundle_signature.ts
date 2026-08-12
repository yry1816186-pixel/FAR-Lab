/**
 * bundle_signature —— .far-proof bundle 的 Ed25519 签名验证（DEF-18 一致伪造收窄）。
 *
 * 威胁模型（DEF-18 / V-04）：keyless SHA-256 链只检测「朴素篡改」（攻击者不重算哈希）。
 * 拥有写权限的攻击者可重算全部哈希（含 integrity.json）→ bundle 内部自洽 → verify 通过。
 * Ed25519 签名把「bundle 文件清单」绑定到私钥：攻击者改任一文件 → 清单变 → 签名失效；
 * 唯有持有私钥才能重签。于是「重算一致伪造」窗口被收窄到「攻击者同时持有私钥」。
 *
 * 工作流：
 *   far export ...                        产 bundle 目录
 *   far sign <bundle-dir> --key <sk.pem>   产 <bundle-dir>.sig.json（sidecar·在 dir 之外）
 *   far verify --bundle <bundle-dir> [--pubkey <pk.pem>]
 *                                          检测 sidecar → 重算清单 → 验签
 *
 * 确定性：清单构建复用 security/file_manifest.ts（与 sign 同一份 SSOT）。
 * additive：无 sidecar → skipped（零回归·不翻转状态）；有 sidecar 且失效 → 进 errors → FAIL。
 *
 * 【本机制不能证明什么】（§7 诚实声明）：
 *   - 不证明公钥归属/身份（PKI / 信任锚定是组织流程，非本机制）
 *   - 不证明签名时间（signedAt 是签名者墙钟·TSA 时间戳为后续项）
 *   - 不检测「同时持有私钥 + 写权限」的攻击者（其可重签——属密钥泄露·运维检测范畴）
 *   - 仅当 sidecar 存在时收窄 DEF-18；未签名 bundle 的窗口依然敞开（README 已声明）
 *
 * 模型中立。零容忍合规：无 any / @ts-ignore / 双重断言 / 空 catch。
 */

import { existsSync, readFileSync } from 'node:fs';

import { verifyFileManifest, type FileManifestSignature, type ManifestEntry } from '../security/ed25519.ts';
import { buildFileManifest } from '../security/file_manifest.ts';

/** bundle 签名 sidecar 后缀（far sign <dir> 默认产物：<dir>.sig.json，位于 dir 之外）。 */
export const BUNDLE_SIGNATURE_SIDECAR_SUFFIX = '.sig.json';

/** 签名维度结果（verify 输出的一个维度）。 */
export interface BundleSignatureResult {
  /** 是否找到 sidecar 并执行了验签。false = 无签名（skipped·零回归）。 */
  readonly ran: boolean;
  /** pass = 签名有效；fail = 签名失效/损坏/pubkey 不匹配；skipped = 无 sidecar。 */
  readonly status: 'pass' | 'fail' | 'skipped';
  /** 签名是否有效（ran=true 时有意义；skipped 时为 null）。 */
  readonly ok: boolean | null;
  /** 签名者公钥指纹（PEM 首行·审计可读）。 */
  readonly signer?: string;
  /** 签名 id（防重放/审计）。 */
  readonly signatureId?: string;
  /** 失败时的清单不一致路径（篡改物证）。 */
  readonly mismatchPaths?: readonly string[];
  /** 失败原因（损坏/异常/pubkey 不匹配时）。 */
  readonly reason?: string;
  /** 验签覆盖的文件数。 */
  readonly fileCount?: number;
}

/** 定位 bundle 签名 sidecar（<bundlePath>.sig.json）。不存在返回 null。 */
export function findBundleSignaturePath(bundlePath: string): string | null {
  const sidecar = `${bundlePath}${BUNDLE_SIGNATURE_SIDECAR_SUFFIX}`;
  return existsSync(sidecar) ? sidecar : null;
}

/**
 * 验证 bundle 的 Ed25519 签名（若 sidecar 存在）。
 *
 * @param bundlePath bundle 根目录。
 * @param expectedPubKeyPem 可选外部公钥——作归属交叉校验：签名必须由该 key 作出，
 *   否则即使自含公钥验签通过也判 fail（防「换公钥自签」绕过）。
 */
export function verifyBundleSignature(
  bundlePath: string,
  expectedPubKeyPem?: string,
): BundleSignatureResult {
  const sidecar = findBundleSignaturePath(bundlePath);
  if (sidecar === null) {
    return { ran: false, status: 'skipped', ok: null };
  }

  let sigJson: FileManifestSignature;
  try {
    sigJson = JSON.parse(readFileSync(sidecar, 'utf8')) as FileManifestSignature;
  } catch (error) {
    return {
      ran: true,
      status: 'fail',
      ok: false,
      reason: `signature unreadable: ${error instanceof Error ? error.message : String(error)}`,
    };
  }

  let manifest: readonly ManifestEntry[];
  try {
    manifest = buildFileManifest(bundlePath);
  } catch (error) {
    return {
      ran: true,
      status: 'fail',
      ok: false,
      reason: `manifest rebuild failed: ${error instanceof Error ? error.message : String(error)}`,
    };
  }

  const result = verifyFileManifest(manifest, sigJson, expectedPubKeyPem);
  const signer = sigJson.signerPublicKeyPem.split('\n')[0] ?? '';
  const signatureId = sigJson.signatureId;
  const fileCount = manifest.length;
  if (result.ok) {
    return { ran: true, status: 'pass', ok: true, signer, signatureId, fileCount };
  }
  const reason =
    result.mismatchPaths.length > 0
      ? undefined
      : expectedPubKeyPem !== undefined
        ? 'signature not from expected public key (attribution fail) or tampered'
        : 'cryptographic signature invalid';
  return {
    ran: true,
    status: 'fail',
    ok: false,
    signer,
    signatureId,
    fileCount,
    mismatchPaths: result.mismatchPaths,
    ...(reason !== undefined ? { reason } : {}),
  };
}
