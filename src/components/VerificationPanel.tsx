import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  AlertTriangle,
  BadgeCheck,
  Clock3,
  Download,
  FileText,
  Lock,
  ShieldAlert,
  Trash2,
  Upload,
} from 'lucide-react';
import { api, messageForError } from '../services/apiService';
import {
  IdentityVerificationStatus,
  ProfessionalAuthorisationStatus,
  VerificationDocument,
  VerificationSummary,
} from '../types';

const IDENTITY_STATUS_COPY: Record<IdentityVerificationStatus, { label: string; tone: string }> = {
  not_submitted: { label: 'Not submitted', tone: 'slate' },
  pending_review: { label: 'Pending review', tone: 'amber' },
  under_review: { label: 'Under review', tone: 'sky' },
  approved: { label: 'Approved', tone: 'emerald' },
  rejected: { label: 'Rejected', tone: 'rose' },
  resubmission_required: { label: 'Resubmission required', tone: 'amber' },
};

const PROFESSIONAL_STATUS_COPY: Record<ProfessionalAuthorisationStatus, { label: string; tone: string }> = {
  not_submitted: { label: 'Not submitted', tone: 'slate' },
  pending_review: { label: 'Pending review', tone: 'amber' },
  under_review: { label: 'Under review', tone: 'sky' },
  approved: { label: 'Approved', tone: 'emerald' },
  rejected: { label: 'Rejected', tone: 'rose' },
  resubmission_required: { label: 'Resubmission required', tone: 'amber' },
  expired: { label: 'Expired', tone: 'rose' },
};

const toneClass = (tone: string): string => {
  switch (tone) {
    case 'emerald':
      return 'bg-emerald-500/15 border-emerald-500/30 text-emerald-700';
    case 'amber':
      return 'bg-amber-500/10 border-amber-500/30 text-amber-700';
    case 'rose':
      return 'bg-accent/15 border-accent/30 text-ink';
    case 'sky':
      return 'bg-sky-500/10 border-sky-500/30 text-sky-700';
    default:
      return 'bg-surface border-line text-ink/70';
  }
};

