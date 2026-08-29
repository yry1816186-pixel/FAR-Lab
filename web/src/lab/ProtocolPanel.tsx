import { useState } from 'react';
import { ApiError } from '../api/client';
import { useI18n } from '../i18n/LanguageContext';
import type { DictKey } from '../i18n/dict';
import {
  coerceMeasurementInput,
  recordProtocolEvent,
  type ProtocolStateView,
  type ProtocolStepView,
  type RecordProtocolEventInput,
} from '../api/protocol';

/**
 * Protocol band (web slice 2, 2026-08-29) — the researcher's plane for
 * paradigm-honest execution: the frozen preregistration and the
 * human-attested ledger of what really happened. Every mutation is ONE
 * human-attested record through the deterministic server state machine
 * (ethics gate fail-closed, dependency order, value typing, QC); this
 * component never advances, infers or completes execution on its own.
 */
export function ProtocolPanel({ runId, state, fetchError, onMutated }: {
  runId: string;
  state: ProtocolStateView | null;
  fetchError: ApiError | null;
  onMutated: () => void;
}): JSX.Element {
  const { t } = useI18n();

  // Honest failure surface: a non-404 fetch error must not vanish the band.
  if (state === null) {
    return (
      <section className="map-protocol-band">
        <h2>{t('map.protocol.title')}</h2>
        <p className="map-protocol-error">
          {t('map.protocol.fetchError')}{fetchError !== null ? `：${fetchError.message}` : ''}
        </p>
      </section>
    );
  }
  return <ProtocolBand runId={runId} state={state} onMutated={onMutated} />;
}

