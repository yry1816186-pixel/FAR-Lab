// src/cli/commands/init.ts
// far init <domain> —— 初始化一个新 DomainPack 脚手架。
//
// 生成对齐项目 claim/FEC 结构的脚手架目录（domain.config.json + claim.template.json + README.md），
// 供用户填充后接入 far ask / court / arena / fec compile。
// 诚实边界：本命令生成的是「结构化模板」（非可执行的 domain 注册表 —— DomainPackRegistry 是 V2 路线）；
// 它降低新 domain 的接入成本，但不自动接线 src/ pipeline。

import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

export interface InitArgs {
  readonly domain: string;
  readonly outDir: string;
  readonly force: boolean;
}

export function parseInitArgs(argv: readonly string[]): InitArgs {
  let domain = '';
  let outDir = '';
  let force = false;

  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === undefined) continue;
    if (a === '--out') {
      outDir = argv[++i] ?? '';
      continue;
    }
    if (a === '--force') {
      force = true;
      continue;
    }
    if (a.startsWith('--')) {
      throw new Error(`far init: 未知参数 "${a}"`);
    }
    if (domain === '') {
      domain = a;
    }
  }

  if (domain === '') {
    throw new Error('far init: 缺少 <domain> 名（如 astro / mmlu / bio）');
  }
  if (outDir === '') {
    outDir = resolve(`./domains/${domain}`);
  }

  return { domain, outDir, force };
}

function domainClassTag(domain: string): string {
  const upper = domain.replace(/[^a-zA-Z0-9]/g, '-').toUpperCase();
  return upper.length > 0 ? upper : 'DOMAIN';
}

