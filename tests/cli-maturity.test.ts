import { describe, expect, it } from 'vitest';
import { FAR_COMMANDS, bashCompletion, completionScript, pwshCompletion, zshCompletion } from '../src/cli/completion.js';
import { HELP } from '../src/cli/help.js';
import { formatElapsed, isActiveStatus, truncateLine, watchLines } from '../src/cli/watch.js';
import { ResearchRun } from '../src/domain/index.js';

// ---------------------------------------------------------------------------
// fixtures: a minimal valid run whose progress is exactly 3/9 core stages done.
// ---------------------------------------------------------------------------
const makeRun = (over: Partial<ResearchRun> = {}): ResearchRun => ResearchRun.parse({
  id: 'run_abcdefghijklmnopqrstuvwxyz12', // run_ + 28 chars, matches RunId
  questionId: 'q_abcdefghijklmnopqrstuvwxyz12',
  status: 'running',
  currentStage: 'build_evidence',
  stages: [
    { stage: 'scope', state: 'done' },
    { stage: 'retrieve', state: 'done' },
    { stage: 'verify_sources', state: 'done' },
    { stage: 'build_evidence', state: 'running' },
  ],
  createdAt: '2026-08-22T10:00:00.000Z',
  updatedAt: '2026-08-22T10:05:00.000Z',
  ...over,
});

describe('far completion: generators cover the real command tree', () => {
  it('bash script completes every real command and subcommand', () => {
    const script = bashCompletion();
    for (const cmd of FAR_COMMANDS) {
      expect(script, `top-level "${cmd.name}"`).toContain(`'${cmd.name}'`);
      for (const sub of cmd.subs) {
        expect(script, `${cmd.name} sub "${sub.name}"`).toContain(`'${sub.name}'`);
      }
    }
    expect(script).toContain('compgen');
    expect(script).toContain('complete -F _far far');
  });

  it('zsh script is a #compdef with _describe and the full tree', () => {
    const script = zshCompletion();
    expect(script.startsWith('#compdef far')).toBe(true);
    expect(script).toContain('_describe');
    for (const cmd of FAR_COMMANDS) {
      expect(script, `top-level "${cmd.name}"`).toContain(`'${cmd.name}:`);
      for (const sub of cmd.subs) {
        expect(script, `${cmd.name} sub "${sub.name}"`).toContain(`'${sub.name}:`);
      }
    }
  });

  it('pwsh script registers a native argument completer with the full tree', () => {
    const script = pwshCompletion();
    expect(script).toContain("Register-ArgumentCompleter -Native -CommandName 'far'");
    for (const cmd of FAR_COMMANDS) {
      expect(script, `top-level "${cmd.name}"`).toContain(`'${cmd.name}'`);
      for (const sub of cmd.subs) {
        expect(script, `${cmd.name} sub "${sub.name}"`).toContain(`'${sub.name}'`);
      }
    }
  });

  it('completionScript routes supported shells and throws on anything else', () => {
    expect(completionScript('bash')).toBe(bashCompletion());
    expect(completionScript('zsh')).toBe(zshCompletion());
    expect(completionScript('pwsh')).toBe(pwshCompletion());
    for (const bad of ['fish', 'cmd', '', 'bash2']) {
      expect(() => completionScript(bad), `shell "${bad}"`).toThrow(/bash \| zsh \| pwsh/);
    }
  });

  it('tree mirrors the router dispatch surface (guards completion drift)', () => {
    expect(FAR_COMMANDS.map((c) => c.name)).toEqual(
      ['research', 'runs', 'experiment', 'agent', 'probe', 'serve', 'probe-custom', 'memory', 'backup', 'gc', 'data', 'verify', 'new', 'completion'],
    );
    expect(FAR_COMMANDS[0]!.subs.map((s) => s.name)).toEqual(
      ['start', 'status', 'inspect', 'cancel', 'resume', 'export', 'feedback', 'lineage', 'supervise', 'fork'],
    );
    expect(FAR_COMMANDS.find((c) => c.name === 'experiment')!.subs.map((s) => s.name)).toEqual(
      ['run', 'enqueue', 'worker', 'status', 'cancel', 'logs'],
    );
    expect(FAR_COMMANDS.find((c) => c.name === 'agent')!.subs.map((s) => s.name)).toEqual(['refine']);
    expect(FAR_COMMANDS.find((c) => c.name === 'data')!.subs.map((s) => s.name)).toEqual(['info']);
    expect(FAR_COMMANDS.find((c) => c.name === 'completion')!.subs.map((s) => s.name)).toEqual(['bash', 'zsh', 'pwsh']);
  });

  it('HELP and the completion tree agree in both directions (drift found 2026-08-24)', () => {
    // Every dispatchable command must have a HELP usage line…
    for (const cmd of FAR_COMMANDS) {
      expect(HELP, `HELP mentions "far ${cmd.name}"`).toMatch(new RegExp(`^  far ${cmd.name} `, 'm'));
    }
    // …and every top-level `far <cmd>` usage line in HELP must be dispatchable.
    const helpCommands = [...HELP.matchAll(/^ {2}far ([a-z-]+) /gm)].map((m) => m[1]!);
    const treeNames = new Set(FAR_COMMANDS.map((c) => c.name));
    for (const name of helpCommands) {
      expect(treeNames.has(name), `HELP command "${name}" exists in FAR_COMMANDS`).toBe(true);
    }
    // Exit-code contract documented in full (3 = stale dist, 130 = SIGINT).
    expect(HELP).toContain('0 ok, 1 runtime failure, 2 usage error, 3 stale dist');
    expect(HELP).toContain('130 interrupted');
  });
});


