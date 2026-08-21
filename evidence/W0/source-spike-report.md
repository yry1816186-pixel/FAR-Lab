# W0 Source Spike Report: OpenAlex / Crossref / arXiv

- 日期：2026-08-21（所有数据为当日真实 API 实跑结果，非模拟）
- 环境：Windows 10 (win32 10.0.26200)，Git Bash，Node v24.14.0，原生 fetch，零第三方依赖
- 脚本：`spikes/source-spike/probe.mjs`（可重复执行；完整原始结果见 `spikes/source-spike/results/{openalex,crossref,arxiv}-latest.json`，每次运行覆盖更新）
- 检索主题（三源统一）：`CRISPR base editing off-target`
- 礼貌池标识：OpenAlex/Crossref 带 `mailto=farlab-spike@example.com` 查询参数 + `User-Agent: FAR-Lab-W0-Spike/0.1 (mailto:farlab-spike@example.com)`；arXiv 仅 User-Agent；arXiv 相邻请求间隔 >= 3.2s（官方要求 3s）
- 检索式：OpenAlex `search=<topic>`；Crossref `query=<topic>`；arXiv 先短语 `all:"<topic>"`（0 命中）后回退 `all:CRISPR AND all:base AND all:editing AND all:off-target`

## 总体结论（TLDR）

| 源 | 可用性 | 元数据 | 摘要 | 全文/链接 | 引用交叉解析 | 快照稳定性 |
|---|---|---|---|---|---|---|
| OpenAlex | OK（200，78,571 命中） | 丰富（含 OA 状态、概念、机构） | 倒排索引，本次 top5 覆盖 1/5 | best_oa_location 落地页 3/5（PMC），直连 PDF 0/5 | 以 DOI 为枢纽，W-id ↔ DOI 双向可查 | 规范化 JSON 稳定；**原始字节不稳定** |
| Crossref | OK（200，928,668 命中） | 权威书目（出版社/容器/license） | 本次 DOI 记录无、搜索 top5 1/5 | message.link 有 PDF URL 但实为 HTML 落地页（出版商门槛） | **DOI 解析与 OpenAlex 标题精确匹配** | 原始字节与规范化 JSON 双稳定（本次） |
| arXiv | OK（200，6 命中/回退查询） | 预印本元数据 + 分类号 | 3/3 全有（118–149 词） | **PDF 直链 3/3，实测 200 application/pdf** | id_list 回查标题匹配、版本一致 | 原始字节与解析规范化双稳定 |

推荐适配器优先级：**OpenAlex（主检索/统一书目骨架）> arXiv（预印本全文层）> Crossref（DOI 权威核验层）**。详见第 7 节。

---

## 1. OpenAlex

### 1.1 真实命令与退出码

```
$ node spikes/source-spike/probe.mjs --source openalex
  [openalex] search -> 200 (2299ms), totalHits=78571, returned=5
  [openalex] abstract coverage: 1/5; OA: 3/5; best_oa_location.pdf_url: 0/5
  [openalex] rebuilt abstract sample (W-length=163 words): Many bacterial clustered regularly…
  [openalex] double-fetch diff paths: (none within 1.5s); canonicalFullStable=true; prunedStable=true
PROBE_RESULT_ALL_OK=true
EXIT_CODE=0
```

### 1.2 字段清单（top 5 works，全部实测取得）

| W-id | DOI | 年份 | cited_by_count | is_oa / oa_status | abstract_inverted_index |
|---|---|---|---|---|---|
| W2939749480 | 10.1038/s41586-019-1161-z | 2019 | 691 | true / green | 无 |
| W2336828812 | 10.1038/nature17946 | 2016 | 5559 | true / green | 无 |
| W2077659966 | 10.1038/nbt.2623 | 2013 | 3363 | true / green | 无 |
| W2971914211 | 10.1038/s41587-019-0236-6 | 2019 | 350 | false / closed | 无 |
| W2554763217 | 10.1146/annurev-biophys-062215-010822 | 2017 | 2096 | false / closed | **有** |

一次搜索即取到任务要求的全部字段：`id` / `doi` / `display_name` / `publication_year` / `cited_by_count` / `open_access.is_oa` / `abstract_inverted_index`（存在性），另有 `type`、`referenced_works_count`、`primary_location.source`、`authorships` 等。

### 1.3 摘要重建（abstract_inverted_index → 文本）

对唯一含倒排索引的记录（W2554763217）按位置排序重建：

- 词数 163，字母 token 占比 1.0，首字母大写 → **人类可读性验证通过**
- 重建开头：`Many bacterial clustered regularly interspaced short palindromic repeats (CRISPR)-CRISPR-associated (Cas) systems employ the dual RNA-guided DNA endonuclease Cas9 to defend against invading phages…`

