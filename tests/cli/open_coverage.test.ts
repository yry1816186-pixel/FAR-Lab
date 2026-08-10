/**
 * open_coverage.test.ts —— src/db/open.ts 分支补充测试（L2 coverage-batch2）。
 *
 * 目标：src/db/open.ts branch ≥75%（Z16 门禁）。
 * 补齐既有 open.test.ts / db_open_pragma.test.ts 未覆盖的 fail-closed 分支：
 *   - 打开失败（new Database 抛错 → DatabaseIntegrityError·81-82）
 *   - PRAGMA 配置失败（db.close + DatabaseIntegrityError·91-96）
 *   - assertPragmaBaseline：synchronous≠2（53-54）与 busy_timeout≠5000（64-65）
 *   - integrity_check/quick_check 返回非 ok（112-114·quick 与 full 两模式）
 *   - readonly 路径 + quick_check 损坏（readonly 仍 fail-closed）
 *
 * 触发方式：对 better-sqlite3 实例的 pragma 方法用 node:test mock 注入
 * 损坏返回值/异常（源码实证：这些分支正常调用下不可达——PRAGMA 设置后立即
 * 断言恒真·完整性检查正常库恒返回 ok）。
 *
 * 铁律：测试期望基于源码实际行为；无空断言。
 */

import { test, mock } from 'node:test';
import assert from 'node:assert/strict';
import Database from 'better-sqlite3';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { openFarDb, DatabaseIntegrityError } from '../../src/db/open.ts';

/**
 * mock better-sqlite3 pragma：override 返回 undefined 表示放行走原实现。
 * 类型安全：mock 前保存原函数引用（orig），转发调用 orig 而非 Database.prototype
 * （后者在 mock 激活时指向 mock 自身——递归）。经 @types/better-sqlite3 签名
 * (source, options?) => unknown 类型化，无 as unknown as。
 */
function mockPragma(
  override: (arg0: string, rest: readonly unknown[]) => unknown | undefined,
): void {
  const orig = Database.prototype.pragma as (src: string, opts?: unknown) => unknown;
  mock.method(
    Database.prototype,
    'pragma',
    function (this: Database.Database, source: string, ...rest: unknown[]) {
      const out = override(source, rest);
      if (out !== undefined) {
        return out;
      }
      return orig.call(this, source, rest[0] as { readonly [k: string]: unknown } | undefined);
    },
  );
}

function tempDir(prefix: string): { dir: string; cleanup: () => void } {
  const dir = mkdtempSync(join(tmpdir(), prefix));
  return { dir, cleanup: () => rmSync(dir, { recursive: true, force: true }) };
}


test('open: 打开失败（父目录不存在）→ DatabaseIntegrityError 含恢复指引', () => {
  const { dir, cleanup } = tempDir('far-open-fail-');
  try {
    const badPath = join(dir, 'no-such-parent', 'x.sqlite');
    assert.throws(
      () => openFarDb(badPath),
      (err: unknown) => {
        assert.ok(err instanceof DatabaseIntegrityError, '打开失败须抛 DatabaseIntegrityError');
        assert.match(err.message, /打开失败/, '错误须标明打开失败');
        assert.match(err.message, /恢复指引/, '错误须附备份/恢复指引');
        return true;
      },
    );
  } finally {
    cleanup();
  }
});


