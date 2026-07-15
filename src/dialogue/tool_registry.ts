/**
 * tool_registry.ts —— 对话层只读工具注册表（4 个工具·readonly=true·零 MCP SDK）。
 *
 * 设计要点：
 *   - 4 个工具全部 readonly=true（无副作用·可安全重复调用）。
 *   - 零 MCP SDK 依赖：不引入 MCP 官方 SDK，自研轻量工具协议。
 *   - 工具返回确定性结果（离线可复现·不依赖网络）。
 *   - 通道互斥：dialogue 层属主环，工具不进评测环。
 *   - 工具失败时返回 error result（不 throw·由调用方决定降级策略）。
 *
 * 4 个工具：
 *   1. search_literature —— 搜索只读文献索引
 *   2. fetch_baseline —— 获取基线方法描述
 *   3. check_dataset —— 检查数据集可用性
 *   4. lookup_glossary —— 查询术语表
 *
 * 零容忍合规：无 any / ts-ignore / 双重断言 / 空 catch。
 */

// ---------- DialogueToolResult 接口 ----------

export interface DialogueToolResult {
  readonly toolId: string;
  readonly ok: boolean;
  readonly data: Readonly<Record<string, string | number | boolean | readonly string[]>>;
  readonly error: string | null;
}

// ---------- DialogueTool 接口 ----------

export interface DialogueTool {
  readonly toolId: string;
  readonly description: string;
  readonly readonly: true;
  invoke(input: Readonly<Record<string, string>>): DialogueToolResult;
}

// ---------- 1. search_literature：搜索只读文献索引 ----------

// default 引文提取为顶层确定常量：noUncheckedIndexedAccess 下，
// LITERATURE_INDEX[key] 与 LITERATURE_INDEX['default'] 索引访问均得 readonly string[] | undefined；
// 提取常量后 fallback 结果收窄为确定的 readonly string[]（不掩盖 default 缺失，仅声明其确定性）。
const DEFAULT_LITERATURE_CITATIONS: readonly string[] = [
  'arxiv:2001.00001 - General research methodology overview',
];

const LITERATURE_INDEX: Readonly<Record<string, readonly string[]>> = {
  astronomy: [
    'arxiv:2103.00001 - Spectral classification of variable stars',
    'arxiv:2104.00002 - Light curve analysis methods',
    'arxiv:2105.00003 - Cross-matching Gaia DR3 with variable star catalogs',
  ],
  machine_learning: [
    'arxiv:2201.00001 - A survey of transformer architectures',
    'arxiv:2202.00002 - Benchmarking classification metrics',
    'arxiv:2203.00003 - Reproducibility challenges in ML experiments',
  ],
  default: DEFAULT_LITERATURE_CITATIONS,
};

const searchLiteratureTool: DialogueTool = {
  toolId: 'search_literature',
  description: 'Search a readonly literature index by domain keyword. Returns matching citations.',
  readonly: true,
  invoke(input: Readonly<Record<string, string>>): DialogueToolResult {
    const keyword = input.keyword ?? input.domain ?? '';
    if (keyword === '') {
      return {
        toolId: 'search_literature',
        ok: false,
        data: {},
        error: 'search_literature: keyword or domain parameter is required',
      };
    }
    const key = keyword.toLowerCase();
    const results = LITERATURE_INDEX[key] ?? DEFAULT_LITERATURE_CITATIONS;
    return {
      toolId: 'search_literature',
      ok: true,
      data: { keyword: key, citationCount: results.length, citations: results },
      error: null,
    };
  },
};

// ---------- 2. fetch_baseline：获取基线方法描述 ----------

const BASELINE_REGISTRY: Readonly<Record<string, string>> = {
  random_forest: 'Random Forest: ensemble of decision trees with bagging. Baseline for tabular classification.',
  logistic_regression: 'Logistic Regression: linear model for binary classification. Minimal baseline.',
  transformer: 'Transformer: attention-based architecture. Strong baseline for sequence tasks.',
  svm: 'Support Vector Machine: margin-maximizing classifier. Classic baseline for medium-scale data.',
};

const fetchBaselineTool: DialogueTool = {
  toolId: 'fetch_baseline',
  description: 'Fetch a baseline method description by name from a readonly registry.',
  readonly: true,
  invoke(input: Readonly<Record<string, string>>): DialogueToolResult {
    const name = input.name ?? input.baseline ?? '';
    if (name === '') {
      return {
        toolId: 'fetch_baseline',
        ok: false,
        data: {},
        error: 'fetch_baseline: name or baseline parameter is required',
      };
    }
    const key = name.toLowerCase().replace(/\s+/g, '_');
    const description = BASELINE_REGISTRY[key];
    if (description === undefined) {
      return {
        toolId: 'fetch_baseline',
        ok: false,
        data: { requestedName: name },
        error: `fetch_baseline: baseline "${name}" not found in registry`,
      };
    }
    return {
      toolId: 'fetch_baseline',
      ok: true,
      data: { name: key, description },
      error: null,
    };
  },
};