const StatusPill: React.FC<{ status: string; map: Record<string, { label: string; tone: string }> }> = ({ status, map }) => {
  const copy = map[status] ?? { label: status.replace(/_/g, ' '), tone: 'slate' };
  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-md border text-[10px] font-bold uppercase ${toneClass(copy.tone)}`}>
      {copy.label}
    </span>
  );
};

/**
 * Verification panel (Increment D).
 *
 * Used by agents (identity + professional authorisation) and by landlords
 * (optional identity only — tenants never see this). It states plainly what the
 * platform has and has not checked: no registry lookups, no licence implied by a
 * document, and an approved identity never means property ownership.
 */
export const VerificationPanel: React.FC<{ scope: 'agent' | 'landlord'; className?: string }> = ({
  scope,
  className = '',
}) => {
  const [summary, setSummary] = useState<VerificationSummary | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  // Identity form state
  const [legalName, setLegalName] = useState('');
  const [documentType, setDocumentType] = useState('ghana_card');
  const [documentNumber, setDocumentNumber] = useState('');
  const [pendingDocs, setPendingDocs] = useState<VerificationDocument[]>([]);
  const frontInput = useRef<HTMLInputElement>(null);
  const backInput = useRef<HTMLInputElement>(null);

  // Professional form state (agents only)
  const [licenceNumber, setLicenceNumber] = useState('');
  const [issuingAuthority, setIssuingAuthority] = useState('');
  const [licenceCategory, setLicenceCategory] = useState('');
  const [issueDate, setIssueDate] = useState('');
  const [expiryDate, setExpiryDate] = useState('');
  const [professionalDocs, setProfessionalDocs] = useState<VerificationDocument[]>([]);
  const licenceInput = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const result = await api.getVerification();
      setSummary(result.verification);
      setLegalName(result.verification.identity.legalName || '');
      setDocumentType(result.verification.identity.documentType || 'ghana_card');
      if (result.verification.professional) {
        setIssuingAuthority(result.verification.professional.issuingAuthority || '');
        setLicenceCategory(result.verification.professional.licenceCategory || '');
        setIssueDate(result.verification.professional.issueDate || '');
        setExpiryDate(result.verification.professional.expiryDate || '');
      }
    } catch (err) {
      setError(messageForError(err));
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const upload = async (file: File, kind: string, target: 'identity' | 'professional') => {
    setBusy(true);
    setError(null);
    try {
      const result = await api.uploadVerificationDocument(file, kind, target === 'professional' ? 'professional' : undefined);
      if (target === 'professional') {
        setProfessionalDocs((list) => [...list, result.document]);
      } else {
        setPendingDocs((list) => [...list, result.document]);
      }
      setNotice('Document uploaded privately. It is not visible at any public link.');
    } catch (err) {
      setError(messageForError(err));
    } finally {
      setBusy(false);
    }
  };

  const removeUploaded = async (document: VerificationDocument, target: 'identity' | 'professional') => {
    setBusy(true);
    try {
      await api.deleteVerificationDocument(document.id);
      if (target === 'professional') {
        setProfessionalDocs((list) => list.filter((doc) => doc.id !== document.id));
      } else {
        setPendingDocs((list) => list.filter((doc) => doc.id !== document.id));
      }
      await load();
    } catch (err) {
      setError(messageForError(err));
    } finally {
      setBusy(false);
    }
  };

  const submitIdentity = async (event: React.FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    setFieldErrors({});
    setNotice(null);
    try {
      const existingIds = (summary?.identity.documents ?? []).map((doc) => doc.id);
      const uploadedIds = [...existingIds, ...pendingDocs.map((doc) => doc.id)];
      await api.submitIdentityVerification({
        legalName: legalName.trim(),
        documentType,
        documentNumber: documentNumber.trim(),
        documentIds: uploadedIds,
      });
      setDocumentNumber('');
      setPendingDocs([]);
      setNotice('Identity submitted. A reviewer will check it — this does not grant any permission.');
      await load();
    } catch (err) {
      const apiError = err as { fields?: Record<string, string> };
      setFieldErrors(apiError.fields ?? {});
      setError(messageForError(err));
    } finally {
      setBusy(false);
    }
  };

  const submitProfessional = async (event: React.FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    setFieldErrors({});
    setNotice(null);
    try {
      const existingIds = (summary?.professional?.documents ?? []).map((doc) => doc.id);
      await api.submitProfessionalAuthorisation({
        licenceNumber: licenceNumber.trim(),
        issuingAuthority: issuingAuthority.trim(),
        licenceCategory: licenceCategory.trim(),
        issueDate: issueDate || undefined,
        expiryDate: expiryDate || undefined,
        documentIds: [...existingIds, ...professionalDocs.map((doc) => doc.id)],
      });
      setLicenceNumber('');
      setProfessionalDocs([]);
      setNotice('Authorisation submitted for review. Nothing is verified until a reviewer decides.');
      await load();
    } catch (err) {
      const apiError = err as { fields?: Record<string, string> };
      setFieldErrors(apiError.fields ?? {});
      setError(messageForError(err));
    } finally {
      setBusy(false);
    }
  };

  if (isLoading) {
    return (
      <div className={`bg-surface border border-line rounded-2xl p-6 ${className}`}>
        <p className="text-xs text-ink/70">Loading verification…</p>
      </div>
    );
  }

  if (!summary) {
    return (
      <div className={`bg-surface border border-line rounded-2xl p-6 ${className}`}>
        <p className="text-xs text-ink">{error || 'Verification is unavailable right now.'}</p>
      </div>
    );
  }

  const identity = summary.identity;
  const professional = summary.professional;
  const identityLocked = identity.status === 'approved';
  const identityCanSubmit = !identityLocked && ['not_submitted', 'rejected', 'resubmission_required', 'pending_review', 'under_review'].includes(identity.status);
  const professionalCanSubmit =
    professional !== null && !['approved'].includes(professional.status);
  const documentsForIdentity = identity.documents.filter((doc) => doc.scope === 'identity');

  return (
    <div className={`space-y-4 ${className}`}>
      {(error || notice) && (
        <div
          role="status"
          className={`p-3 rounded-xl border text-xs flex items-start gap-2 ${
            error
              ? 'bg-accent/15 border-accent/30 text-ink'
              : 'bg-interactive/10 border-interactive/30 text-ink'
          }`}
        >
          {error ? <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" /> : <Lock className="w-4 h-4 shrink-0 mt-0.5 text-ink" />}
          <span className="flex-1">{error || notice}</span>
        </div>
      )}

      {scope === 'agent' && summary.agentTier && (
        <div className="bg-surface border border-line rounded-2xl p-5 space-y-3">
          <h2 className="text-sm font-bold text-ink flex items-center gap-2">
            <BadgeCheck className="w-4 h-4 text-ink" /> Your commission tier
          </h2>

          {/* Task 03: the two tiers and the exact percentage each one earns.
              Percentages are shares of an agreed commission — no approval is
              promised here and none of this changes a viewing fee. */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <div
              className={`rounded-2xl border p-3 space-y-1 ${
                summary.agentTier.commissionTier === 'tier_a' || summary.agentTier.commissionTier === 'higher'
                  ? 'bg-interactive/10 border-interactive/40'
                  : 'bg-surface border-line'
              }`}
            >
              <p className="text-[11px] font-bold text-ink">
                Tier A — Basic · {summary.agentTier.basicTierPercent ?? 60}% of an agreed commission
              </p>
              <p className="text-[10px] text-ink/70">
                Requires {summary.agentTier.basicTierRequires ?? 'an approved Ghana Card identity verification'}.
              </p>
              <p className="text-[10px] text-ink/70">
                Identity: {summary.agentTier.identityStatus.replace(/_/g, ' ')}
              </p>
            </div>
            <div
              className={`rounded-2xl border p-3 space-y-1 ${
                summary.agentTier.commissionTier === 'higher'
                  ? 'bg-interactive/10 border-interactive/40'
                  : 'bg-surface border-line'
              }`}
            >
              <p className="text-[11px] font-bold text-ink">
                Higher tier · {summary.agentTier.higherTierPercent ?? 70}% of an agreed commission
              </p>
              <p className="text-[10px] text-ink/70">
                Requires {summary.agentTier.higherTierRequires ?? 'an approved identity AND an approved professional authorisation'}.
              </p>
              <p className="text-[10px] text-ink/70">
                Professional authorisation: {summary.agentTier.professionalStatus.replace(/_/g, ' ')}
              </p>
            </div>
          </div>

          <p className="text-xs text-ink">
            Currently applied:{' '}
            <span className="font-bold text-ink">
              {summary.agentTier.commissionTierLabel ?? summary.agentTier.tierLabel}
            </span>{' '}
            ·{' '}
            <span className="font-bold text-ink">
              {summary.agentTier.commissionPercent ?? 0}% agent / {summary.agentTier.goodlucksPercent ?? 100}%
              Goodlucks
            </span>
          </p>

          <ul className="text-[11px] text-ink/70 space-y-1">
            <li>
              Standard agent: {summary.agentTier.eligibleStandard ? 'eligible' : 'not yet eligible'} · identity{' '}
              {summary.agentTier.identityStatus.replace(/_/g, ' ')}
            </li>
            <li>
              Professionally authorised agent:{' '}
              {summary.agentTier.eligibleProfessional ? 'eligible' : 'not yet eligible'} · professional authorisation{' '}
              {summary.agentTier.professionalStatus.replace(/_/g, ' ')}
            </li>
          </ul>

          <p className="text-[10px] text-ink/70 max-w-xl">
            The percentage is worked out from the decisions on this page every time it is read, and it applies only to
            the agent&apos;s share of a commission that has been agreed for a transaction. Uploading a document never
            changes it — only a reviewer&apos;s approval does. It never applies to a viewing fee, and a commission that
            was already agreed keeps the percentage it was recorded with.
            {summary.agentTier.commissionBasis ? ` ${summary.agentTier.commissionBasis}` : ''}
          </p>
        </div>
      )}

      {/* -------------------------------- Identity -------------------------------- */}
      <div className="bg-surface border border-line rounded-2xl p-6 space-y-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-sm font-bold text-ink flex items-center gap-2">
              <BadgeCheck className="w-4 h-4 text-ink" />
              Identity verification
            </h2>
            <p className="text-[11px] text-ink/70 mt-1 max-w-xl">
              {scope === 'agent'
                ? 'A check that you are the person on the document. It is not a licence, and it says nothing about any property.'
                : 'Optional for landlords. Identity is not proof that you own or may let any particular property.'}
            </p>
          </div>
          <StatusPill status={identity.status} map={IDENTITY_STATUS_COPY} />
        </div>

        {identity.decisionNote && (
          <p className="text-[11px] text-ink/70 bg-surface border border-line rounded-xl p-3">
            <span className="font-bold text-ink">Reviewer note: </span>
            {identity.decisionNote}
          </p>
        )}

        {identity.status !== 'not_submitted' && (
          <dl className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-[11px] text-ink/70">
            <div>
              <dt className="font-semibold text-ink/70">Submitted name</dt>
              <dd>{identity.legalName || '—'}</dd>
            </div>
            <div>
              <dt className="font-semibold text-ink/70">Document</dt>
              <dd>
                {identity.documentTypeLabel} · {identity.documentNumberMasked || '—'}
              </dd>
            </div>
            <div>
              <dt className="font-semibold text-ink/70">Submitted</dt>
              <dd>{identity.submittedAt ? new Date(identity.submittedAt).toLocaleString() : '—'}</dd>
            </div>
            <div>
              <dt className="font-semibold text-ink/70">Last review</dt>
              <dd>{identity.reviewedAt ? new Date(identity.reviewedAt).toLocaleDateString() : 'Not reviewed yet'}</dd>
            </div>
          </dl>
        )}

        {/* Task 05: this used to describe the server's key configuration to the
            customer. What a member needs to know is who can see their documents
            and for how long — and every sentence here is one the implementation
            actually supports (private storage, capability-gated access with an
            audit row, and the retention job). */}
        <div className="text-[10px] text-ink/70 leading-snug flex items-start gap-1.5">
          <ShieldAlert className="w-3.5 h-3.5 mt-0.5 shrink-0 text-amber-700" />
          <span>
            Your documents are used only to check your identity and to administer your account. They are stored
            privately and are never shown on your public profile or on a listing. Only you and authorised reviewers can
            open them, and every time a document is opened it is recorded.
            {summary.encryptionActive
              ? ' The identity number you enter is held encrypted, and a reviewer can only reveal it for a review.'
              : ' The full identity number you enter is not retained; a reviewer works from the uploaded document.'}{' '}
            Documents are kept for {summary.retentionDays} days after a decision and are then deleted by the retention
            job.
          </span>
        </div>

        {documentsForIdentity.length > 0 && (
          <div className="space-y-2">
            <p className="text-[11px] font-semibold text-ink/70">Documents on file</p>
            <ul className="space-y-1.5">
              {documentsForIdentity.map((doc) => (
                <li key={doc.id} className="flex items-center justify-between gap-2 text-[11px] bg-surface border border-line rounded-lg px-3 py-2">
                  <span className="flex items-center gap-2 text-ink/70">
                    <FileText className="w-3.5 h-3.5 text-ink/70" />
                    {doc.kindLabel}
                    <span className="text-ink/70">{Math.round(doc.bytes / 1024)} KB</span>
                  </span>
                  <span className="flex items-center gap-3">
                    {doc.downloadUrl && (
                      <a href={doc.downloadUrl} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 text-ink font-bold">
                        <Download className="w-3.5 h-3.5" /> Open
                      </a>
                    )}
                    {!identityLocked && (
                      <button
                        type="button"
                        onClick={() => void removeUploaded(doc, 'identity')}
                        disabled={busy}
                        className="flex items-center gap-1 text-ink/70 hover:text-ink disabled:opacity-50"
                      >
                        <Trash2 className="w-3.5 h-3.5" /> Remove
                      </button>
                    )}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {identityCanSubmit && (
          <form onSubmit={submitIdentity} className="space-y-3 border-t border-line pt-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <label className="block text-[11px] font-semibold text-ink/70">
                Full legal name
                <input
                  type="text"
                  required
                  value={legalName}
                  onChange={(event) => setLegalName(event.target.value)}
                  placeholder="As printed on the document"
                  className="mt-1 w-full bg-page border border-line rounded-xl px-3 py-2 text-xs text-ink placeholder-ink/50 focus:outline-none focus:border-interactive"
                />
                {fieldErrors.legalName && <span className="text-[10px] text-ink">{fieldErrors.legalName}</span>}
              </label>

              <label className="block text-[11px] font-semibold text-ink/70">
                Document type
                <select
                  value={documentType}
                  onChange={(event) => setDocumentType(event.target.value)}
                  className="mt-1 w-full bg-page border border-line rounded-xl px-3 py-2 text-xs text-ink focus:outline-none focus:border-interactive"
                >
                  {summary.documentTypes.map((type) => (
                    <option key={type.value} value={type.value}>
                      {type.label}
                    </option>
                  ))}
                </select>
              </label>

              <label className="block text-[11px] font-semibold text-ink/70 sm:col-span-2">
                Document number
                <input
                  type="text"
                  required
                  autoComplete="off"
                  value={documentNumber}
                  onChange={(event) => setDocumentNumber(event.target.value)}
                  placeholder="e.g. GHA-123456789-0"
                  className="mt-1 w-full bg-page border border-line rounded-xl px-3 py-2 text-xs text-ink placeholder-ink/50 focus:outline-none focus:border-interactive"
                />
                {fieldErrors.documentNumber && <span className="text-[10px] text-ink">{fieldErrors.documentNumber}</span>}
                <span className="block text-[10px] text-ink/70 mt-1">
                  Stored encrypted, never shown in full again — reviewers see a masked value unless they hold document access.
                </span>
              </label>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-[11px] font-semibold text-ink/70">Front of document (PDF/JPG/PNG)</label>
                <input
                  ref={frontInput}
                  type="file"
                  accept="application/pdf,image/jpeg,image/png"
                  onChange={(event) => {
                    const file = event.target.files?.[0];
                    if (file) void upload(file, 'document_front', 'identity');
                    if (frontInput.current) frontInput.current.value = '';
                  }}
                  className="mt-1 block w-full text-[11px] text-ink/70 file:mr-3 file:rounded-lg file:border-0 file:bg-page file:px-3 file:py-1.5 file:text-[11px] file:font-bold file:text-ink"
                />
              </div>
              <div>
                <label className="block text-[11px] font-semibold text-ink/70">Back of document (optional)</label>
                <input
                  ref={backInput}
                  type="file"
                  accept="application/pdf,image/jpeg,image/png"
                  onChange={(event) => {
                    const file = event.target.files?.[0];
                    if (file) void upload(file, 'document_back', 'identity');
                    if (backInput.current) backInput.current.value = '';
                  }}
                  className="mt-1 block w-full text-[11px] text-ink/70 file:mr-3 file:rounded-lg file:border-0 file:bg-page file:px-3 file:py-1.5 file:text-[11px] file:font-bold file:text-ink"
                />
              </div>
            </div>

            {pendingDocs.length > 0 && (
              <ul className="text-[11px] text-ink/70 space-y-1">
                {pendingDocs.map((doc) => (
                  <li key={doc.id} className="flex items-center gap-2">
                    <Upload className="w-3 h-3 text-ink" />
                    {doc.kindLabel} uploaded — it will be attached when you submit.
                  </li>
                ))}
              </ul>
            )}

            <button
              type="submit"
              disabled={busy}
              className="gl-btn gl-btn-primary px-5 py-2.5 text-xs"
            >
              {busy ? 'Submitting…' : 'Submit for review'}
            </button>
          </form>
        )}

        {identityLocked && (
          <p className="text-[11px] text-emerald-700 flex items-center gap-1.5">
            <Clock3 className="w-3.5 h-3.5" /> Verified. Contact Goodlucks if you need to change these details.
          </p>
        )}
      </div>

      {/* ---------------------------- Professional ---------------------------- */}
      {scope === 'agent' && professional && (
        <div className="bg-surface border border-line rounded-2xl p-6 space-y-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 className="text-sm font-bold text-ink flex items-center gap-2">
                <FileText className="w-4 h-4 text-ink" />
                Professional authorisation
              </h2>
              <p className="text-[11px] text-ink/70 mt-1 max-w-xl">
                Separate from identity. Submitting a number does not make you licensed: Goodlucks does not check any
                regulator's register, and a reviewer decides from the documents you provide.
              </p>
            </div>
            <StatusPill status={professional.status} map={PROFESSIONAL_STATUS_COPY} />
          </div>

          {professional.decisionNote && (
            <p className="text-[11px] text-ink/70 bg-surface border border-line rounded-xl p-3">
              <span className="font-bold text-ink">Reviewer note: </span>
              {professional.decisionNote}
            </p>
          )}

          {professional.status !== 'not_submitted' && (
            <dl className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-[11px] text-ink/70">
              <div>
                <dt className="font-semibold text-ink/70">Licence / registration number</dt>
                <dd>{professional.licenceNumber || professional.licenceNumberMasked || '—'}</dd>
              </div>
              <div>
                <dt className="font-semibold text-ink/70">Issuing authority</dt>
                <dd>{professional.issuingAuthority || '—'}</dd>
              </div>
              <div>
                <dt className="font-semibold text-ink/70">Category</dt>
                <dd>{professional.licenceCategory || '—'}</dd>
              </div>
              <div>
                <dt className="font-semibold text-ink/70">Valid until</dt>
                <dd>{professional.expiryDate || 'Not stated'}</dd>
              </div>
            </dl>
          )}

          {(professional.documents?.length ?? 0) > 0 && (
            <ul className="space-y-1.5">
              {professional.documents.map((doc) => (
                <li key={doc.id} className="flex items-center justify-between gap-2 text-[11px] bg-surface border border-line rounded-lg px-3 py-2">
                  <span className="flex items-center gap-2 text-ink/70">
                    <FileText className="w-3.5 h-3.5 text-ink/70" />
                    {doc.kindLabel}
                  </span>
                  <span className="flex items-center gap-3">
                    {doc.downloadUrl && (
                      <a href={doc.downloadUrl} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 text-ink font-bold">
                        <Download className="w-3.5 h-3.5" /> Open
                      </a>
                    )}
                    {professionalCanSubmit && (
                      <button
                        type="button"
                        onClick={() => void removeUploaded(doc, 'professional')}
                        disabled={busy}
                        className="flex items-center gap-1 text-ink/70 hover:text-ink disabled:opacity-50"
                      >
                        <Trash2 className="w-3.5 h-3.5" /> Remove
                      </button>
                    )}
                  </span>
                </li>
              ))}
            </ul>
          )}

          {professionalCanSubmit && (
            <form onSubmit={submitProfessional} className="space-y-3 border-t border-line pt-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <label className="block text-[11px] font-semibold text-ink/70">
                  Licence / registration number
                  <input
                    type="text"
                    required
                    value={licenceNumber}
                    onChange={(event) => setLicenceNumber(event.target.value)}
                    className="mt-1 w-full bg-page border border-line rounded-xl px-3 py-2 text-xs text-ink focus:outline-none focus:border-interactive"
                  />
                  {fieldErrors.licenceNumber && <span className="text-[10px] text-ink">{fieldErrors.licenceNumber}</span>}
                </label>
                <label className="block text-[11px] font-semibold text-ink/70">
                  Issuing authority
                  <input
                    type="text"
                    required
                    value={issuingAuthority}
                    onChange={(event) => setIssuingAuthority(event.target.value)}
                    placeholder="The body that issued it"
                    className="mt-1 w-full bg-page border border-line rounded-xl px-3 py-2 text-xs text-ink placeholder-ink/50 focus:outline-none focus:border-interactive"
                  />
                  {fieldErrors.issuingAuthority && <span className="text-[10px] text-ink">{fieldErrors.issuingAuthority}</span>}
                </label>
                <label className="block text-[11px] font-semibold text-ink/70">
                  Category (optional)
                  <input
                    type="text"
                    value={licenceCategory}
                    onChange={(event) => setLicenceCategory(event.target.value)}
                    className="mt-1 w-full bg-page border border-line rounded-xl px-3 py-2 text-xs text-ink focus:outline-none focus:border-interactive"
                  />
                </label>
                <label className="block text-[11px] font-semibold text-ink/70">
                  Issue date (optional)
                  <input
                    type="date"
                    value={issueDate}
                    onChange={(event) => setIssueDate(event.target.value)}
                    className="mt-1 w-full bg-page border border-line rounded-xl px-3 py-2 text-xs text-ink focus:outline-none focus:border-interactive"
                  />
                </label>
                <label className="block text-[11px] font-semibold text-ink/70">
                  Expiry date (optional)
                  <input
                    type="date"
                    value={expiryDate}
                    onChange={(event) => setExpiryDate(event.target.value)}
                    className="mt-1 w-full bg-page border border-line rounded-xl px-3 py-2 text-xs text-ink focus:outline-none focus:border-interactive"
                  />
                  {fieldErrors.expiryDate && <span className="text-[10px] text-ink">{fieldErrors.expiryDate}</span>}
                </label>
                <div>
                  <label className="block text-[11px] font-semibold text-ink/70">Certificate (PDF/JPG/PNG)</label>
                  <input
                    ref={licenceInput}
                    type="file"
                    accept="application/pdf,image/jpeg,image/png"
                    onChange={(event) => {
                      const file = event.target.files?.[0];
                      if (file) void upload(file, 'licence', 'professional');
                      if (licenceInput.current) licenceInput.current.value = '';
                    }}
                    className="mt-1 block w-full text-[11px] text-ink/70 file:mr-3 file:rounded-lg file:border-0 file:bg-page file:px-3 file:py-1.5 file:text-[11px] file:font-bold file:text-ink"
                  />
                </div>
              </div>

              <button
                type="submit"
                disabled={busy}
                className="gl-btn gl-btn-primary px-5 py-2.5 text-xs"
              >
                {busy ? 'Submitting…' : 'Submit authorisation'}
              </button>
            </form>
          )}
        </div>
      )}
    </div>
  );
};