function ProtocolBand({ runId, state, onMutated }: {
  runId: string;
  state: ProtocolStateView;
  onMutated: () => void;
}): JSX.Element {
  const { t } = useI18n();
  const { protocol, execution, stepStates, collectionForm, outcomeFeedbackPublished } = state;

  const [actor, setActor] = useState('');
  const [busy, setBusy] = useState(false);
  const [opError, setOpError] = useState<string | null>(null);
  const [apBody, setApBody] = useState(protocol.ethics.approvalBody ?? '');
  const [apId, setApId] = useState('');
  const [apBy, setApBy] = useState('');
  const [mVar, setMVar] = useState(protocol.variables[0]?.name ?? '');
  const [mTimepoint, setMTimepoint] = useState(protocol.variables[0]?.timepoints[0] ?? '');
  const [mRaw, setMRaw] = useState('');
  const [mLocalError, setMLocalError] = useState<string | null>(null);
  const [devWhat, setDevWhat] = useState('');
  const [devWhy, setDevWhy] = useState('');
  const [devConsequence, setDevConsequence] = useState('');
  const [abortArmed, setAbortArmed] = useState(false);

  const terminal = execution !== null && (execution.status === 'completed' || execution.status === 'aborted');
  const ethicsOpen = execution !== null && execution.status === 'awaiting_approval';
  const paused = execution?.status === 'paused';
  const actorReady = actor.trim().length >= 2;
  const currentVariable = protocol.variables.find((v) => v.name === mVar) ?? null;
  const locked = busy || terminal || ethicsOpen || paused;

  const depsDone = (s: ProtocolStepView): boolean => s.dependsOn.every((d) => stepStates[d] === 'done');

  // One record per interaction; server 409/400 messages are the deterministic
  // machine's researcher-language verdicts — shown verbatim, never swallowed.
  const op = async (body: Omit<RecordProtocolEventInput, 'actor'>): Promise<void> => {
    if (!actorReady) {
      setOpError(t('map.protocol.actorPlaceholder'));
      return;
    }
    setBusy(true);
    setOpError(null);
    try {
      await recordProtocolEvent(runId, { ...body, actor: actor.trim() });
      onMutated();
    } catch (e) {
      setOpError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const submitMeasurement = async (): Promise<void> => {
    if (currentVariable === null) return;
    const coerced = coerceMeasurementInput(currentVariable.valueType, mRaw);
    if (!coerced.ok) {
      setMLocalError(t(coerced.error === 'empty' ? 'map.protocol.measureInputEmpty' : 'map.protocol.measureInputNotNumeric'));
      return;
    }
    setMLocalError(null);
    await op({
      kind: 'measurement',
      measurement: {
        variableName: mVar,
        ...(mTimepoint.length > 0 ? { timepoint: mTimepoint } : {}),
        value: coerced.value,
      },
    });
    setMRaw('');
  };

  const submitApproval = async (): Promise<void> => {
    await op({
      kind: 'approval',
      approval: { approvalBody: apBody.trim(), approvalId: apId.trim(), approvedBy: apBy.trim() },
    });
  };

  const submitDeviation = async (): Promise<void> => {
    await op({
      kind: 'deviation',
      deviation: { what: devWhat.trim(), why: devWhy.trim(), consequence: devConsequence.trim() },
    });
    setDevWhat('');
    setDevWhy('');
    setDevConsequence('');
  };

  const statusLabel = execution !== null ? t(`map.protocol.status.${execution.status}` as DictKey) : '';

  return (
    <section className="map-protocol-band">
      <header>
        <h2>{t('map.protocol.title')}</h2>
        {execution !== null && <span className="map-protocol-chip">{statusLabel}</span>}
        <span className="map-protocol-chip">{t(`map.protocol.paradigm.${protocol.paradigm}` as DictKey)}</span>
        <span className="map-protocol-chip" title={protocol.planHash}>
          {t('map.protocol.planFrozen', { hash: protocol.planHash.slice(0, 8) })}
        </span>
      </header>
      <p className="map-protocol-honesty">{t('map.protocol.honesty')}</p>
      {opError !== null && <p className="map-protocol-error">{opError}</p>}

      <dl className="map-protocol-grid">
        <div><dt>{t('map.protocol.objective')}</dt><dd>{protocol.objective}</dd></div>
        <div><dt>{t('map.protocol.setting')}</dt><dd>{protocol.setting}</dd></div>
        <div>
          <dt>{t('map.protocol.arms')}</dt>
          <dd>{protocol.arms.map((a) => `${a.label}${a.isControl ? `（${t('map.protocol.armControl')}）` : ''}`).join(' · ')}</dd>
        </div>
        <div>
          <dt>{t('map.protocol.sampling')}</dt>
          <dd>{t('map.protocol.samplingDetail', { n: protocol.sampling.plannedN, unit: protocol.sampling.unitLabel, blinding: protocol.sampling.blinding })}</dd>
        </div>
        <div>
          <dt>{t('map.protocol.allocation').split('（')[0]}</dt>
          <dd>
            {protocol.allocation.scheme === 'none'
              ? t('map.protocol.allocationNone', { why: protocol.allocation.rationale })
              : `${t('map.protocol.allocation', { seed: protocol.allocation.seed })} · ${protocol.allocation.sequence.slice(0, 8).map((a) => `${a.unitIndex + 1}→${a.arm}`).join(' ')}${protocol.allocation.sequence.length > 8 ? ' …' : ''}`}
          </dd>
        </div>
        <div>
          <dt>{t('map.protocol.ethics')}</dt>
          <dd>
            {protocol.ethics.consentRequired && t('map.protocol.ethicsConsent')}
            {protocol.ethics.requiresApproval && protocol.ethics.approvalBody !== undefined && ` · ${t('map.protocol.ethicsApprovalBody')}：${protocol.ethics.approvalBody}`}
          </dd>
        </div>
      </dl>

      {protocol.draftNotes.length > 0 && (
        <details>
          <summary className="map-protocol-note">{t('map.protocol.draftNotes')}（{protocol.draftNotes.length}）</summary>
          <ul>
            {protocol.draftNotes.map((n) => (<li key={n} className="map-protocol-note">{n}</li>))}
          </ul>
        </details>
      )}

      {/* Ethics gate: fail-closed until the approval record lands. */}
      {ethicsOpen && (
        <div className="map-protocol-form">
          <p className="map-protocol-note">{t('map.protocol.ethicsPending')}</p>
          <label>{t('map.protocol.approvalBodyLabel')}<input value={apBody} onChange={(e) => setApBody(e.target.value)} /></label>
          <label>{t('map.protocol.approvalIdLabel')}<input value={apId} onChange={(e) => setApId(e.target.value)} /></label>
          <label>{t('map.protocol.approvedByLabel')}<input value={apBy} onChange={(e) => setApBy(e.target.value)} /></label>
          <button
            className="map-protocol-btn"
            disabled={busy}
            onClick={() => { void submitApproval(); }}
          >
            {t('map.protocol.approveSubmit')}
          </button>
        </div>
      )}
      {execution !== null && execution.approvals.length > 0 && execution.approvals[0] !== undefined && (
        <p className="map-protocol-note">
          {t('map.protocol.approvedOn', { body: execution.approvals[0].approvalBody, id: execution.approvals[0].approvalId })}
        </p>
      )}

      {!terminal && (
        <div className="map-protocol-form">
          <label>{t('map.protocol.actor')}<input value={actor} placeholder={t('map.protocol.actorPlaceholder')} onChange={(e) => setActor(e.target.value)} /></label>
        </div>
      )}

      <h3>{t('map.protocol.steps')}</h3>
      <ul className="map-protocol-steps">
        {protocol.steps.map((s) => {
          const st = stepStates[s.id] ?? 'pending';
          return (
            <li key={s.id} className={`map-protocol-step is-${st}`}>
              <div className="map-protocol-step-head">
                <strong>{s.id}</strong>
                <span>{s.title}</span>
                <span className="map-protocol-chip">{t(`map.protocol.confirm.${s.confirmation}` as DictKey)}</span>
                <span className="map-protocol-meta">{t('map.protocol.stepDuration', { value: s.duration.value, unit: s.duration.unit })}</span>
              </div>
              <p className="map-protocol-step-action">{s.action}</p>
              <p className="map-protocol-meta">
                {s.dependsOn.length > 0 && `${t('map.protocol.stepDeps', { deps: s.dependsOn.join(', ') })} · `}
                {s.safetyNote !== undefined && `⚠ ${s.safetyNote}`}
              </p>
              {!terminal && (
                <div className="map-protocol-actions">
                  <button
                    className="map-protocol-btn"
                    disabled={locked || st !== 'pending' || !depsDone(s)}
                    onClick={() => { void op({ kind: 'step_started', stepId: s.id }); }}
                  >
                    {t('map.protocol.stepStart')}
                  </button>
                  <button
                    className="map-protocol-btn"
                    disabled={locked || st !== 'in_progress'}
                    onClick={() => { void op({ kind: 'step_completed', stepId: s.id }); }}
                  >
                    {t('map.protocol.stepComplete')}
                  </button>
                </div>
              )}
            </li>
          );
        })}
      </ul>

      <h3>{t('map.protocol.measures')}</h3>
      {execution === null || execution.measurements.length === 0 ? (
        <p className="map-protocol-note">{t('map.protocol.measureEmpty')}</p>
      ) : (
        <table className="map-protocol-table">
          <thead>
            <tr>
              <th>{t('map.protocol.measureVar')}</th>
              <th>{t('map.protocol.measureValue')}</th>
              <th>{t('map.protocol.measureTimepoint')}</th>
              <th>QC</th>
            </tr>
          </thead>
          <tbody>
            {execution.measurements.map((m, i) => (
              <tr key={`${m.at}-${i}`}>
                <td>{m.variableName}</td>
                <td>{String(m.value)}</td>
                <td>{m.timepoint ?? '—'}</td>
                <td>
                  {m.qcPassed
                    ? '✓'
                    : <span className="map-protocol-qcfail" title={m.qcDetail ?? undefined}>{t('map.protocol.measureQcFail')}</span>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <details>
        <summary className="map-protocol-note">{t('map.protocol.collectionForm')}（{collectionForm.fields.length}）</summary>
        <ul>
          {collectionForm.fields.map((f) => (
            <li key={f.variableName} className="map-protocol-note">
              {f.variableName}{f.unit !== undefined ? ` [${f.unit}]` : ''} · {f.role} · {f.valueType} · QC: {f.qcSummary} · {f.timepoints.join(' / ')}
            </li>
          ))}
        </ul>
      </details>

      {!terminal && (
        <div className="map-protocol-form">
          <label>
            {t('map.protocol.measureVar')}
            <select
              value={mVar}
              onChange={(e) => {
                const v = e.target.value;
                setMVar(v);
                setMTimepoint(protocol.variables.find((x) => x.name === v)?.timepoints[0] ?? '');
              }}
            >
              {protocol.variables.map((v) => (
                <option key={v.name} value={v.name}>{v.name}{v.unit !== undefined ? ` (${v.unit})` : ''}</option>
              ))}
            </select>
          </label>
          {currentVariable !== null && currentVariable.timepoints.length > 0 && (
            <label>
              {t('map.protocol.measureTimepoint')}
              <select value={mTimepoint} onChange={(e) => setMTimepoint(e.target.value)}>
                {currentVariable.timepoints.map((tp) => (<option key={tp} value={tp}>{tp}</option>))}
              </select>
            </label>
          )}
          <label>
            {t('map.protocol.measureValue')}
            <input
              value={mRaw}
              inputMode={currentVariable?.valueType === 'numeric' ? 'decimal' : 'text'}
              onChange={(e) => setMRaw(e.target.value)}
            />
          </label>
          {mLocalError !== null && <p className="map-protocol-error">{mLocalError}</p>}
          <button className="map-protocol-btn" disabled={locked} onClick={() => { void submitMeasurement(); }}>
            {t('map.protocol.measureSubmit')}
          </button>
        </div>
      )}

      <h3>{t('map.protocol.deviations')}</h3>
      {execution !== null && execution.deviations.length > 0 && (
        <ul>
          {execution.deviations.map((d) => (
            <li key={d.id} className="map-protocol-note">{d.at.slice(0, 10)} · {d.what} — {d.why} → {d.consequence}</li>
          ))}
        </ul>
      )}
      {!terminal && (
        <div className="map-protocol-form">
          <label>{t('map.protocol.devWhat')}<textarea rows={2} value={devWhat} onChange={(e) => setDevWhat(e.target.value)} /></label>
          <label>{t('map.protocol.devWhy')}<textarea rows={2} value={devWhy} onChange={(e) => setDevWhy(e.target.value)} /></label>
          <label>{t('map.protocol.devConsequence')}<textarea rows={2} value={devConsequence} onChange={(e) => setDevConsequence(e.target.value)} /></label>
          <button className="map-protocol-btn" disabled={busy} onClick={() => { void submitDeviation(); }}>
            {t('map.protocol.devSubmit')}
          </button>
        </div>
      )}

      {execution !== null && !terminal && (
        <div className="map-protocol-actions">
          {paused
            ? <button className="map-protocol-btn" disabled={busy} onClick={() => { void op({ kind: 'unblock' }); }}>{t('map.protocol.unblock')}</button>
            : <button className="map-protocol-btn" disabled={busy} onClick={() => { void op({ kind: 'block' }); }}>{t('map.protocol.block')}</button>}
          {abortArmed
            ? (
              <button
                className="map-protocol-btn is-danger"
                disabled={busy}
                onClick={() => { setAbortArmed(false); void op({ kind: 'abort' }); }}
              >
                {t('map.protocol.abortConfirm')}
              </button>
            )
            : <button className="map-protocol-btn is-danger" disabled={busy} onClick={() => setAbortArmed(true)}>{t('map.protocol.abort')}</button>}
        </div>
      )}

      {terminal && (
        <p className="map-protocol-note">
          {t('map.protocol.terminalNote', { status: statusLabel })}
          {outcomeFeedbackPublished && ` · ${t('map.protocol.outcomePublished')}`}
        </p>
      )}
    </section>
  );
}