**重要发现**：top 命中多为 Nature 系高被引文献，其摘要在 OpenAlex 中因出版社政策被过滤（1/5 覆盖）。摘要覆盖是源适配器必须显式处理的降级路径（回退 Crossref abstract 或 arXiv）。

### 1.4 快照不可变性（同一 work 双取，间隔 1.5s）

对象：`https://api.openalex.org/works/W2939749480?mailto=...`，两次均 200。

| 哈希基准 | fetch1 | fetch2 | 结论 |
|---|---|---|---|
| 原始响应体字节 sha256 | `f057d99a…74d757` | `ac2aa176…d282068` | **不相等** |
| 规范化 JSON（递归键排序）sha256 | `eea881a3…213e01` | `eea881a3…213e01` | **相等** |
| 剪除易变字段后的规范化 sha256 | — | — | 相等 |

结论：OpenAlex 同一资源的响应**键序/空白不保证字节稳定，必须以规范化 JSON（键排序）为哈希基准**；短窗口（秒级）内未观察到字段值漂移。`cited_by_count` 等计数器字段的长期漂移由语义决定（见 4.3 与 2.3 的跨源计数分歧证据），必须排除出哈希基准。

### 1.5 OA 全文链接（best_oa_location）

- 3 条 green OA 均给出 PMC 落地页（如 `https://www.ncbi.nlm.nih.gov/pmc/articles/6657343`），**无直连 pdf_url（0/5）**
- 落地页实测（HEAD，跟随重定向）：`200 text/html`，最终 URL `https://pmc.ncbi.nlm.nih.gov/articles/PMC6657343/` → 可达，属落地页层而非文件层
- 2 条 closed 记录 best_oa_location 为 null

### 1.6 速率限制头（实测）

`x-ratelimit-limit: 1000`，`x-ratelimit-remaining: 989`，`x-ratelimit-cost-usd: 0.001`，`x-ratelimit-reset: 48707` 等（礼貌池按 100000/日档计费的观察值，实测返回以上配额字段）。

---

## 2. Crossref

### 2.1 真实命令与退出码

```
$ node spikes/source-spike/probe.mjs --source crossref
  [crossref] GET https://api.crossref.org/works/10.1038/s41586-019-1161-z (fetch #1/#2)
  [crossref] works/{doi} -> 200; titlesMatch(openalex vs crossref)=true; is-referenced-by-count=614; hasAbstract=false
  [crossref] double-fetch diff paths: (none within 1.5s); canonicalFullStable=true; prunedStable=true
  [crossref] query search -> 200, totalHits=928668, returned=5; abstract 1/5; rate-limit headers={"x-concurrency-limit":"3","x-rate-limit-interval":"1s","x-rate-limit-limit":"3"}
PROBE_RESULT_ALL_OK=true
EXIT_CODE=0
```

（脚本内部先经 OpenAlex 搜索取真实 DOI `10.1038/s41586-019-1161-z`，再用它调 Crossref——这正是跨源解析路径。）

### 2.2 引用 ID 交叉解析（OpenAlex DOI → Crossref）

| 字段 | 值 |
|---|---|
| OpenAlex 标题 | Transcriptome-wide off-target RNA editing induced by CRISPR-guided DNA base editors |
| Crossref 标题 | Transcriptome-wide off-target RNA editing induced by CRISPR-guided DNA base editors |
| 归一化标题匹配 | **true** |
| Crossref 补充 | type=journal-article，publisher=Springer Science and Business Media LLC，container=Nature，issued=[2019,4,17] |

**跨源计数分歧（重要）**：同一 DOI 同日，OpenAlex `cited_by_count=691` vs Crossref `is-referenced-by-count=614`。引用数是源特定、时变的投影值，不是同一事实的两份拷贝——适配器不得把它们当作可互相校验的同一不变量，哈希基准也必须排除。

### 2.3 搜索（/works?query=...）

- 200，total-results=928,668，返回 5 条（journal-article 3 + component 2，component 为 SI 材料等非论文类型，适配器需按 type 过滤）
- 摘要覆盖 1/5；license 字段 3/5；message.link 3/5

### 2.4 速率限制头（实测）

- DOI 单条 fetch：`x-rate-limit-limit: 10`，`x-rate-limit-interval: 1s`，`x-concurrency-limit: 3`
- 搜索 fetch：`x-rate-limit-limit: 3`，`x-rate-limit-interval: 1s`，`x-concurrency-limit: 3`

→ 搜索端点配额更紧（3 req/s vs 10 req/s），适配器需按端点分级限速。

### 2.5 快照稳定性

