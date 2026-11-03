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
      return 'bg-emerald-500/15 border-emerald-500/30 text-emerald-300';
    case 'amber':
      return 'bg-amber-500/10 border-amber-500/30 text-amber-300';
    case 'rose':
      return 'bg-[#FF2E63]/15 border-[#FF2E63]/30 text-[#FF8FA8]';
    case 'sky':
      return 'bg-sky-500/10 border-sky-500/30 text-sky-300';
    default:
      return 'bg-slate-800 border-white/10 text-slate-300';
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
      <div className={`bg-[#252A34]/70 border border-white/10 rounded-3xl p-6 ${className}`}>
        <p className="text-xs text-slate-400">Loading verification…</p>
      </div>
    );
  }

  if (!summary) {
    return (
      <div className={`bg-[#252A34]/70 border border-white/10 rounded-3xl p-6 ${className}`}>
        <p className="text-xs text-[#FF8FA8]">{error || 'Verification is unavailable right now.'}</p>
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
              ? 'bg-[#FF2E63]/15 border-[#FF2E63]/30 text-[#FF8FA8]'
              : 'bg-[#08D9D6]/10 border-[#08D9D6]/30 text-slate-200'
          }`}
        >
          {error ? <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" /> : <Lock className="w-4 h-4 shrink-0 mt-0.5 text-[#08D9D6]" />}
          <span className="flex-1">{error || notice}</span>
        </div>
      )}

      {scope === 'agent' && summary.agentTier && (
        <div className="bg-[#252A34]/70 border border-white/10 rounded-3xl p-5 space-y-2">
          <h2 className="text-sm font-bold text-white flex items-center gap-2">
            <BadgeCheck className="w-4 h-4 text-[#08D9D6]" /> Agent tier
          </h2>
          <p className="text-sm text-[#08D9D6] font-bold">{summary.agentTier.tierLabel}</p>
          <ul className="text-[11px] text-slate-300 space-y-1">
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
          <p className="text-[10px] text-slate-500 max-w-xl">
            The tier is worked out from the decisions on this page every time it is read. It is not something you can
            set, an approved identity alone does not reach it, and it never changes a fee that was already priced.
            {summary.agentTier.note ? ` ${summary.agentTier.note}` : ''}
          </p>
        </div>
      )}

      {/* -------------------------------- Identity -------------------------------- */}
      <div className="bg-[#252A34]/70 border border-white/10 rounded-3xl p-6 space-y-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-sm font-bold text-white flex items-center gap-2">
              <BadgeCheck className="w-4 h-4 text-[#08D9D6]" />
              Identity verification
            </h2>
            <p className="text-[11px] text-slate-400 mt-1 max-w-xl">
              {scope === 'agent'
                ? 'A check that you are the person on the document. It is not a licence, and it says nothing about any property.'
                : 'Optional for landlords. Identity is not proof that you own or may let any particular property.'}
            </p>
          </div>
          <StatusPill status={identity.status} map={IDENTITY_STATUS_COPY} />
        </div>

        {identity.decisionNote && (
          <p className="text-[11px] text-slate-300 bg-slate-900/60 border border-white/10 rounded-xl p-3">
            <span className="font-bold text-slate-200">Reviewer note: </span>
            {identity.decisionNote}
          </p>
        )}

        {identity.status !== 'not_submitted' && (
          <dl className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-[11px] text-slate-400">
            <div>
              <dt className="font-semibold text-slate-300">Submitted name</dt>
              <dd>{identity.legalName || '—'}</dd>
            </div>
            <div>
              <dt className="font-semibold text-slate-300">Document</dt>
              <dd>
                {identity.documentTypeLabel} · {identity.documentNumberMasked || '—'}
              </dd>
            </div>
            <div>
              <dt className="font-semibold text-slate-300">Submitted</dt>
              <dd>{identity.submittedAt ? new Date(identity.submittedAt).toLocaleString() : '—'}</dd>
            </div>
            <div>
              <dt className="font-semibold text-slate-300">Last review</dt>
              <dd>{identity.reviewedAt ? new Date(identity.reviewedAt).toLocaleDateString() : 'Not reviewed yet'}</dd>
            </div>
          </dl>
        )}

        <p className="text-[10px] text-slate-500 leading-snug flex items-start gap-1.5">
          <ShieldAlert className="w-3.5 h-3.5 mt-0.5 shrink-0 text-amber-300" />
          {summary.encryptionActive
            ? 'Identity numbers are held encrypted; only an authorised reviewer can reveal the full number.'
            : 'This deployment has no identity-encryption key configured, so the full number is not retained at all — a reviewer works from the uploaded document.'}{' '}
          Documents are kept privately for {summary.retentionDays} days after a decision, then deleted.
        </p>

        {documentsForIdentity.length > 0 && (
          <div className="space-y-2">
            <p className="text-[11px] font-semibold text-slate-300">Documents on file</p>
            <ul className="space-y-1.5">
              {documentsForIdentity.map((doc) => (
                <li key={doc.id} className="flex items-center justify-between gap-2 text-[11px] bg-slate-900/50 border border-white/10 rounded-lg px-3 py-2">
                  <span className="flex items-center gap-2 text-slate-300">
                    <FileText className="w-3.5 h-3.5 text-slate-400" />
                    {doc.kindLabel}
                    <span className="text-slate-500">{Math.round(doc.bytes / 1024)} KB</span>
                  </span>
                  <span className="flex items-center gap-3">
                    {doc.downloadUrl && (
                      <a href={doc.downloadUrl} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 text-[#08D9D6] font-bold">
                        <Download className="w-3.5 h-3.5" /> Open
                      </a>
                    )}
                    {!identityLocked && (
                      <button
                        type="button"
                        onClick={() => void removeUploaded(doc, 'identity')}
                        disabled={busy}
                        className="flex items-center gap-1 text-slate-400 hover:text-[#FF8FA8] disabled:opacity-50"
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
          <form onSubmit={submitIdentity} className="space-y-3 border-t border-white/10 pt-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <label className="block text-[11px] font-semibold text-slate-300">
                Full legal name
                <input
                  type="text"
                  required
                  value={legalName}
                  onChange={(event) => setLegalName(event.target.value)}
                  placeholder="As printed on the document"
                  className="mt-1 w-full bg-slate-900 border border-white/10 rounded-xl px-3 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-[#08D9D6]"
                />
                {fieldErrors.legalName && <span className="text-[10px] text-[#FF8FA8]">{fieldErrors.legalName}</span>}
              </label>

              <label className="block text-[11px] font-semibold text-slate-300">
                Document type
                <select
                  value={documentType}
                  onChange={(event) => setDocumentType(event.target.value)}
                  className="mt-1 w-full bg-slate-900 border border-white/10 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-[#08D9D6]"
                >
                  {summary.documentTypes.map((type) => (
                    <option key={type.value} value={type.value}>
                      {type.label}
                    </option>
                  ))}
                </select>
              </label>

              <label className="block text-[11px] font-semibold text-slate-300 sm:col-span-2">
                Document number
                <input
                  type="text"
                  required
                  autoComplete="off"
                  value={documentNumber}
                  onChange={(event) => setDocumentNumber(event.target.value)}
                  placeholder="e.g. GHA-123456789-0"
                  className="mt-1 w-full bg-slate-900 border border-white/10 rounded-xl px-3 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-[#08D9D6]"
                />
                {fieldErrors.documentNumber && <span className="text-[10px] text-[#FF8FA8]">{fieldErrors.documentNumber}</span>}
                <span className="block text-[10px] text-slate-500 mt-1">
                  Stored encrypted, never shown in full again — reviewers see a masked value unless they hold document access.
                </span>
              </label>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-[11px] font-semibold text-slate-300">Front of document (PDF/JPG/PNG)</label>
                <input
                  ref={frontInput}
                  type="file"
                  accept="application/pdf,image/jpeg,image/png"
                  onChange={(event) => {
                    const file = event.target.files?.[0];
                    if (file) void upload(file, 'document_front', 'identity');
                    if (frontInput.current) frontInput.current.value = '';
                  }}
                  className="mt-1 block w-full text-[11px] text-slate-400 file:mr-3 file:rounded-lg file:border-0 file:bg-slate-800 file:px-3 file:py-1.5 file:text-[11px] file:font-bold file:text-slate-200"
                />
              </div>
              <div>
                <label className="block text-[11px] font-semibold text-slate-300">Back of document (optional)</label>
                <input
                  ref={backInput}
                  type="file"
                  accept="application/pdf,image/jpeg,image/png"
                  onChange={(event) => {
                    const file = event.target.files?.[0];
                    if (file) void upload(file, 'document_back', 'identity');
                    if (backInput.current) backInput.current.value = '';
                  }}
                  className="mt-1 block w-full text-[11px] text-slate-400 file:mr-3 file:rounded-lg file:border-0 file:bg-slate-800 file:px-3 file:py-1.5 file:text-[11px] file:font-bold file:text-slate-200"
                />
              </div>
            </div>

            {pendingDocs.length > 0 && (
              <ul className="text-[11px] text-slate-400 space-y-1">
                {pendingDocs.map((doc) => (
                  <li key={doc.id} className="flex items-center gap-2">
                    <Upload className="w-3 h-3 text-[#08D9D6]" />
                    {doc.kindLabel} uploaded — it will be attached when you submit.
                  </li>
                ))}
              </ul>
            )}

            <button
              type="submit"
              disabled={busy}
              className="px-5 py-2.5 rounded-xl bg-[#08D9D6] text-[#252A34] font-extrabold text-xs disabled:opacity-60"
            >
              {busy ? 'Submitting…' : 'Submit for review'}
            </button>
          </form>
        )}

        {identityLocked && (
          <p className="text-[11px] text-emerald-300 flex items-center gap-1.5">
            <Clock3 className="w-3.5 h-3.5" /> Verified. Contact Goodlucks if you need to change these details.
          </p>
        )}
      </div>

      {/* ---------------------------- Professional ---------------------------- */}
      {scope === 'agent' && professional && (
        <div className="bg-[#252A34]/70 border border-white/10 rounded-3xl p-6 space-y-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 className="text-sm font-bold text-white flex items-center gap-2">
                <FileText className="w-4 h-4 text-[#08D9D6]" />
                Professional authorisation
              </h2>
              <p className="text-[11px] text-slate-400 mt-1 max-w-xl">
                Separate from identity. Submitting a number does not make you licensed: Goodlucks does not check any
                regulator's register, and a reviewer decides from the documents you provide.
              </p>
            </div>
            <StatusPill status={professional.status} map={PROFESSIONAL_STATUS_COPY} />
          </div>

          {professional.decisionNote && (
            <p className="text-[11px] text-slate-300 bg-slate-900/60 border border-white/10 rounded-xl p-3">
              <span className="font-bold text-slate-200">Reviewer note: </span>
              {professional.decisionNote}
            </p>
          )}

          {professional.status !== 'not_submitted' && (
            <dl className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-[11px] text-slate-400">
              <div>
                <dt className="font-semibold text-slate-300">Licence / registration number</dt>
                <dd>{professional.licenceNumber || professional.licenceNumberMasked || '—'}</dd>
              </div>
              <div>
                <dt className="font-semibold text-slate-300">Issuing authority</dt>
                <dd>{professional.issuingAuthority || '—'}</dd>
              </div>
              <div>
                <dt className="font-semibold text-slate-300">Category</dt>
                <dd>{professional.licenceCategory || '—'}</dd>
              </div>
              <div>
                <dt className="font-semibold text-slate-300">Valid until</dt>
                <dd>{professional.expiryDate || 'Not stated'}</dd>
              </div>
            </dl>
          )}

          {(professional.documents?.length ?? 0) > 0 && (
            <ul className="space-y-1.5">
              {professional.documents.map((doc) => (
                <li key={doc.id} className="flex items-center justify-between gap-2 text-[11px] bg-slate-900/50 border border-white/10 rounded-lg px-3 py-2">
                  <span className="flex items-center gap-2 text-slate-300">
                    <FileText className="w-3.5 h-3.5 text-slate-400" />
                    {doc.kindLabel}
                  </span>
                  <span className="flex items-center gap-3">
                    {doc.downloadUrl && (
                      <a href={doc.downloadUrl} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 text-[#08D9D6] font-bold">
                        <Download className="w-3.5 h-3.5" /> Open
                      </a>
                    )}
                    {professionalCanSubmit && (
                      <button
                        type="button"
                        onClick={() => void removeUploaded(doc, 'professional')}
                        disabled={busy}
                        className="flex items-center gap-1 text-slate-400 hover:text-[#FF8FA8] disabled:opacity-50"
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
            <form onSubmit={submitProfessional} className="space-y-3 border-t border-white/10 pt-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <label className="block text-[11px] font-semibold text-slate-300">
                  Licence / registration number
                  <input
                    type="text"
                    required
                    value={licenceNumber}
                    onChange={(event) => setLicenceNumber(event.target.value)}
                    className="mt-1 w-full bg-slate-900 border border-white/10 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-[#08D9D6]"
                  />
                  {fieldErrors.licenceNumber && <span className="text-[10px] text-[#FF8FA8]">{fieldErrors.licenceNumber}</span>}
                </label>
                <label className="block text-[11px] font-semibold text-slate-300">
                  Issuing authority
                  <input
                    type="text"
                    required
                    value={issuingAuthority}
                    onChange={(event) => setIssuingAuthority(event.target.value)}
                    placeholder="The body that issued it"
                    className="mt-1 w-full bg-slate-900 border border-white/10 rounded-xl px-3 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-[#08D9D6]"
                  />
                  {fieldErrors.issuingAuthority && <span className="text-[10px] text-[#FF8FA8]">{fieldErrors.issuingAuthority}</span>}
                </label>
                <label className="block text-[11px] font-semibold text-slate-300">
                  Category (optional)
                  <input
                    type="text"
                    value={licenceCategory}
                    onChange={(event) => setLicenceCategory(event.target.value)}
                    className="mt-1 w-full bg-slate-900 border border-white/10 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-[#08D9D6]"
                  />
                </label>
                <label className="block text-[11px] font-semibold text-slate-300">
                  Issue date (optional)
                  <input
                    type="date"
                    value={issueDate}
                    onChange={(event) => setIssueDate(event.target.value)}
                    className="mt-1 w-full bg-slate-900 border border-white/10 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-[#08D9D6]"
                  />
                </label>
                <label className="block text-[11px] font-semibold text-slate-300">
                  Expiry date (optional)
                  <input
                    type="date"
                    value={expiryDate}
                    onChange={(event) => setExpiryDate(event.target.value)}
                    className="mt-1 w-full bg-slate-900 border border-white/10 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-[#08D9D6]"
                  />
                  {fieldErrors.expiryDate && <span className="text-[10px] text-[#FF8FA8]">{fieldErrors.expiryDate}</span>}
                </label>
                <div>
                  <label className="block text-[11px] font-semibold text-slate-300">Certificate (PDF/JPG/PNG)</label>
                  <input
                    ref={licenceInput}
                    type="file"
                    accept="application/pdf,image/jpeg,image/png"
                    onChange={(event) => {
                      const file = event.target.files?.[0];
                      if (file) void upload(file, 'licence', 'professional');
                      if (licenceInput.current) licenceInput.current.value = '';
                    }}
                    className="mt-1 block w-full text-[11px] text-slate-400 file:mr-3 file:rounded-lg file:border-0 file:bg-slate-800 file:px-3 file:py-1.5 file:text-[11px] file:font-bold file:text-slate-200"
                  />
                </div>
              </div>

              <button
                type="submit"
                disabled={busy}
                className="px-5 py-2.5 rounded-xl bg-[#08D9D6] text-[#252A34] font-extrabold text-xs disabled:opacity-60"
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
