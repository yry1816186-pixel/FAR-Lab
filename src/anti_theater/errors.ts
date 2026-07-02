/**
 * anti_theater errors —— 反剧场测试工具错误类层次。
 *
 * Authority: PROJECT_PLAN/APPENDIX_E_ANTI_THEATER.md §1（runAntiTheaterLint deterministic_compiler）。
 *
 * 镜像 src/falsifiability/errors.ts 模式：Error 子类层次，纯 throw（非 Result/Outcome）。
 *
 * 模型中立。零容忍合规：无 any / @ts-ignore / 桩。
 */

/** anti_theater 错误基类。 */
export class AntiTheaterError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = 'AntiTheaterError';
  }
}

/** AntiTheaterLintInput 解析/结构错误（schemas.ts parse 失败·缺字段/类型错）。 */
export class AntiTheaterInputError extends AntiTheaterError {
  constructor(message: string) {
    super(message);
    this.name = 'AntiTheaterInputError';
  }
}

/** detector 内部不变量违反（不可达路径·如 attackId 未映射 / blockSeal 与 outcome 不一致）。 */
export class AntiTheaterInvariantError extends AntiTheaterError {
  constructor(message: string) {
    super(message);
    this.name = 'AntiTheaterInvariantError';
  }
}
