# OpenAI-Compatible Unified Adapter

用户愿景「各种接口与功能适配」的工程落点：**一套 adapter，适配所有 OpenAI 兼容端点**。

## 覆盖范围（实测/设计）

| 提供商 | baseURL 形态 | 说明 |
|---|---|---|
| OpenAI | `https://api.openai.com/v1` | 官方 |
| DeepSeek | `https://api.deepseek.com/v1` | 国产，OpenAI 兼容 |
| Zhipu (GLM) | `https://open.bigmodel.cn/api/paas/v4` | 国产，OpenAI 兼容 |
| DashScope 兼容模式 | `https://dashscope.aliyuncs.com/compatible-mode/v1` | 即 competition profile 端点 |
| Ollama (本地) | `http://localhost:11434/v1` | 本地推理，零网络 |
| vLLM (本地) | `http://localhost:8000/v1` | 自托管 GPU 推理 |

## 设计原则

1. **不触碰 competition profile**：`competition_aliyun_qwen` 的 fallback 链/Qwen-only 红线（§5）
   是产品承诺，本 adapter 是**独立的通用扩展**，不参与该链。
2. **baseURL + envVar 全配置**：提供商凭证走环境变量，绝不硬编码密钥。
3. **失败可见**：不静默换模型；降级路径显式记录在 `adapterMeta`。
4. **确定性铁律**：adapter 只做 LLM 调用；裁决确定性由 R0-R9 内核保证，与 LLM 输出无关。

## 使用方式

```ts
import { createOpenAICompatibleAdapter } from './index.ts';

const adapter = createOpenAICompatibleAdapter({
  profile: 'openai_compatible_deepseek',
  baseURL: 'https://api.deepseek.com/v1',
  envVar: 'DEEPSEEK_API_KEY',
  defaultModel: 'deepseek-chat',
  fallbackModels: ['deepseek-reasoner'],
});
const resp = await adapter.call(request);
```
