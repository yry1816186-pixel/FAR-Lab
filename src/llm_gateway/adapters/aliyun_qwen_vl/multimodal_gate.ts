import type {
  ProviderAdapter,
} from '../../types.ts';
import type {
  MultimodalContentInput,
  MultimodalGate,
  MultimodalProvider,
  MultimodalRouteDecision,
} from './types.ts';

// ===== Guard =====

/**
 * 判断 MultimodalContentInput 是否包含图像内容。
 * imageRef 或 imageBase64 任一非空即视为有图像。
 */
export function inputHasImage(input: MultimodalContentInput): boolean {
  const hasRef = input.imageRef !== undefined && input.imageRef.length > 0;
  const hasB64 = input.imageBase64 !== undefined && input.imageBase64.length > 0;
  return hasRef || hasB64;
}

/**
 * 判断仅包含 prompt 的输入是否看起来需要 vision（基于启发式关键词）。
 * 这只是辅助判断；当调用方显式提供 imageRef/imageBase64 时应直接走 VL 路径。
 * 反 theatre：此函数不应被用于"文本 LLM 编造 fallback"。
 */
export function promptLooksLikeItNeedsVision(prompt: string): boolean {
  const visionKeywords = [
    '图中', '图片', '图表', '图像', '截图', '照片',
    '看图', '图中数据', '曲线', '散点图', '柱状图',
    '折线图', '热力图', '显微镜', 'X 光', 'CT',
    'MRI', '光谱', '频谱', '像素',
    'what is in this image', 'describe this chart',
    'analyze this figure', 'look at the picture',
  ];
  const lower = prompt.toLowerCase();
  return visionKeywords.some((keyword) => lower.includes(keyword));
}

// ===== Factory =====

/** Configuration/specification for multimodal gate config. */
export interface MultimodalGateConfig {
  /** 纯文本 adapter（已注册到 LlmGateway 的 text profile） */
  readonly textAdapter: ProviderAdapter;
  /** VLM adapter（MultimodalProvider 实现） */
  readonly visionProvider: MultimodalProvider;
}

/**
 * 创建多模态路由门控。
 *
 * 职责（audit [H] 死桩清理后）：
 * 1. decide() — 判断输入应走 VL 还是纯文本路径
 * 2. isVisionAvailable() — 运行时检查 VLM 是否可用
 *
 * gate 仅做路由决策，不执行 LLM/VLM 调用——调用方据 decide() 结果直接调用
 * visionProvider.interpret() 或 textAdapter.call()。原 routeVision()/routeText()
 * 是「函数体必 throw·从不返回值」的永抛死桩（audit [H]·违反零容忍 #5 stub），
 * 连同仅它们引用的 RouteVisionArgs/RouteTextArgs + VisionNotAvailableError/
 * NoImageContentError 一并删除。
 *
 * 铁律（来自 spec §0）：
 * - 无 VLM 后端时 isVisionAvailable()=false，证据标 UNTESTED
 * - 禁止用文本 LLM 编造 fallback
 */
export function createMultimodalGate(config: MultimodalGateConfig): MultimodalGate {
  const textProfile = config.textAdapter.profile;
  const visionProfile = config.visionProvider.profile;

  function isVisionAvailable(): boolean {
    return config.visionProvider.declaresVisionCapability();
  }

  function decide(
    input: MultimodalContentInput | { readonly prompt: string },
  ): MultimodalRouteDecision {
    // 显式图像输入 → vision
    if ('imageRef' in input || 'imageBase64' in input) {
      const multiInput = input as MultimodalContentInput;
      if (inputHasImage(multiInput)) {
        if (!isVisionAvailable()) {
          return {
            kind: 'vision',
            reason: 'image content detected but VLM is not available — mark as UNTESTED',
          };
        }
        return { kind: 'vision', reason: 'explicit image content provided' };
      }
    }

    // 仅 prompt 时启发式判断
    const prompt = 'prompt' in input ? input.prompt : '';
    if (promptLooksLikeItNeedsVision(prompt)) {
      if (isVisionAvailable()) {
        return {
          kind: 'vision',
          reason: 'prompt contains vision-related keywords but no image attached',
        };
      }
    }

    return { kind: 'text_only', reason: 'text-only prompt with no vision indicators' };
  }

  return {
    decide,
    textProfile,
    visionProfile,
    isVisionAvailable,
  };
}
