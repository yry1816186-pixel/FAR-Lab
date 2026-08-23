Status: EXECUTED (dictation live-verified in-browser 2026-08-23, commit 08bbceb) — 2026-08-24

# DECISION — 多类型文件分析 + 离线语音输入（2026-08-23）

用户指令："本项目应该支持分析各种各样常用的文件类型，并支持离线语音输入。"
四项取舍经用户确认（全部采纳推荐项）。

## 决策

1. **文件类型 = 纯文本投影七类+**（客户端解析，复用 R1 seeds 管线，零服务端改动）：
   docx（mammoth）/ xlsx·xls·csv·tsv·ods（SheetJS，`|` 分列、500 行/sheet 上限）/
   pptx（jszip+DOMParser 抽 `<a:t>`，页序数值排序）/ html（DOMParser，剥 script·style）/
   json / epub / odt·odp（jszip content.xml）。
   统一上限：二进制 25MB、投影 50k 字符（=服务端 `SEED_TEXT_MAX`），截断在附件卡如实标注。
   图片/扫描件 OCR 明确不做（需 tesseract.js 重依赖或视觉模型，另立后续）。
2. **语音 = 浏览器本地 Whisper**（transformers.js v4 + ONNX，Web Worker 内运行），
   设备 wasm、dtype q8、whisper-base；`env.allowRemoteModels=false` 硬保证不触网。
3. **模型交付 = 脚本预置**：`npm run fetch:asr-model`（scripts/fetch-asr-model.mjs）下载
   onnx-community/whisper-base q8 权重 + tokenizer 至 `web/public/models/whisper-base/`，
   ORT wasm 从本地 `web/node_modules/onnxruntime-web/dist` 拷贝（版本锁定，不走 CDN）。
   目录 git-ignored，manifest.json 记录版本+sha256。
   （实际落地：权重由并行工作道于 2026-08-23 下载，本道将平铺布局规范化为
   transformers.js `onnx/` 约定并补齐 wasm/manifest。）
4. **录音链路**：getUserMedia + MediaRecorder(webm/opus) → decodeAudioData → 纯函数
   线性重采样 16k 单声道 → worker 转写 → 插入光标处。Esc/右键取消丢弃；120s 自动停止；
   失败态全部分类可见（权限/无麦/不支持/模型未预置/转写失败）。Home Composer 与
   Conversation 两处输入面同接（DictationButton + useDictation 复用）。

## 验证状态

- 离线确定性测试全绿：`tests/file-ingest.test.ts`（13 例，fixtures 由
  `tests/make-fixtures.mjs` 可复现生成）+ `tests/dictation.test.ts`（9 例）。
- typecheck（root+web）、eslint、secret-scan PASS、path-hygiene PASS、vite build 成功
  （解析库与 transformers 均为懒加载分片，主包不变）；dist 已含 models/。
- 真实麦克风→转写端到端 **UNVERIFIED**（演示归用户；本项目禁真实 API 实测，
  本地推理验证亦留给用户首次使用）。
- 全量套件中 9 个失败全部位于并行工作道在途面（mcp/experiment/reasoning-conversation），
  与本改动无关。

## 附带修复（根因级）

- path-hygiene `DEMO_RE/MOCK_RE` 值分支 `1` 无词边界，会把数值 `10723` 首位当 1
  （在 whisper tokenizer 词表上真实触发）；已加边界断言修复，另将
  `web/public/models` 列为 vendored 工件目录（文本模式扫描无意义）。
- Vite worker 默认 iife 格式与 worker 内动态 import 分片冲突 → `worker.format='es'`。

## 反转触发条件

- 听写质量/延迟不可接受 → 服务端 sherpa-onnx（流式、原生二进制）spike。
- dist 体积（+77MB 模型）成为痛点 → 模型迁出 public/，服务端加 /models 静态路由。
- 需要图片/扫描件 → tesseract.js 或视觉模型通道，作为独立能力立项。
