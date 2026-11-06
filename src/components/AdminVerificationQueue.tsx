import React, { useCallback, useEffect, useState } from 'react';
import {
  AlertCircle,
  BadgeCheck,
  FileText,
  History,
  Loader2,
  Lock,
  RefreshCw,
  ShieldAlert,
  ShieldCheck,
  X,
} from 'lucide-react';
import { api, messageForError } from '../services/apiService';
import { VerificationQueueItem, VerificationReviewerDetail } from '../types';
import { useApp } from '../context/AppContext';

const statusTone = (status: string): string => {
  switch (status) {
    case 'approved':
      return 'bg-emerald-500/15 border-emerald-500/30 text-emerald-300';
    case 'expired':
    case 'rejected':
      return 'bg-[#FF2E63]/15 border-[#FF2E63]/30 text-[#FF8FA8]';
    case 'under_review':
      return 'bg-sky-500/10 border-sky-500/30 text-sky-300';
    case 'pending_review':
    case 'resubmission_required':
      return 'bg-amber-500/10 border-amber-500/30 text-amber-300';
    default:
      return 'bg-slate-800 border-white/10 text-slate-300';
  }
};

const label = (status: string): string => status.replace(/_/g, ' ');

type IdentityDecision = 'start_review' | 'approve' | 'reject' | 'request_resubmission';
type ProfessionalDecision = IdentityDecision | 'mark_expired';

/**
 * Verification review queue (Increment D).
 *
 * Rendered inside the existing admin agent surface. It is capability-gated: an
 * administrator without `verificationReviewer` cannot open it, and the actual
 * files/full number need `identityDocumentAccess` on top (granted from the
 * server console only).
 *
 * The screen deliberately keeps identity and professional authorisation apart:
 * approving one never touches the other, and nothing here verifies a property.
 */
