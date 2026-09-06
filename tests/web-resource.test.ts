// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { act, createElement } from '../web/node_modules/react/index.js';
import { createRoot } from '../web/node_modules/react-dom/client.js';
import { useResource, type ResourceState } from '../web/src/hooks/useResource';

interface PendingRequest {
  signal: AbortSignal;
  resolve: (value: string) => void;
  reject: (error: Error) => void;
}

describe('research resource ownership across navigation and refresh', () => {
  let root: ReturnType<typeof createRoot>;
  let container: HTMLDivElement;
  let current: ResourceState<string>;
  let requests: PendingRequest[];

  function Probe({ runId, revision }: { runId: string; revision: number }): null {
    current = useResource((signal) => new Promise<string>((resolve, reject) => {
      requests.push({ signal, resolve, reject });
    }), [runId], revision);
    return null;
  }

  const render = async (runId: string, revision = 0): Promise<void> => {
    await act(async () => { root.render(createElement(Probe, { runId, revision })); });
  };

  beforeEach(() => {
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
    requests = [];
    container = document.createElement('div');
    document.body.append(container);
    root = createRoot(container);
  });

  afterEach(async () => {
    await act(async () => { root.unmount(); });
    container.remove();
    Reflect.deleteProperty(globalThis, 'IS_REACT_ACT_ENVIRONMENT');
  });

  it('a late response from the previous study cannot replace the selected study', async () => {
    await render('study-a');
    await render('study-b');
    expect(requests[0]!.signal.aborted).toBe(true);
    await act(async () => { requests[1]!.resolve('study-b evidence'); });
    expect(current!.data).toBe('study-b evidence');
    // Some fetchers finish parsing or transform data after their fetch resolves;
    // cancellation alone cannot prevent their already-scheduled continuation.
    await act(async () => { requests[0]!.resolve('study-a evidence'); });
    expect(current!.data).toBe('study-b evidence');
    expect(current!.error).toBeNull();
  });

  it('old cancellation or failure cannot finish the new study loading state', async () => {
    await render('study-a');
    await render('study-b');
    await act(async () => { requests[0]!.reject(new Error('previous study disconnected')); });
    expect(current!.loading).toBe(true);
    expect(current!.error).toBeNull();
    await act(async () => { requests[1]!.resolve('study-b evidence'); });
    expect(current!.loading).toBe(false);
    expect(current!.data).toBe('study-b evidence');
  });

  it('identity and revision changing together issue one fetch; refresh keeps only matching data', async () => {
    await render('study-a', 1);
    await act(async () => { requests[0]!.resolve('study-a evidence'); });
    await render('study-b', 2);
    expect(requests).toHaveLength(2);
    expect(current!.data).toBeNull();
    expect(current!.loading).toBe(true);
    await act(async () => { requests[1]!.resolve('study-b v2'); });
    await render('study-b', 3);
    expect(requests).toHaveLength(3);
    expect(current!.data).toBe('study-b v2');
    expect(current!.refreshing).toBe(true);
    await act(async () => { requests[2]!.resolve('study-b v3'); });
    expect(current!.data).toBe('study-b v3');
    expect(current!.refreshing).toBe(false);
  });
});