test('open: PRAGMA 配置失败 → db.close 被调用 + DatabaseIntegrityError', () => {
  const { dir, cleanup } = tempDir('far-pragma-fail-');
  let closeCount = 0;
  const origClose = Database.prototype.close as () => unknown;
  try {
    mock.method(Database.prototype, 'close', function (this: Database.Database) {
      closeCount += 1;
      return origClose.call(this);
    });
    const origPragma = Database.prototype.pragma as (src: string, opts?: unknown) => unknown;
    mock.method(
      Database.prototype,
      'pragma',
      function (this: Database.Database, source: string, options?: unknown) {
        if (source.includes('=')) {
          // 模拟库头部损坏：journal_mode 等设置 PRAGMA 抛错
          throw new Error('simulated pragma failure (corrupt file header)');
        }
        return origPragma.call(this, source, options);
      },
    );

    assert.throws(
      () => openFarDb(join(dir, 'p.sqlite')),
      (err: unknown) => {
        assert.ok(err instanceof DatabaseIntegrityError, 'PRAGMA 失败须转 DatabaseIntegrityError');
        assert.match(err.message, /PRAGMA 配置失败/, '错误须标明 PRAGMA 配置失败');
        return true;
      },
    );
    assert.equal(closeCount, 1, 'PRAGMA 失败路径必须关闭连接（fail-closed 资源清理）');
  } finally {
    mock.restoreAll();
    cleanup();
  }
});


test('open: assertPragmaBaseline——synchronous≠2 → throw G5 配置基线违反', () => {
  try {
    mockPragma((arg0, rest) => {
      if (arg0 === 'synchronous' && rest.length === 1) {
        return 0; // 读 synchronous 返回 0（期望 FULL=2）→ 断言失败
      }
      return undefined;
    });
    assert.throws(() => openFarDb(':memory:'), /synchronous=0/, 'synchronous≠2 必须 throw');
  } finally {
    mock.restoreAll();
  }
});


test('open: assertPragmaBaseline——busy_timeout≠5000 → throw G5 配置基线违反', () => {
  try {
    mockPragma((arg0) => {
      if (arg0 === 'busy_timeout') {
        return 1000; // 读 busy_timeout 返回 1000（期望 5000）→ 断言失败
      }
      return undefined;
    });
    assert.throws(() => openFarDb(':memory:'), /busy_timeout=1000/, 'busy_timeout≠5000 必须 throw');
  } finally {
    mock.restoreAll();
  }
});


test('open: quick_check 返回非 ok → DatabaseIntegrityError（integrityCheck=quick 默认）', () => {
  try {
    mockPragma((arg0) => {
      if (arg0 === 'quick_check') {
        return [{ quick_check: 'database disk image is malformed' }];
      }
      return undefined;
    });
    assert.throws(
      () => openFarDb(':memory:', { integrityCheck: 'quick' }),
      (err: unknown) => {
        assert.ok(err instanceof DatabaseIntegrityError);
        assert.match(err.message, /database disk image is malformed/);
        return true;
      },
    );
  } finally {
    mock.restoreAll();
  }
});


test('open: integrity_check 返回非 ok → DatabaseIntegrityError（integrityCheck=full）', () => {
  try {
    mockPragma((arg0) => {
      if (arg0 === 'integrity_check') {
        return [{ integrity_check: 'database disk image is malformed' }];
      }
      return undefined;
    });
    assert.throws(
      () => openFarDb(':memory:', { integrityCheck: 'full' }),
      (err: unknown) => {
        assert.ok(err instanceof DatabaseIntegrityError);
        assert.match(err.message, /database disk image is malformed/);
        return true;
      },
    );
  } finally {
    mock.restoreAll();
  }
});


test('open: readonly 路径 + quick_check 损坏 → 仍 fail-closed（DatabaseIntegrityError）', () => {
  const { dir, cleanup } = tempDir('far-ro-corrupt-');
  try {
    const dbPath = join(dir, 'ro.sqlite');
    const w = openFarDb(dbPath);
    w.close();

    mockPragma((arg0) => {
      if (arg0 === 'quick_check') {
        return [{ quick_check: 'database disk image is malformed' }];
      }
      return undefined;
    });
    assert.throws(
      () => openFarDb(dbPath, { readonly: true, integrityCheck: 'quick' }),
      (err: unknown) => {
        assert.ok(err instanceof DatabaseIntegrityError, 'readonly 路径损坏也须 fail-closed');
        return true;
      },
    );
  } finally {
    mock.restoreAll();
    cleanup();
  }
});