export const AdminVerificationQueue: React.FC = () => {
  const { currentUser, refreshSession, showSuccessToast, showErrorToast } = useApp();
  const capabilities = currentUser?.capabilities;

  const [queue, setQueue] = useState<VerificationQueueItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [detail, setDetail] = useState<VerificationReviewerDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState('');

  const load = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const result = await api.listVerifications();
      setQueue(result.verifications);
    } catch (err) {
      setError(messageForError(err));
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (capabilities?.verificationReviewer) {
      void load();
    } else {
      setIsLoading(false);
    }
  }, [capabilities?.verificationReviewer, load]);

  const open = async (userId: string) => {
    setSelected(userId);
    setDetail(null);
    setDetailLoading(true);
    setNote('');
    try {
      const result = await api.getVerificationDetail(userId);
      setDetail(result.verification);
    } catch (err) {
      showErrorToast('Could not open the verification', messageForError(err));
      setSelected(null);
    } finally {
      setDetailLoading(false);
    }
  };

  const decide = async (scope: 'identity' | 'professional', decision: IdentityDecision | ProfessionalDecision) => {
    if (!selected) return;
    if (['reject', 'request_resubmission', 'mark_expired'].includes(decision) && note.trim() === '') {
      showErrorToast('A reason is required', 'Write why, so the agent knows what to fix.');
      return;
    }

    setBusy(true);
    try {
      if (scope === 'identity') {
        await api.decideIdentityVerification(selected, { decision: decision as IdentityDecision, note: note.trim() });
      } else {
        await api.decideProfessionalAuthorisation(selected, {
          decision: decision as ProfessionalDecision,
          note: note.trim(),
        });
      }
      showSuccessToast('Decision recorded', 'The decision is in the audit log and cannot be rewritten.');
      setNote('');
      const refreshed = await api.getVerificationDetail(selected);
      setDetail(refreshed.verification);
      await load();
    } catch (err) {
      showErrorToast('Decision not recorded', messageForError(err));
    } finally {
      setBusy(false);
    }
  };

  // Task 03: record one document's outcome. This never decides the overall
  // verification; it records which certificate is fine and which is not.
  const reviewDocument = async (documentId: string, decision: 'accept' | 'reject') => {
    if (!selected) return;
    if (decision === 'reject' && note.trim() === '') {
      showErrorToast('A reason is required', 'Say what is wrong with this document.');
      return;
    }
    setBusy(true);
    try {
      await api.reviewVerificationDocument(documentId, decision, note.trim());
      showSuccessToast('Document recorded', 'The document outcome is saved on the record.');
      setNote('');
      const refreshed = await api.getVerificationDetail(selected);
      setDetail(refreshed.verification);
    } catch (err) {
      showErrorToast('Document not recorded', messageForError(err));
    } finally {
      setBusy(false);
    }
  };

  if (!capabilities?.verificationReviewer) {
    return (
      <div className="bg-[#252A34]/70 border border-white/10 rounded-3xl p-6 space-y-3">
        <h2 className="text-sm font-bold text-white flex items-center gap-2">
          <Lock className="w-4 h-4 text-amber-300" /> Verification review
        </h2>
        <p className="text-xs text-slate-400 leading-relaxed max-w-2xl">
          Reading identity documents is not an administrator default. This account does not have the
          verification-reviewer capability, so the queue, the masked identity data and the documents stay closed.
          A server administrator grants it with <code className="text-[#08D9D6]">php php-backend/grant_reviewer.php</code>.
        </p>
        <p className="text-[11px] text-slate-500">
          Capabilities are checked on every request, not just hidden in this screen.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="bg-[#252A34]/70 border border-white/10 rounded-3xl p-5 space-y-3">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-sm font-bold text-white flex items-center gap-2">
              <ShieldCheck className="w-4 h-4 text-[#08D9D6]" /> Verification review queue
            </h2>
            <p className="text-[11px] text-slate-400 mt-1">
              {queue.length} subject{queue.length === 1 ? '' : 's'} · identity and professional authorisation are
              decided separately
            </p>
          </div>
          <button
            type="button"
            onClick={async () => {
              // A capability could have been granted from the server console since
              // this tab was opened, so re-read the session before reloading.
              await refreshSession();
              await load();
            }}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-800 text-slate-300 text-[11px] font-bold hover:bg-slate-700"
          >
            <RefreshCw className="w-3.5 h-3.5" /> Refresh
          </button>
        </div>

        <p className="text-[11px] text-slate-500 leading-snug flex items-start gap-1.5">
          <ShieldAlert className="w-3.5 h-3.5 mt-0.5 shrink-0 text-amber-300" />
          {capabilities?.identityDocumentAccess
            ? 'You hold identity-document access: opening a file is logged in the audit trail.'
            : 'You can review and decide, but not open the uploaded files or see the full document number.'}{' '}
          There is no external registry lookup — a submitted licence number is evidence for you, not a verified licence.
        </p>
      </div>

      {error && (
        <div role="alert" className="p-3 rounded-xl bg-[#FF2E63]/15 border border-[#FF2E63]/30 text-[#FF8FA8] text-xs flex items-start gap-2">
          <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
          <span className="flex-1">{error}</span>
        </div>
      )}

      {isLoading ? (
        <p className="text-xs text-slate-400">Loading verification queue…</p>
      ) : queue.length === 0 ? (
        <div className="bg-[#252A34]/70 border border-white/10 rounded-3xl p-5">
          <p className="text-xs text-slate-400">No agent or landlord has submitted verification yet.</p>
        </div>
      ) : (
        <ul className="space-y-3">
          {queue.map((item) => (
            <li key={item.userId} className="bg-[#252A34]/70 border border-white/10 rounded-3xl p-5 space-y-3">
              <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
                <div className="space-y-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h3 className="text-sm font-bold text-white">{item.name}</h3>
                    <span className="px-2 py-0.5 rounded-md text-[10px] font-bold uppercase bg-slate-800 border border-white/10 text-slate-300">
                      {item.role}
                    </span>
                    {item.agencyName && <span className="text-[11px] text-slate-400">· {item.agencyName}</span>}
                  </div>
                  <p className="text-[11px] text-slate-400">
                    {item.email}
                    {item.phone ? ` · ${item.phone}` : ''}
                  </p>
                  <div className="flex flex-wrap items-center gap-2 pt-1">
                    <span className={`px-2 py-0.5 rounded-md border text-[10px] font-bold ${statusTone(item.identity.status)}`}>
                      Identity: {label(item.identity.status)}
                    </span>
                    <span className={`px-2 py-0.5 rounded-md border text-[10px] font-bold ${statusTone(item.professional.status)}`}>
                      Authorisation: {label(item.professional.status)}
                    </span>
                    <span className="text-[10px] text-slate-500">
                      {item.identity.documentCount} identity file(s) · {item.professional.documentCount} licence file(s)
                    </span>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => void open(item.userId)}
                  className="px-3 py-1.5 rounded-xl bg-[#08D9D6] text-[#252A34] text-[11px] font-extrabold shrink-0"
                >
                  Review
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}

      {/* ------------------------------- Drawer ------------------------------- */}
      {selected && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm p-2 sm:p-6 overflow-y-auto">
          <div className="max-w-3xl mx-auto bg-[#252A34] border border-white/10 rounded-3xl p-5 sm:p-6 space-y-5 my-6">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 className="text-lg font-black text-white">
                  {detail?.subject.name ?? 'Loading verification…'}
                </h2>
                {detail && (
                  <p className="text-[11px] text-slate-400">
                    {detail.subject.email} · {detail.subject.role}
                    {detail.subject.phone ? ` · ${detail.subject.phone}` : ''}
                  </p>
                )}
              </div>
              <button
                type="button"
                onClick={() => {
                  setSelected(null);
                  setDetail(null);
                }}
                className="p-1.5 rounded-lg bg-slate-800 text-slate-300 hover:bg-slate-700"
                aria-label="Close"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {detailLoading && (
              <p className="text-xs text-slate-400 flex items-center gap-2">
                <Loader2 className="w-4 h-4 animate-spin" /> Loading…
              </p>
            )}

            {detail && (
              <>
                {!detail.capabilities.identityDocumentAccess && (
                  <p className="text-[11px] text-amber-300 bg-amber-500/10 border border-amber-500/30 rounded-xl p-3">
                    <Lock className="w-3.5 h-3.5 inline mr-1" />
                    Document access is not granted to this account, so no files or full numbers are shown.
                  </p>
                )}

                {/* Identity */}
                <section className="space-y-3 border border-white/10 rounded-2xl p-4">
                  <div className="flex items-center justify-between gap-2">
                    <h3 className="text-xs font-bold text-white flex items-center gap-2">
                      <BadgeCheck className="w-4 h-4 text-[#08D9D6]" /> Identity
                    </h3>
                    <span className={`px-2 py-0.5 rounded-md border text-[10px] font-bold ${statusTone(detail.identity.status)}`}>
                      {label(detail.identity.status)}
                    </span>
                  </div>

                  <dl className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-[11px] text-slate-400">
                    <div>
                      <dt className="font-semibold text-slate-300">Legal name on document</dt>
                      <dd>{detail.identity.legalName || '—'}</dd>
                    </div>
                    <div>
                      <dt className="font-semibold text-slate-300">Document number</dt>
                      <dd>
                        {detail.identity.documentNumber ?? detail.identity.documentNumberMasked ?? '—'}
                        {detail.identity.documentNumber && (
                          <span className="text-[10px] text-amber-300 ml-2">full value · your access is logged</span>
                        )}
                      </dd>
                    </div>
                    <div>
                      <dt className="font-semibold text-slate-300">Document type</dt>
                      <dd>{detail.identity.documentTypeLabel}</dd>
                    </div>
                    <div>
                      <dt className="font-semibold text-slate-300">Submitted</dt>
                      <dd>{detail.identity.submittedAt ? new Date(detail.identity.submittedAt).toLocaleString() : '—'}</dd>
                    </div>
                  </dl>

                  {detail.identity.documents.length > 0 ? (
                    <ul className="space-y-1.5">
                      {detail.identity.documents.map((doc) => (
                        <li key={doc.id} className="flex flex-wrap items-center justify-between gap-2 text-[11px] bg-slate-900/50 border border-white/10 rounded-lg px-3 py-2">
                          <span className="flex items-center gap-2 text-slate-300">
                            <FileText className="w-3.5 h-3.5 text-slate-400" /> {doc.kindLabel}
                            <span className={`px-1.5 py-0.5 rounded border ${statusTone(doc.reviewStatus === 'accepted' ? 'approved' : doc.reviewStatus === 'rejected' ? 'rejected' : 'pending_review')}`}>
                              {doc.reviewStatus === 'accepted' ? 'accepted' : doc.reviewStatus === 'rejected' ? 'rejected' : 'not reviewed'}
                            </span>
                          </span>
                          <span className="flex items-center gap-2">
                            {doc.downloadUrl ? (
                              <a href={doc.downloadUrl} target="_blank" rel="noopener noreferrer" className="text-[#08D9D6] font-bold">
                                Open document
                              </a>
                            ) : (
                              <span className="text-slate-500">Access restricted</span>
                            )}
                            {doc.downloadUrl && (
                              <>
                                <button
                                  type="button"
                                  disabled={busy}
                                  onClick={() => void reviewDocument(doc.id, 'accept')}
                                  className="px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-200 font-bold disabled:opacity-50"
                                >
                                  Accept
                                </button>
                                <button
                                  type="button"
                                  disabled={busy}
                                  onClick={() => void reviewDocument(doc.id, 'reject')}
                                  className="px-2 py-0.5 rounded bg-[#FF2E63]/20 text-[#FF8FA8] font-bold disabled:opacity-50"
                                >
                                  Reject
                                </button>
                              </>
                            )}
                          </span>
                          {doc.reviewNote && <span className="w-full text-[10px] text-slate-500">{doc.reviewNote}</span>}
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="text-[11px] text-slate-500">No identity documents on file.</p>
                  )}

                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => void decide('identity', 'start_review')}
                      className="px-3 py-1.5 rounded-xl bg-slate-800 text-slate-200 text-[11px] font-bold disabled:opacity-50"
                    >
                      Mark under review
                    </button>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => void decide('identity', 'approve')}
                      className="px-3 py-1.5 rounded-xl bg-[#08D9D6] text-[#252A34] text-[11px] font-extrabold disabled:opacity-50"
                    >
                      Approve identity
                    </button>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => void decide('identity', 'request_resubmission')}
                      className="px-3 py-1.5 rounded-xl bg-amber-500/15 border border-amber-500/30 text-amber-300 text-[11px] font-bold disabled:opacity-50"
                    >
                      Request resubmission
                    </button>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => void decide('identity', 'reject')}
                      className="px-3 py-1.5 rounded-xl bg-[#FF2E63]/15 border border-[#FF2E63]/30 text-[#FF8FA8] text-[11px] font-bold disabled:opacity-50"
                    >
                      Reject identity
                    </button>
                  </div>
                </section>

                {/* Professional authorisation */}
                {detail.subject.role === 'agent' && (
                  <section className="space-y-3 border border-white/10 rounded-2xl p-4">
                    <div className="flex items-center justify-between gap-2">
                      <h3 className="text-xs font-bold text-white flex items-center gap-2">
                        <FileText className="w-4 h-4 text-[#08D9D6]" /> Professional authorisation
                      </h3>
                      <span className={`px-2 py-0.5 rounded-md border text-[10px] font-bold ${statusTone(detail.professional.status)}`}>
                        {label(detail.professional.status)}
                      </span>
                    </div>

                    <dl className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-[11px] text-slate-400">
                      <div>
                        <dt className="font-semibold text-slate-300">Licence number</dt>
                        <dd>{detail.professional.licenceNumber ?? detail.professional.licenceNumberMasked ?? '—'}</dd>
                      </div>
                      <div>
                        <dt className="font-semibold text-slate-300">Issuing authority</dt>
                        <dd>{detail.professional.issuingAuthority || '—'}</dd>
                      </div>
                      <div>
                        <dt className="font-semibold text-slate-300">Category</dt>
                        <dd>{detail.professional.licenceCategory || '—'}</dd>
                      </div>
                      <div>
                        <dt className="font-semibold text-slate-300">Expiry</dt>
                        <dd>{detail.professional.expiryDate || 'Not stated'}</dd>
                      </div>
                    </dl>

                    <p className="text-[10px] text-slate-500">
                      Registry check: {detail.professional.registryChecked ? 'recorded' : 'none — no external registry integration exists'}.
                    </p>

                    {detail.professional.documents.length > 0 && (
                      <ul className="space-y-1.5">
                        {detail.professional.documents.map((doc) => (
                          <li key={doc.id} className="flex flex-wrap items-center justify-between gap-2 text-[11px] bg-slate-900/50 border border-white/10 rounded-lg px-3 py-2">
                            <span className="flex items-center gap-2 text-slate-300">
                              <FileText className="w-3.5 h-3.5 text-slate-400" /> {doc.kindLabel}
                              <span className={`px-1.5 py-0.5 rounded border ${statusTone(doc.reviewStatus === 'accepted' ? 'approved' : doc.reviewStatus === 'rejected' ? 'rejected' : 'pending_review')}`}>
                                {doc.reviewStatus === 'accepted' ? 'accepted' : doc.reviewStatus === 'rejected' ? 'rejected' : 'not reviewed'}
                              </span>
                            </span>
                            <span className="flex items-center gap-2">
                              {doc.downloadUrl ? (
                                <a href={doc.downloadUrl} target="_blank" rel="noopener noreferrer" className="text-[#08D9D6] font-bold">
                                  Open document
                                </a>
                              ) : (
                                <span className="text-slate-500">Access restricted</span>
                              )}
                              {doc.downloadUrl && (
                                <>
                                  <button
                                    type="button"
                                    disabled={busy}
                                    onClick={() => void reviewDocument(doc.id, 'accept')}
                                    className="px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-200 font-bold disabled:opacity-50"
                                  >
                                    Accept
                                  </button>
                                  <button
                                    type="button"
                                    disabled={busy}
                                    onClick={() => void reviewDocument(doc.id, 'reject')}
                                    className="px-2 py-0.5 rounded bg-[#FF2E63]/20 text-[#FF8FA8] font-bold disabled:opacity-50"
                                  >
                                    Reject
                                  </button>
                                </>
                              )}
                            </span>
                            {doc.reviewNote && <span className="w-full text-[10px] text-slate-500">{doc.reviewNote}</span>}
                          </li>
                        ))}
                      </ul>
                    )}

                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => void decide('professional', 'start_review')}
                        className="px-3 py-1.5 rounded-xl bg-slate-800 text-slate-200 text-[11px] font-bold disabled:opacity-50"
                      >
                        Mark under review
                      </button>
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => void decide('professional', 'approve')}
                        className="px-3 py-1.5 rounded-xl bg-[#08D9D6] text-[#252A34] text-[11px] font-extrabold disabled:opacity-50"
                      >
                        Approve authorisation
                      </button>
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => void decide('professional', 'request_resubmission')}
                        className="px-3 py-1.5 rounded-xl bg-amber-500/15 border border-amber-500/30 text-amber-300 text-[11px] font-bold disabled:opacity-50"
                      >
                        Request resubmission
                      </button>
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => void decide('professional', 'reject')}
                        className="px-3 py-1.5 rounded-xl bg-[#FF2E63]/15 border border-[#FF2E63]/30 text-[#FF8FA8] text-[11px] font-bold disabled:opacity-50"
                      >
                        Reject
                      </button>
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => void decide('professional', 'mark_expired')}
                        className="px-3 py-1.5 rounded-xl bg-slate-800 text-amber-300 text-[11px] font-bold disabled:opacity-50"
                      >
                        Mark expired
                      </button>
                    </div>
                  </section>
                )}

                <div className="space-y-2">
                  <label className="block text-[11px] font-semibold text-slate-300">
                    Reviewer note (required for reject, resubmission and expiry)
                  </label>
                  <textarea
                    value={note}
                    onChange={(event) => setNote(event.target.value)}
                    rows={2}
                    placeholder="What did you check, and what does the agent need to do?"
                    className="w-full bg-slate-900 border border-white/10 rounded-xl px-3 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-[#08D9D6]"
                  />
                  <p className="text-[10px] text-slate-500">
                    Notes are visible to the agent and kept in an append-only history — earlier decisions cannot be edited away.
                  </p>
                </div>

                <section className="space-y-2">
                  <h3 className="text-xs font-bold text-white flex items-center gap-2">
                    <History className="w-4 h-4 text-slate-400" /> Decision history
                  </h3>
                  {detail.history.length === 0 ? (
                    <p className="text-[11px] text-slate-500">No decisions recorded yet.</p>
                  ) : (
                    <ul className="space-y-1.5">
                      {detail.history.map((entry) => (
                        <li key={entry.id} className="text-[11px] bg-slate-900/50 border border-white/10 rounded-lg px-3 py-2 text-slate-400">
                          <span className="font-bold text-slate-200">{entry.scope}</span> · {label(entry.fromStatus)} →{' '}
                          <span className="font-bold text-slate-200">{label(entry.toStatus)}</span>
                          <span className="text-slate-500"> · {entry.reviewerName || 'reviewer'} · {new Date(entry.decidedAt).toLocaleString()}</span>
                          {entry.note && <p className="mt-1 text-slate-300">{entry.note}</p>}
                        </li>
                      ))}
                    </ul>
                  )}
                </section>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