/** Strip ANSI escapes before content assertions: picocolors enables color when
 *  vitest injects FORCE_COLOR under CI=true, and frame CONTENT must not depend
 *  on the process color state (found by the first real CI run). */
// eslint-disable-next-line no-control-regex -- stripping ANSI REQUIRES matching the ESC control char by definition
const ANSI_RE = new RegExp('\\u001b\\[[0-9;]*m', 'g');
const plain = (t: string): string => t.replace(ANSI_RE, '');

describe('far research status --watch: pure frame renderer', () => {
  it('renders id/status/stage and stage-count progress — never a percentage', () => {
    const lines = watchLines({
      run: makeRun(),
      lease: { holder: 'worker-1', expiresAt: '2026-08-22T10:09:00.000Z' },
      leaseLive: true,
      lastEvent: { at: '2026-08-22T10:04:30.000Z', type: 'stage_done', stage: 'verify_sources' },
      now: '2026-08-22T10:07:30.000Z',
    });
    const text = plain(lines.join('\n'));
    expect(text).toContain('run_abcdefghijklmnopqrstuvwxyz12');
    expect(text).toContain('running');
    expect(text).toContain('build_evidence');
    expect(text).toContain('3/9 stages'); // 3 of 9 core stages done — counts, not invented %
    expect(text).not.toContain('%');
    expect(text).not.toContain('FROZEN');
    expect(text).toContain('last event: stage_done verify_sources at 2026-08-22T10:04:30.000Z');
    expect(text).toContain('elapsed: 7m30s');
    expect(text).toContain('Ctrl-C to exit');
  });

  it('flags a frozen run (status=running but lease not live) with the resume hint', () => {
    const lines = watchLines({
      run: makeRun(),
      lease: { holder: null, expiresAt: null },
      leaseLive: false,
      lastEvent: null,
      now: '2026-08-22T10:07:30.000Z',
    });
    const text = plain(lines.join('\n'));
    expect(text).toContain('lease: none');
    expect(text).toContain('FROZEN — resume to recover');
    expect(text).toContain('last event: (none)');
  });

  it('final states stop the watch loop and say so', () => {
    const run = makeRun({ status: 'completed', currentStage: 'export' });
    const lines = watchLines({
      run,
      lease: { holder: null, expiresAt: null },
      leaseLive: false,
      lastEvent: { at: '2026-08-22T10:30:00.000Z', type: 'receipt_recorded' },
      now: '2026-08-22T10:30:01.000Z',
    });
    expect(plain(lines.join('\n'))).toContain('final state — watch ended');
    expect(isActiveStatus('completed')).toBe(false);
    expect(isActiveStatus('failed')).toBe(false);
    expect(isActiveStatus('cancelled')).toBe(false);
    expect(isActiveStatus('partial')).toBe(false);
    expect(isActiveStatus('created')).toBe(true);
    expect(isActiveStatus('queued')).toBe(true);
    expect(isActiveStatus('running')).toBe(true);
    expect(isActiveStatus('paused')).toBe(true);
  });

  it('elapsed stays honest: unknown for non-finite/negative deltas', () => {
    expect(formatElapsed(0)).toBe('0s');
    expect(formatElapsed(59_000)).toBe('59s');
    expect(formatElapsed(65_000)).toBe('1m05s');
    expect(formatElapsed(3_723_000)).toBe('1h02m03s');
    expect(formatElapsed(Number.NaN)).toBe('unknown');
    expect(formatElapsed(-5)).toBe('unknown');
    // the domain schema refuses to persist a non-datetime createdAt; the renderer must
    // still degrade honestly if it ever sees one (no fabricated elapsed time)
    const invalidClock = watchLines({
      run: { ...makeRun(), createdAt: 'not-a-date' },
      lease: { holder: null, expiresAt: null },
      leaseLive: false,
      lastEvent: null,
      now: '2026-08-22T10:07:30.000Z',
    });
    expect(plain(invalidClock.join('\n'))).toContain('elapsed: unknown');
  });

  it('truncateLine caps the last-event line at the character budget', () => {
    expect(truncateLine('short', 100)).toBe('short');
    const long = 'x'.repeat(300);
    const cut = truncateLine(long, 100);
    expect(cut).toHaveLength(100);
    expect(cut.endsWith('…')).toBe(true);
    expect(cut.slice(0, 99)).toBe('x'.repeat(99));
  });
});
