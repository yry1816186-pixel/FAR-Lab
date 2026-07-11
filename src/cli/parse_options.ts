// src/cli/parse_options.ts
// 声明式 CLI 参数解析：一次遍历 args，按 schema 解析 --flag value / --flag=value / --flag（boolean），
// 收集错误，返回结构化结果。无外部依赖（纯 TS）。
//
// 设计约束（CLAUDE.md §2 注释最小化）：本文件仅暴露接口与实现，不加散文复述注释。

export interface OptionSchema {
  readonly name: string;
  readonly type: 'string' | 'boolean' | 'enum';
  readonly required?: boolean;
  readonly default?: string | boolean;
  readonly enumValues?: readonly string[];
  readonly description: string;
  readonly aliases?: readonly string[];
  readonly positional?: boolean;
  readonly validate?: (value: string) => string | null;
  readonly requiredPlaceholder?: string;
}

export interface ParseResult {
  readonly values: Readonly<Record<string, string | boolean | undefined>>;
  readonly errors: readonly string[];
}

export function parseOptions(
  args: readonly string[],
  schema: readonly OptionSchema[],
  commandPrefix: string,
): ParseResult {
  const values: Record<string, string | boolean | undefined> = {};
  const errors: string[] = [];
  const byFlag = new Map<string, OptionSchema>();
  let positionalSchema: OptionSchema | undefined;

  for (const opt of schema) {
    byFlag.set(opt.name, opt);
    for (const alias of opt.aliases ?? []) {
      byFlag.set(alias, opt);
    }
    if (opt.positional === true) {
      positionalSchema = opt;
    }
    if ('default' in opt) {
      values[opt.name] = opt.default;
    }
  }

  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    if (arg === undefined) {
      continue;
    }

    if (arg.startsWith('--')) {
      const eqIndex = arg.indexOf('=');
      let flagName: string;
      let inlineValue: string | undefined;

      if (eqIndex !== -1) {
        flagName = arg.slice(0, eqIndex);
        inlineValue = arg.slice(eqIndex + 1);
      } else {
        flagName = arg;
        inlineValue = undefined;
      }

      const opt = byFlag.get(flagName);
      if (opt === undefined) {
        errors.push(`${commandPrefix}: 未知参数 '${arg}'`);
        continue;
      }

      if (opt.type === 'boolean') {
        if (inlineValue !== undefined) {
          errors.push(`${commandPrefix}: 未知参数 '${arg}'`);
          continue;
        }
        values[opt.name] = true;
        continue;
      }

      let value: string;
      if (inlineValue !== undefined) {
        value = inlineValue;
      } else {
        const next = args[i + 1];
        if (next === undefined) {
          errors.push(`${commandPrefix}: ${opt.name} 需要一个参数（${opt.description}）`);
          continue;
        }
        value = next;
        i += 1;
      }

      if (opt.type === 'enum' && opt.enumValues !== undefined) {
        if (!opt.enumValues.includes(value)) {
          errors.push(
            `${commandPrefix}: ${opt.name} 当前支持 ${opt.enumValues.join('|')}（实际: ${value}）`,
          );
          continue;
        }
      }

      if (opt.validate !== undefined) {
        const validateError = opt.validate(value);
        if (validateError !== null) {
          errors.push(`${commandPrefix}: ${opt.name} ${validateError}`);
          continue;
        }
      }

      values[opt.name] = value;
    } else {
      if (positionalSchema !== undefined && values[positionalSchema.name] === undefined) {
        values[positionalSchema.name] = arg;
      } else {
        errors.push(`${commandPrefix}: 未知参数 '${arg}'`);
      }
    }
  }

  for (const opt of schema) {
    if (opt.required === true && values[opt.name] === undefined) {
      const placeholder = opt.requiredPlaceholder ?? 'value';
      errors.push(`${commandPrefix}: 必须提供 ${opt.name} <${placeholder}>`);
    }
  }

  return { values, errors };
}

export function reportErrors(errors: readonly string[]): boolean {
  if (errors.length === 0) {
    return false;
  }
  for (const err of errors) {
    process.stderr.write(`${err}\n`);
  }
  return true;
}