同一 `/works/{doi}` 双取（间隔 1.5s）：**原始字节 sha256 相等**（`722d470c…841f71` 两次一致）且规范化 JSON 相等。本次观察 Crossref 响应字节稳定，但与 OpenAlex 相同的规范化基准仍是稳妥设计（不依赖传输层偶然性）。

### 2.6 全文链接深度

`message.link` 给出 `http://www.nature.com/articles/s41586-019-1161-z.pdf` 等 URL，实测 HEAD 跟随重定向后落地为 **200 text/html**（`?error=cookies_not_supported…`），非直连 PDF——Crossref link 是“出版商入口”而非可下载全文，取全文须走 OA 渠道。

---

## 3. arXiv

### 3.1 真实命令与退出码

```
$ node spikes/source-spike/probe.mjs --source arxiv
  [arxiv] GET .../query?search_query=all%3A%22CRISPR%20base%20editing%20off-target%22...   （短语查询：0 命中，自动回退）
  [arxiv] GET .../query?search_query=all%3ACRISPR%20AND%20all%3Abase%20AND%20all%3Aediting%20AND%20all%3Aoff-target...
  [arxiv] search(and-terms) -> totalResults=6, entries=3
  [arxiv]   entry 2602.16327v1 doi=10.1007/978-3-031-21753-1_41 published=2026-02-18 abstractWords=118
  [arxiv] re-query -> 200; titlesMatch=true; version search=v1 vs requery=v1
  [arxiv] stability: rawTextStable=true; canonicalEntriesStable=true; diff paths=(none)
PROBE_RESULT_ALL_OK=true
EXIT_CODE=0
```

API 端点用 https（http 会 301）；**短语精确匹配 `all:"..."` 命中 0**，AND 分词查询命中 6——arXiv 查询语义偏字面精确，适配器应默认分词 AND 并保留短语作可选模式。

### 3.2 Atom XML 解析（3/3 成功）

| arXiv ID | 版本 | DOI | published | 主分类 | 标题（截断） | 摘要词数 | pdf_url |
|---|---|---|---|---|---|---|---|
| 2602.16327 | v1 | 10.1007/978-3-031-21753-1_41 | 2026-02-18T10:06:54Z | cs.LG | Guide-Guard: Off-Target Predicting in CRISPR Applications | 118 | arxiv.org/pdf/2602.16327v1 |
| 2508.20130 | v1 | ∅ | 2025-08-26T13:34:15Z | q-bio.QM | Artificial Intelligence for CRISPR Guide RNA Design… | 138 | arxiv.org/pdf/2508.20130v1 |
| 2305.05093 | v1 | ∅ | 2023-05-08T23:32:47Z | q-bio.GN | Prokaryotic genome editing based on the subtype I-B-Svi… | 149 | arxiv.org/pdf/2305.05093v1 |

任务要求的 `id / title / abstract / published / doi` 全部解析成功（doi 字段 1/3 存在——预印本 DOI 覆盖不完整，跨源解析须以 arXiv ID 为主键、DOI 为可选外键）。另解析出 authors / categories / primary_category / comment。

### 3.3 单 ID 元数据回查

`?id_list=2602.16327` → 200，标题归一化匹配 **true**，版本 v1 == v1，DOI/published/pdf_url 与搜索结果一致。去版本号回查解析为“最新版本”，适配器需保留版本号作快照键的一部分以区分 v1/v2。

### 3.4 快照稳定性与全文

- 同一搜索 URL 双取（间隔 3.2s+）：原始 XML 字节 sha256 相等（`dd244171f841e0e9` 两次一致），解析后规范化条目亦相等
- PDF 直链实测：`HEAD https://arxiv.org/pdf/2602.16327v1` → **200 application/pdf**（直连文件，无需落地页）

---

## 4. 快照不可变性验证（综合）

### 4.1 哈希基准规范（设计结论）

- 哈希对象 = **规范化 JSON**：UTF-8、递归键排序、无空白。OpenAlex 实测证明原始字节不稳定（键序漂移），任何基于原始 body 的内容寻址都会误判“源变更”
- arXiv 以 XML 文本为源时可对“解析后条目的规范化 JSON”哈希（本次与原始字节一致，但解析规范化对版本演进更稳健）

### 4.2 秒级双取实测汇总

| 源 | 观察到的字段漂移（1.5–3.2s 窗口） | 原始字节稳定 | 规范化稳定 |
|---|---|---|---|
| OpenAlex | 无 | **否** | 是 |
| Crossref | 无 | 是（本次） | 是 |
| arXiv | 无 | 是 | 是 |

### 4.3 必须排除出哈希基准的字段清单