// ---------- 3. check_dataset：检查数据集可用性 ----------

const DATASET_REGISTRY: Readonly<Record<string, { available: boolean; size: string }>> = {
  gaia_dr3: { available: true, size: '1.5 TB' },
  ztf_dr17: { available: true, size: '3.2 TB' },
  asas_sn: { available: true, size: '500 GB' },
  hypothetical_v1: { available: false, size: 'unknown' },
};

const checkDatasetTool: DialogueTool = {
  toolId: 'check_dataset',
  description: 'Check dataset availability and size from a readonly registry.',
  readonly: true,
  invoke(input: Readonly<Record<string, string>>): DialogueToolResult {
    const datasetId = input.datasetId ?? input.dataset ?? '';
    if (datasetId === '') {
      return {
        toolId: 'check_dataset',
        ok: false,
        data: {},
        error: 'check_dataset: datasetId or dataset parameter is required',
      };
    }
    const key = datasetId.toLowerCase().replace(/\s+/g, '_');
    const entry = DATASET_REGISTRY[key];
    if (entry === undefined) {
      return {
        toolId: 'check_dataset',
        ok: false,
        data: { requestedDatasetId: datasetId },
        error: `check_dataset: dataset "${datasetId}" not in registry`,
      };
    }
    return {
      toolId: 'check_dataset',
      ok: true,
      data: { datasetId: key, available: entry.available, size: entry.size },
      error: null,
    };
  },
};

// ---------- 4. lookup_glossary：查询术语表 ----------

const GLOSSARY: Readonly<Record<string, string>> = {
  falsifiability: 'Falsifiability: a claim is scientific only if it can be refuted by evidence.',
  reproducibility: 'Reproducibility: results can be regenerated from the same inputs and code.',
  baseline: 'Baseline: a reference method used for comparison against proposed approaches.',
  metric: 'Metric: a quantitative measure used to evaluate method performance.',
  scope: 'Scope: the boundary of applicability for a claim or method.',
};

const lookupGlossaryTool: DialogueTool = {
  toolId: 'lookup_glossary',
  description: 'Look up a glossary term from a readonly terminology registry.',
  readonly: true,
  invoke(input: Readonly<Record<string, string>>): DialogueToolResult {
    const term = input.term ?? input.glossary ?? '';
    if (term === '') {
      return {
        toolId: 'lookup_glossary',
        ok: false,
        data: {},
        error: 'lookup_glossary: term or glossary parameter is required',
      };
    }
    const key = term.toLowerCase().replace(/\s+/g, '_');
    const definition = GLOSSARY[key];
    if (definition === undefined) {
      return {
        toolId: 'lookup_glossary',
        ok: false,
        data: { requestedTerm: term },
        error: `lookup_glossary: term "${term}" not in glossary`,
      };
    }
    return {
      toolId: 'lookup_glossary',
      ok: true,
      data: { term: key, definition },
      error: null,
    };
  },
};

// ---------- 工具注册表 ----------

export const DIALOGUE_TOOLS: readonly DialogueTool[] = [
  searchLiteratureTool,
  fetchBaselineTool,
  checkDatasetTool,
  lookupGlossaryTool,
];

export const DIALOGUE_TOOL_IDS = [
  'search_literature',
  'fetch_baseline',
  'check_dataset',
  'lookup_glossary',
] as const;



// ---------- 工具调用函数 ----------

export function getDialogueTool(toolId: string): DialogueTool | null {
  return DIALOGUE_TOOLS.find((t) => t.toolId === toolId) ?? null;
}

export function invokeDialogueTool(
  toolId: string,
  input: Readonly<Record<string, string>>,
): DialogueToolResult {
  const tool = getDialogueTool(toolId);
  if (tool === null) {
    return {
      toolId,
      ok: false,
      data: {},
      error: `invokeDialogueTool: unknown toolId "${toolId}"`,
    };
  }
  return tool.invoke(input);
}

export function assertAllToolsReadonly(): void {
  for (const tool of DIALOGUE_TOOLS) {
    if (tool.readonly !== true) {
      throw new Error(`assertAllToolsReadonly: tool ${tool.toolId} is not readonly`);
    }
  }
}