function buildFiles(args: InitArgs): ReadonlyArray<readonly [string, string]> {
  const tag = domainClassTag(args.domain);
  const createdAt = new Date().toISOString();
  const claimId = `${tag}-0001`;

  const config = {
    schemaVersion: 'far.domain_pack.v1',
    name: args.domain,
    claimClass: tag,
    claimIdPrefix: tag,
    createdAt,
    description: 'FAR-Chain DomainPack 脚手架 — 填充后接入 far ask/court/arena',
    wiring: {
      ask: `far ask "<question>" --profile offline_replay`,
      fec: `far fec compile --claim fec.template.json --out <outdir>`,
      court: `far court "<claim>"`,
    },
  };

  const claimTemplate = {
    claimId,
    claimText: '<在此填写可证伪的科学声明>',
    claimClass: tag,
    falsificationSpec: {
      prediction: '<可证伪预测：若 X 成立则应观察到 Y>',
      metric: '<测量指标名>',
      comparator: 'gt',
      falsificationThreshold: 0,
    },
    sourceAnchor: {
      type: '<dataset | paper | model>',
      identifier: '<DOI / arXiv / accession / 模型名>',
    },
    limitations: ['填充前为脚手架占位，不构成真实科学声明'],
  };

  const readme = `# DomainPack: ${args.domain}

由 \`far init ${args.domain}\` 生成（${createdAt}）。

## 结构
- \`domain.config.json\` — domain 元数据 + 接线指引
- \`claim.template.json\` — 可证伪 claim 模板（填充 claimText / falsificationSpec / sourceAnchor）

## 接入步骤
1. 编辑 \`claim.template.json\` —— 填入真实的可证伪声明与测量规范。
2. 编辑 \`fec.template.json\` —— 填入测量规范与统计计划（模板含 <占位>，未填充时\n   \`far fec compile --claim fec.template.json --out <outdir>\` 会报具体缺失项如 METRIC_MISSING）。
3. \`far ask "<基于此 claim 的问题>"\` —— 跑 6-stage FSM（offline_replay）。
4. \`far court "<claim>"\` / \`far arena "<hypothesis>"\` —— 多模型法庭 / 对抗竞技场。

## 边界
本脚手架是结构化模板，**非可执行 domain 注册表**（DomainPackRegistry 是 V2 路线）。
裁决仍由 R0-R9 确定性内核给出（LLM 非裁决者）；真实推理需 \`--profile\` 接真实 provider。
`;

  const fecTemplate = {
    fecId: `FEC-${tag}-0001`,
    contractVersion: 'FEC/2.0',
    claimId,
    measurableImplication: '<可证伪的可测量推断：若 claim 成立则 metric 应达到 threshold>',
    scope: {
      population: '<适用总体 / 数据集>',
      timeWindow: '<时间窗口>',
      domainConstraint: '<领域约束 / 证伪方法>',
    },
    requiredEvidence: [
      {
        evidenceId: `${tag}-primary-evidence`,
        kind: 'measurement',
        critical: true,
        description: '<支撑 claim 的关键证据>',
        verificationCheckId: `${tag}-check-1`,
      },
    ],
    datasetRequirements: [
      {
        name: '<数据集名>',
        contentHashAlgorithm: 'sha256',
        allowSynthetic: false,
        schemaFingerprintRequired: false,
      },
    ],
    workflowRequirements: [
      {
        name: '<复现工作流>',
        engine: 'manual',
        requireContainerDigest: false,
        requireCommandHash: false,
        expectedNetworkPolicy: 'off',
        requireFixedSeed: false,
      },
    ],
    metric: {
      metricKey: '<metric_key>',
      description: '<指标描述>',
      unit: '<单位>',
      computationRef: '<计算引用>',
      isDeterministic: true,
    },
    threshold: {
      value: 0,
      unit: '<单位>',
      thresholdSemantics: 'gt',
      preregistered: false,
    },
    direction: 'greater',
    statisticalPlan: {
      primaryMetric: '<metric_key>',
      nullHypothesis: '<H0：metric <= threshold>',
      alternativeHypothesis: '<H1：metric > threshold>',
      alpha: 0.05,
      effectDirection: 'greater',
      confidenceIntervalMethod: 'not_provided',
      multipleTestingCorrection: 'none',
      missingDataPolicy: 'not_provided',
      outlierPolicy: 'not_provided',
      stoppingRule: 'not_provided',
    },
    seedPolicy: { fixed: false, allowCherryPick: false, justification: '<seed 策略说明>' },
    deviationPolicy: {
      criticalCategories: ['metric_swap', 'alpha_rewrite'],
      nonCriticalHandling: 'degrade',
      requireExplicitLog: true,
    },
    freeze: {
      fecHash: '0'.repeat(64),
      actor: { actorKind: 'deterministic_freezer', actorId: `${tag}-init` },
      timestamp: createdAt,
      environmentPolicy: '<环境锁定策略>',
      deviationPolicyHash: '0'.repeat(64),
      frozenBy: 'deterministic_freezer',
    },
    integrityFlags: [],
  };

  return [
    ['domain.config.json', `${JSON.stringify(config, null, 2)}\n`],
    ['claim.template.json', `${JSON.stringify(claimTemplate, null, 2)}\n`],
    ['fec.template.json', `${JSON.stringify(fecTemplate, null, 2)}\n`],
    ['README.md', readme],
  ];
}

export function runInit(argv: readonly string[]): number {
  const args = parseInitArgs(argv);

  if (existsSync(args.outDir) && !args.force) {
    process.stderr.write(
      `far init: 目录已存在 ${args.outDir}（用 --force 覆盖）\n`,
    );
    return 2;
  }

  mkdirSync(args.outDir, { recursive: true });
  const files = buildFiles(args);
  for (const [name, content] of files) {
    writeFileSync(resolve(args.outDir, name), content, 'utf8');
  }

  process.stdout.write('\n  FAR-Chain · far init（DomainPack 脚手架）\n');
  process.stdout.write('  ─────────────────────────────────────────────────\n');
  process.stdout.write(`  domain   : ${args.domain}（claimClass=${domainClassTag(args.domain)}）\n`);
  process.stdout.write(`  输出     : ${args.outDir}\n`);
  process.stdout.write(`  文件     : ${files.map((f) => f[0]).join(', ')}\n`);
  process.stdout.write('  ─────────────────────────────────────────────────\n');
  process.stdout.write('  下一步：编辑 claim.template.json → far fec compile --claim <path>\n\n');
  return 0;
}