秒级窗口内三源均未观察到漂移；但以下字段按语义为计数器/时间戳/再计算投影，**长期必然变化**（同一 DOI 当日 OpenAlex 691 vs Crossref 614 的跨源引用数分歧即为计数器非恒定的间接证据），须排除：

- **OpenAlex**：`cited_by_count`、`counts_by_year`、`referenced_works_count`、`created_date`、`updated_date`、`open_access.{is_oa,oa_status,oa_date,any_repository_has_fulltext}`、`best_oa_location`、`authorships[*].cited_by_count`、`authorships[*].author.cited_by_count`、`topics`、`keywords`、`sustainable_development_goals`、`cited_by_api_url`
- **Crossref（message 下）**：`is-referenced-by-count`、`references-count`、`reference-count`、`deposited`、`indexed`、`score`、`reference[*].deposited`、`update-link`
- **arXiv（条目级）**：`updated`（作者提交新版本即变）、feed 级 `updated`；版本号（v1→v2）应进入快照键而非哈希排除

脚本内置上述清单（`KNOWN_VOLATILE`），并实测“剪除观察漂移 ∪ 语义易变字段后”三源哈希均稳定。诚实标注：清单中未在秒级窗口内实测到漂移的字段，其长期易变性是基于字段语义的推断，非本次时间窗的直接观测。

---

## 5. 内容深度盘点

| 深度层 | OpenAlex | Crossref | arXiv |
|---|---|---|---|
| 元数据 | 丰富：DOI/W-id、期刊源、作者/机构、OA 状态、主题概念、引用网络 | 权威书目：出版社、容器、license、参考文献结构、fundref | 预印本：分类号、版本、作者、DOI（1/3） |
| 摘要 | 倒排索引可无损重建（本次 top5 覆盖 1/5，高被引 Nature 系被出版社过滤） | 有 abstract 字段但覆盖稀疏（DOI 记录无、搜索 1/5） | **100% 覆盖**（3/3，118–149 词） |
| 全文链接 | best_oa_location 落地页（PMC）3/5 可达；直连 PDF 0/5 | message.link 为出版商入口（实测落到 HTML cookie 页），非全文 | **直连 PDF 3/3，实测 200 application/pdf** |
| 全文本体 | 无（需抓取 OA 落地页） | 无 | 可从 PDF 直链获取 |

结论：**摘要+全文的黄金组合在 arXiv；书目骨架与 OA 路由在 OpenAlex；出版商权威元数据在 Crossref。**

## 6. 引用交叉解析矩阵（实测）

| 路径 | 结果 |
|---|---|
| OpenAlex 搜索 → DOI → Crossref /works/{doi} | 200，标题精确匹配 |
| arXiv id_list 回查（去版本号） | 200，标题匹配、版本一致 |
| arXiv entry DOI →（Crossref/OpenAlex） | 未在本轮单独验证（arXiv DOI 覆盖 1/3，样本少；留给适配器阶段做全量矩阵） |
| 跨源引用计数一致性 | **不一致**（691 vs 614，同 DOI 同日）→ 计数器不可作跨源校验不变量 |

## 7. 适配器优先级建议（给源适配器设计的输入）

1. **OpenAlex 适配器（P0）**：检索主入口 + 书目统一骨架。理由：命中量大（78k）、字段最全、W-id↔DOI 双键、OA 路由信息（best_oa_location）直接可用。设计要点：规范化 JSON 哈希；摘要缺失降级链（OpenAlex → Crossref abstract → arXiv）；排除 4.3 清单。
2. **arXiv 适配器（P1）**：预印本与全文层。理由：唯一提供直连 PDF；摘要 100%；id_list 精确回查。设计要点：默认分词 AND 查询（短语模式命中率不可控）；版本号进快照键；请求间隔 ≥3s。
3. **Crossref 适配器（P2，核验层）**：DOI 权威元数据与 license/参考文献结构，作交叉解析的裁决源而非主检索（搜索噪声大：component 类型混入、92 万命中宽泛、摘要覆盖稀疏、搜索配额仅 3 req/s）。设计要点：按端点分级限速（搜索 3/s vs 单条 10/s）；link 字段不承诺全文。

## 8. 复现

```bash
node spikes/source-spike/probe.mjs --source openalex   # EXIT 0（实测 2026-08-21）
node spikes/source-spike/probe.mjs --source crossref   # EXIT 0（实测 2026-08-21）
node spikes/source-spike/probe.mjs --source arxiv      # EXIT 0（实测 2026-08-21）
node spikes/source-spike/probe.mjs                     # all 三源串行
```

完整响应摘录与全部中间值见 `spikes/source-spike/results/*-latest.json`（每次运行以最新实跑数据覆盖）。
