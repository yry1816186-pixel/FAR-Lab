import { useState } from 'react';
import { PackagePlus, Pencil, Plug, Trash2 } from 'lucide-react';
import { useI18n } from '../i18n/LanguageContext';
import type { DictKey } from '../i18n/dict';
import { useToolIntegrations } from '../hooks/useToolIntegrations';
import { importPluginFromDir } from '../api/endpoints';
import { errorText } from './common';
import type { ToolIntegrationKind, ToolIntegrationView } from '../api/types';

/**
 * Tool integrations section (TIS): the product surface where the researcher wires
 * external tools into agent sessions — MCP servers (stdio/streamable-HTTP), inline
 * skills, prompt-template commands, and declarative hook rules. Status honesty:
 * the only "state" shown is the stored enabled flag plus the LAST explicit test
 * record — no background polling, no fake liveness.
 */

type FormKind = ToolIntegrationKind;

interface ToolFormState {
  id: string | null;
  kind: FormKind;
  label: string;
  // mcp_server
  transport: 'stdio' | 'http';
  command: string;
  args: string;
  url: string;
  env: string;
  headers: string;
  toolNamePrefix: string;
  riskClass: 'read' | 'edit' | 'execute' | 'destructive';
  timeoutMs: string;
  // skill
  name: string;
  description: string;
  whenToUse: string;
  priority: string;
  body: string;
  // command
  template: string;
  scope: 'palette' | 'composer' | 'both';
  // hook_rule
  event: 'before_tool' | 'after_tool' | 'turn_end';
  toolPattern: string;
  hookRiskClass: '' | 'read' | 'edit' | 'execute' | 'destructive';
  actionType: 'block' | 'require_approval' | 'log';
  actionReason: string;
}

const EMPTY_FORM: ToolFormState = {
  id: null, kind: 'mcp_server', label: '',
  transport: 'stdio', command: '', args: '', url: '', env: '', headers: '', toolNamePrefix: '', riskClass: 'execute', timeoutMs: '30000',
  name: '', description: '', whenToUse: '', priority: '0', body: '',
  template: '', scope: 'both',
  event: 'before_tool', toolPattern: '', hookRiskClass: '', actionType: 'log', actionReason: '',
};

/** Parse `KEY=value` lines into a record; invalid lines are surfaced as an error message. */
const parseKeyValueLines = (text: string): { map: Record<string, string>; error: string | null } => {
  const map: Record<string, string> = {};
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (line.length === 0) continue;
    const eq = line.indexOf('=');
    if (eq <= 0) return { map, error: `invalid KEY=value line: ${line}` };
    map[line.slice(0, eq).trim()] = line.slice(eq + 1);
  }
  return { map, error: null };
};

const startForm = (integration: ToolIntegrationView): ToolFormState => ({
  ...EMPTY_FORM,
  id: integration.id,
  kind: integration.kind,
  label: integration.label,
  ...(integration.kind === 'mcp_server' ? {
    transport: integration.transport ?? 'stdio',
    command: integration.command ?? '',
    args: (integration.args ?? []).join(' '),
    url: integration.url ?? '',
    toolNamePrefix: integration.toolNamePrefix ?? '',
    riskClass: integration.riskClass ?? 'execute',
    timeoutMs: String(integration.timeoutMs ?? 30_000),
  } : {}),
  ...(integration.kind === 'skill' ? {
    name: integration.name ?? '',
    description: integration.description ?? '',
    whenToUse: integration.whenToUse ?? '',
    priority: String(integration.priority ?? 0),
    body: integration.body ?? '',
  } : {}),
  ...(integration.kind === 'command' ? {
    name: integration.name ?? '',
    template: integration.template ?? '',
    scope: integration.scope ?? 'both',
  } : {}),
  ...(integration.kind === 'hook_rule' ? {
    event: integration.event ?? 'before_tool',
    toolPattern: integration.match?.toolPattern ?? '',
    hookRiskClass: (integration.match?.riskClass ?? '') as ToolFormState['hookRiskClass'],
    actionType: integration.action?.type ?? 'log',
    actionReason: integration.action?.reason ?? integration.action?.note ?? '',
  } : {}),
});

export function ToolsSection(): JSX.Element {
  const { t } = useI18n();
  const { integrations, loading, error, saving, create, update, remove, testingId, test, reload } = useToolIntegrations();
  const [form, setForm] = useState<ToolFormState | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [testResults, setTestResults] = useState<Record<string, { ok: boolean; summary: string }>>({});
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [importDir, setImportDir] = useState('');
  const [importing, setImporting] = useState(false);
  const [importNote, setImportNote] = useState<string | null>(null);

  const runImport = async (): Promise<void> => {
    if (importDir.trim().length === 0) return;
    setImporting(true);
    setImportNote(null);
    try {
      const res = await importPluginFromDir(importDir.trim());
      setImportNote(t('tools.importDone', { n: res.integrations.length, name: `${res.plugin.name}@${res.plugin.version}` })
        + (res.warnings.length > 0 ? ` — ${res.warnings.join('；')}` : ''));
      await reload();
    } catch (e) {
      setImportNote(e instanceof Error ? e.message : String(e));
    } finally {
      setImporting(false);
    }
  };

  const submitForm = async (): Promise<void> => {
    if (form === null) return;
    if (form.label.trim().length === 0) {
      setFormError(t('tools.formInvalid'));
      return;
    }
    let payload: Record<string, unknown>;
    switch (form.kind) {
      case 'mcp_server': {
        if (form.transport === 'stdio' && form.command.trim().length === 0) {
          setFormError(t('tools.formInvalid'));
          return;
        }
        if (form.transport === 'http' && form.url.trim().length === 0) {
          setFormError(t('tools.formInvalid'));
          return;
        }
        const env = parseKeyValueLines(form.env);
        const headers = parseKeyValueLines(form.headers);
        if (env.error !== null || headers.error !== null) {
          setFormError(env.error ?? headers.error);
          return;
        }
        const timeout = Number.parseInt(form.timeoutMs, 10);
        payload = {
          kind: 'mcp_server', label: form.label.trim(), transport: form.transport,
          ...(form.transport === 'stdio'
            ? { command: form.command.trim(), args: form.args.trim().length > 0 ? form.args.trim().split(/\s+/) : [] }
            : { url: form.url.trim() }),
          ...(Object.keys(env.map).length > 0 ? { env: env.map } : {}),
          ...(Object.keys(headers.map).length > 0 ? { headers: headers.map } : {}),
          ...(form.toolNamePrefix.trim().length > 0 ? { toolNamePrefix: form.toolNamePrefix.trim() } : {}),
          riskClass: form.riskClass,
          ...(Number.isFinite(timeout) ? { timeoutMs: timeout } : {}),
        };
        break;
      }
      case 'skill': {
        if (form.name.trim().length === 0 || form.description.trim().length === 0 || form.body.trim().length === 0) {
          setFormError(t('tools.formInvalid'));
          return;
        }
        payload = {
          kind: 'skill', label: form.label.trim(), name: form.name.trim(), description: form.description.trim(),
          body: form.body,
          ...(form.whenToUse.trim().length > 0 ? { whenToUse: form.whenToUse.trim() } : {}),
          priority: Number.parseInt(form.priority, 10) || 0,
        };
        break;
      }
      case 'command': {
        if (form.name.trim().length === 0 || form.template.trim().length === 0) {
          setFormError(t('tools.formInvalid'));
          return;
        }
        payload = {
          kind: 'command', label: form.label.trim(), name: form.name.trim(), template: form.template, scope: form.scope,
        };
        break;
      }
      case 'hook_rule': {
        if (form.toolPattern.trim().length === 0 && form.hookRiskClass === '') {
          setFormError(t('tools.formInvalid'));
          return;
        }
        payload = {
          kind: 'hook_rule', label: form.label.trim(), event: form.event,
          match: {
            ...(form.toolPattern.trim().length > 0 ? { toolPattern: form.toolPattern.trim() } : {}),
            ...(form.hookRiskClass !== '' ? { riskClass: form.hookRiskClass } : {}),
          },
          action: form.actionType === 'log'
            ? { type: 'log', ...(form.actionReason.trim().length > 0 ? { note: form.actionReason.trim() } : {}) }
            : { type: form.actionType, ...(form.actionReason.trim().length > 0 ? { reason: form.actionReason.trim() } : {}) },
        };
        break;
      }
    }
    setFormError(null);
    try {
      if (form.id === null) {
        await create(payload);
      } else {
        await update(form.id, payload);
      }
      setForm(null);
    } catch (e) {
      setFormError(e instanceof Error ? e.message : String(e));
    }
  };

  const runTest = async (id: string): Promise<void> => {
    try {
      const record = await test(id);
      setTestResults((prev) => ({ ...prev, [id]: { ok: record.ok, summary: record.summary } }));
    } catch (e) {
      setTestResults((prev) => ({ ...prev, [id]: { ok: false, summary: e instanceof Error ? e.message : String(e) } }));
    }
  };

  const kindBadge = (integration: ToolIntegrationView): JSX.Element => {
    const key: Record<ToolIntegrationKind, DictKey> = {
      mcp_server: 'tools.kindMcp', skill: 'tools.kindSkill', command: 'tools.kindCommand', hook_rule: 'tools.kindHook',
    };
    return <span className="badge">{t(key[integration.kind])}</span>;
  };

  const metaOf = (integration: ToolIntegrationView): string => {
    switch (integration.kind) {
      case 'mcp_server':
        return integration.transport === 'http'
          ? integration.url ?? ''
          : `${integration.command ?? ''} ${(integration.args ?? []).join(' ')}`.trim();
      case 'skill':
        return integration.name ?? '';
      case 'command':
        return `/${integration.name ?? ''}`;
      case 'hook_rule':
        return `${integration.event ?? ''} ${integration.match?.toolPattern ?? integration.match?.riskClass ?? ''}`.trim();
    }
  };

  return (
    <section className="settings-tools" aria-label={t('tools.title')}>
      <h3 className="settings-form-title"><Plug size={13} aria-hidden="true" /> {t('tools.title')}</h3>
      <p className="muted small">{t('tools.hint')}</p>

      {error !== null && <p className="field-error" role="alert">{errorText(error)}</p>}

      {loading ? (
        <p className="muted small">{t('common.loading')}</p>
      ) : (
        <ul className="settings-list">
          {integrations.length === 0 && <li className="muted small">{t('tools.empty')}</li>}
          {integrations.map((integration) => (
            <li key={integration.id} className="settings-item">
              <div className="settings-item-main">
                <span className="settings-item-label">
                  {kindBadge(integration)} {integration.label}
                  {!integration.enabled && <span className="badge muted">{t('tools.disabled')}</span>}
                  {integration.createdBy === 'conversation' && <span className="badge badge--info">{t('tools.fromConversation')}</span>}
                </span>
                <span className="muted small settings-item-meta"><span className="mono">{metaOf(integration)}</span></span>
                {integration.kind === 'mcp_server' && integration.lastTest !== undefined && (
                  <span className={`small ${integration.lastTest.ok ? 'field-ok' : 'field-error'}`} role="status">
                    {integration.lastTest.ok ? t('tools.testOk') : t('tools.testFail')}：{integration.lastTest.summary}
                  </span>
                )}
                {testResults[integration.id] !== undefined && (
                  <span className={`small ${testResults[integration.id]!.ok ? 'field-ok' : 'field-error'}`} role="status">
                    {testResults[integration.id]!.ok ? t('tools.testOk') : t('tools.testFail')}：{testResults[integration.id]!.summary}
                  </span>
                )}
              </div>
              <div className="settings-item-actions">
                <button
                  type="button"
                  className="btn btn--small"
                  disabled={saving}
                  onClick={() => { void update(integration.id, { enabled: !integration.enabled }); }}
                >
                  {integration.enabled ? t('tools.disable') : t('tools.enable')}
                </button>
                {integration.kind === 'mcp_server' && (
                  <button type="button" className="btn btn--small" disabled={saving || testingId === integration.id} onClick={() => { void runTest(integration.id); }}>
                    {testingId === integration.id ? t('settings.testing') : t('settings.test')}
                  </button>
                )}
                <button type="button" className="btn btn--small" disabled={saving} onClick={() => { setFormError(null); setForm(startForm(integration)); }} aria-label={t('settings.edit')}>
                  <Pencil size={12} aria-hidden="true" />
                </button>
                {deletingId === integration.id ? (
                  <>
                    <button type="button" className="btn btn--small btn--danger" disabled={saving} onClick={() => {
                      void remove(integration.id).then(() => setDeletingId(null)).catch(() => setDeletingId(null));
                    }}>
                      {t('settings.deleteConfirm')}
                    </button>
                    <button type="button" className="btn btn--small" onClick={() => setDeletingId(null)}>
                      {t('settings.cancel')}
                    </button>
                  </>
                ) : (
                  <button type="button" className="btn btn--small" disabled={saving} onClick={() => setDeletingId(integration.id)} aria-label={t('settings.delete')}>
                    <Trash2 size={12} aria-hidden="true" />
                  </button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}

      {form !== null ? (
        <form className="settings-form" onSubmit={(e) => { e.preventDefault(); void submitForm(); }} noValidate>
          <h3 className="settings-form-title">{form.id === null ? t('tools.add') : `${t('settings.edit')} — ${form.label}`}</h3>

          <label className="field-label" htmlFor="tool-kind">{t('tools.kind')}</label>
          <select
            id="tool-kind"
            value={form.kind}
            disabled={form.id !== null}
            onChange={(e) => setForm({ ...EMPTY_FORM, kind: e.target.value as FormKind, label: form.label })}
          >
            <option value="mcp_server">{t('tools.kindMcp')}</option>
            <option value="skill">{t('tools.kindSkill')}</option>
            <option value="command">{t('tools.kindCommand')}</option>
            <option value="hook_rule">{t('tools.kindHook')}</option>
          </select>

          <label className="field-label" htmlFor="tool-label">{t('settings.label')}</label>
          <input id="tool-label" type="text" value={form.label} onChange={(e) => setForm({ ...form, label: e.target.value })} />

          {form.kind === 'mcp_server' && (
            <>
              <label className="field-label" htmlFor="tool-transport">{t('tools.transport')}</label>
              <select id="tool-transport" value={form.transport} onChange={(e) => setForm({ ...form, transport: e.target.value as ToolFormState['transport'] })}>
                <option value="stdio">stdio</option>
                <option value="http">HTTP</option>
              </select>

              {form.transport === 'stdio' ? (
                <>
                  <label className="field-label" htmlFor="tool-command">{t('tools.command')}</label>
                  <input id="tool-command" type="text" value={form.command} onChange={(e) => setForm({ ...form, command: e.target.value })} placeholder="npx -y @some/mcp-server" />
                  <label className="field-label" htmlFor="tool-args">{t('tools.args')}</label>
                  <input id="tool-args" type="text" value={form.args} onChange={(e) => setForm({ ...form, args: e.target.value })} placeholder="--port 3000" />
                </>
              ) : (
                <>
                  <label className="field-label" htmlFor="tool-url">{t('tools.url')}</label>
                  <input id="tool-url" type="text" value={form.url} onChange={(e) => setForm({ ...form, url: e.target.value })} placeholder="https://…/mcp" />
                  <label className="field-label" htmlFor="tool-headers">{t('tools.headers')}</label>
                  <textarea id="tool-headers" rows={2} value={form.headers} onChange={(e) => setForm({ ...form, headers: e.target.value })} placeholder={'Authorization=Bearer …'} />
                </>
              )}

              <label className="field-label" htmlFor="tool-env">{t('tools.env')}</label>
              <textarea id="tool-env" rows={2} value={form.env} onChange={(e) => setForm({ ...form, env: e.target.value })} placeholder={'API_KEY=…'} />
              <p className="muted small">{t('tools.envKeepHint')}</p>

              <label className="field-label" htmlFor="tool-risk">{t('tools.riskClass')}</label>
              <select id="tool-risk" value={form.riskClass} onChange={(e) => setForm({ ...form, riskClass: e.target.value as ToolFormState['riskClass'] })}>
                <option value="read">read</option>
                <option value="edit">edit</option>
                <option value="execute">execute</option>
                <option value="destructive">destructive</option>
              </select>
            </>
          )}

          {form.kind === 'skill' && (
            <>
              <label className="field-label" htmlFor="tool-name">{t('tools.name')}</label>
              <input id="tool-name" type="text" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="systematic-review-checklist" />
              <label className="field-label" htmlFor="tool-desc">{t('tools.description')}</label>
              <input id="tool-desc" type="text" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
              <label className="field-label" htmlFor="tool-when">{t('tools.whenToUse')}</label>
              <input id="tool-when" type="text" value={form.whenToUse} onChange={(e) => setForm({ ...form, whenToUse: e.target.value })} />
              <label className="field-label" htmlFor="tool-body">{t('tools.body')}</label>
              <textarea id="tool-body" rows={6} value={form.body} onChange={(e) => setForm({ ...form, body: e.target.value })} />
            </>
          )}

          {form.kind === 'command' && (
            <>
              <label className="field-label" htmlFor="tool-cname">{t('tools.name')}</label>
              <input id="tool-cname" type="text" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="find-gaps" />
              <label className="field-label" htmlFor="tool-scope">{t('tools.scope')}</label>
              <select id="tool-scope" value={form.scope} onChange={(e) => setForm({ ...form, scope: e.target.value as ToolFormState['scope'] })}>
                <option value="both">{t('tools.scopeBoth')}</option>
                <option value="palette">{t('tools.scopePalette')}</option>
                <option value="composer">{t('tools.scopeComposer')}</option>
              </select>
              <label className="field-label" htmlFor="tool-template">{t('tools.template')}</label>
              <textarea id="tool-template" rows={4} value={form.template} onChange={(e) => setForm({ ...form, template: e.target.value })} placeholder={t('tools.templatePlaceholder')} />
            </>
          )}

          {form.kind === 'hook_rule' && (
            <>
              <label className="field-label" htmlFor="tool-event">{t('tools.event')}</label>
              <select id="tool-event" value={form.event} onChange={(e) => setForm({ ...form, event: e.target.value as ToolFormState['event'] })}>
                <option value="before_tool">before_tool</option>
                <option value="after_tool">after_tool</option>
                <option value="turn_end">turn_end</option>
              </select>
              <label className="field-label" htmlFor="tool-pattern">{t('tools.toolPattern')}</label>
              <input id="tool-pattern" type="text" value={form.toolPattern} onChange={(e) => setForm({ ...form, toolPattern: e.target.value })} placeholder="mcp_arxiv_*" />
              <label className="field-label" htmlFor="tool-hookrisk">{t('tools.matchRisk')}</label>
              <select id="tool-hookrisk" value={form.hookRiskClass} onChange={(e) => setForm({ ...form, hookRiskClass: e.target.value as ToolFormState['hookRiskClass'] })}>
                <option value="">—</option>
                <option value="read">read</option>
                <option value="edit">edit</option>
                <option value="execute">execute</option>
                <option value="destructive">destructive</option>
              </select>
              <label className="field-label" htmlFor="tool-action">{t('tools.action')}</label>
              <select id="tool-action" value={form.actionType} onChange={(e) => setForm({ ...form, actionType: e.target.value as ToolFormState['actionType'] })}>
                <option value="log">log</option>
                <option value="require_approval">require_approval</option>
                <option value="block">block</option>
              </select>
              <label className="field-label" htmlFor="tool-reason">{t('tools.actionReason')}</label>
              <input id="tool-reason" type="text" value={form.actionReason} onChange={(e) => setForm({ ...form, actionReason: e.target.value })} />
            </>
          )}

          {formError !== null && <p className="field-error" role="alert">{formError}</p>}

          <div className="settings-form-actions">
            <button type="submit" className="btn btn--primary btn--small" disabled={saving}>
              {saving ? t('settings.saving') : t('settings.save')}
            </button>
            <button type="button" className="btn btn--small" onClick={() => { setForm(null); setFormError(null); }}>
              {t('settings.cancel')}
            </button>
          </div>
        </form>
      ) : (
        <button type="button" className="btn btn--small" disabled={saving} onClick={() => { setFormError(null); setForm(EMPTY_FORM); }}>
          ＋ {t('tools.add')}
        </button>
      )}

      <div className="settings-form-actions settings-plugin-import">
        <PackagePlus size={13} aria-hidden="true" />
        <input
          type="text"
          value={importDir}
          placeholder={t('tools.importDirPlaceholder')}
          aria-label={t('tools.importDir')}
          onChange={(e) => setImportDir(e.target.value)}
          disabled={importing}
        />
        <button type="button" className="btn btn--small" disabled={importing || importDir.trim().length === 0} onClick={() => { void runImport(); }}>
          {importing ? t('settings.saving') : t('tools.import')}
        </button>
      </div>
      <p className="muted small">{t('tools.importHint')}</p>
      {importNote !== null && <p className="small" role="status">{importNote}</p>}
    </section>
  );
}
