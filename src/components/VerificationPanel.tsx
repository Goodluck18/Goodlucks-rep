import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  AlertTriangle,
  BadgeCheck,
  CheckCircle2,
  Clock3,
  Download,
  FileText,
  Lock,
  ShieldAlert,
  Trash2,
  Upload,
  X,
} from 'lucide-react';
import { api, messageForError } from '../services/apiService';
import {
  DOCUMENT_ACCEPT,
  DOCUMENT_MAX_BYTES,
  IdentityDocumentSlot,
  formatBytes,
  identityDocumentSlots,
  identitySubmissionProblem,
  isPreviewableImage,
  validateDocumentFile,
} from '../lib/uploads';
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
type DocSlotStatus = 'ready' | 'uploading' | 'uploaded' | 'failed';

/** One file the member has chosen but not necessarily uploaded yet. */
interface DocSelection {
  file: File;
  /** Object URL for an image; null for a PDF, which gets a document icon. */
  previewUrl: string | null;
  documentId: string | null;
  status: DocSlotStatus;
  error: string | null;
}

const SLOT_STATUS_COPY: Record<DocSlotStatus, string> = {
  ready: 'Ready — uploads when you submit',
  uploading: 'Uploading…',
  uploaded: 'Uploaded — attached to this submission',
  failed: 'Upload failed — press Submit again to retry',
};

/**
 * One labelled document field: label, picker, thumbnail, filename, size, clear
 * indicator and status.
 *
 * Both identity sides render one of these side by side, so "front" and "back"
 * can never be confused for each other — which is exactly what happened when
 * the old form uploaded on selection and then immediately emptied the input.
 * The empty state is deliberately dashed and says "none selected", so a blank
 * field can never look like a chosen file.
 */
const DocumentSlotField: React.FC<{
  slotId: string;
  label: string;
  required: boolean;
  savedDocument: VerificationDocument | null;
  selection: DocSelection | null;
  disabled: boolean;
  error?: string;
  hint?: string;
  onSelect: (file: File | null) => void;
  onClear: () => void;
}> = ({ slotId, label, required, savedDocument, selection, disabled, error, hint, onSelect, onClear }) => {
  const inputId = `verification-doc-${slotId}`;
  const busyUploading = selection?.status === 'uploading';

  return (
    <div className="min-w-0">
      <div className="flex items-baseline justify-between gap-2">
        <label htmlFor={inputId} className="block text-[11px] font-semibold text-ink/70 min-w-0">
          {label}{' '}
          {required ? (
            <span className="text-accent font-black" aria-hidden="true">
              *
            </span>
          ) : (
            <span className="text-[10px] font-normal text-ink/70">(optional)</span>
          )}
        </label>
        {savedDocument && <span className="text-[10px] font-bold text-emerald-700 shrink-0">On file</span>}
      </div>

      {required && <span className="sr-only">This document is required.</span>}

      <input
        id={inputId}
        type="file"
        accept={DOCUMENT_ACCEPT}
        disabled={disabled || busyUploading}
        onChange={(event) => {
          const file = event.target.files?.[0] ?? null;
          onSelect(file);
          // Clear the native input so choosing the same file again still fires
          // a change event. The selection itself lives in React state.
          event.target.value = '';
        }}
        className="sr-only"
      />

      {selection ? (
        <div className="mt-1 rounded-xl border border-line bg-page p-2 flex items-start gap-2">
          <div className="w-12 h-12 rounded-lg overflow-hidden bg-surface border border-line shrink-0 flex items-center justify-center">
            {selection.previewUrl ? (
              <img
                src={selection.previewUrl}
                alt={`Preview of ${selection.file.name}`}
                className="w-full h-full object-cover"
              />
            ) : (
              <FileText className="w-5 h-5 text-ink/70" />
            )}
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-[11px] font-semibold text-ink truncate" title={selection.file.name}>
              {selection.file.name}
            </p>
            <p className="text-[10px] text-ink/70">{formatBytes(selection.file.size)}</p>
            <p
              role="status"
              aria-live="polite"
              className={`text-[10px] font-semibold flex items-center gap-1 ${
                selection.status === 'failed' ? 'text-ink' : selection.status === 'uploaded' ? 'text-emerald-700' : 'text-ink/70'
              }`}
            >
              {selection.status === 'uploading' && (
                <span className="w-2.5 h-2.5 border-2 border-interactive/30 border-t-interactive rounded-full animate-spin" />
              )}
              {selection.status === 'uploaded' && <CheckCircle2 className="w-3 h-3" />}
              {SLOT_STATUS_COPY[selection.status]}
            </p>
            <div className="flex flex-wrap items-center gap-3 mt-1">
              <label htmlFor={inputId} className="text-[10px] font-bold text-ink underline cursor-pointer">
                Replace
              </label>
              <button
                type="button"
                onClick={onClear}
                disabled={busyUploading}
                className="text-[10px] font-bold text-ink/70 hover:text-ink disabled:opacity-50 flex items-center gap-1 min-h-[24px]"
              >
                <X className="w-3 h-3" /> Remove
              </button>
            </div>
          </div>
        </div>
      ) : (
        <label
          htmlFor={inputId}
          className={`mt-1 flex items-center justify-center gap-2 rounded-xl border border-dashed px-3 py-3 text-[11px] font-semibold text-ink/70 bg-page cursor-pointer transition-colors min-h-[44px] ${
            disabled ? 'opacity-60 cursor-not-allowed' : 'border-line hover:border-interactive'
          }`}
        >
          <Upload className="w-3.5 h-3.5 shrink-0" />
          <span className="min-w-0 truncate">
            {savedDocument ? 'Choose a replacement — none selected' : 'Choose a file — none selected'}
          </span>
        </label>
      )}

      {hint && <p className="text-[10px] text-ink/70 mt-1">{hint}</p>}
      {(error || selection?.error) && (
        <p role="alert" className="text-[10px] text-ink mt-1 flex items-start gap-1">
          <AlertTriangle className="w-3 h-3 shrink-0 mt-0.5" />
          <span className="min-w-0 break-words">{error || selection?.error}</span>
        </p>
      )}
      {savedDocument && !selection && (
        <p className="text-[10px] text-ink/70 mt-1">
          A file is already on file for this side. Choose a new one to send it instead.
        </p>
      )}
    </div>
  );
};

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
  /**
   * Files the member has chosen for the two sides of an identity document.
   *
   * They are held here as local File objects and are NOT uploaded on selection —
   * the old form uploaded immediately and then cleared the input, which meant
   * there was nothing to preview, nothing to name, and no way to cancel. Both
   * slots are always on screen together, each with its own file, thumbnail,
   * filename and status, and nothing leaves the device until the member presses
   * "Submit for review".
   */
  const [identitySlots, setIdentitySlots] = useState<Record<IdentityDocumentSlot, DocSelection | null>>({
    front: null,
    back: null,
  });
  const objectUrls = useRef<string[]>([]);
  const submittingRef = useRef(false);

  // Professional form state (agents only)
  const [licenceNumber, setLicenceNumber] = useState('');
  const [issuingAuthority, setIssuingAuthority] = useState('');
  const [licenceCategory, setLicenceCategory] = useState('');
  const [issueDate, setIssueDate] = useState('');
  const [expiryDate, setExpiryDate] = useState('');
  const [licenceSelection, setLicenceSelection] = useState<DocSelection | null>(null);
  const [submitting, setSubmitting] = useState<'identity' | 'professional' | null>(null);

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

  // ---- choosing files -------------------------------------------------
  // A selection is validated before it is stored in state, so an oversized or
  // wrong-typed file is refused on the spot with a message under that field.

  const releasePreview = (selection: DocSelection | null) => {
    if (!selection?.previewUrl) return;
    URL.revokeObjectURL(selection.previewUrl);
    objectUrls.current = objectUrls.current.filter((url) => url !== selection.previewUrl);
  };

  useEffect(
    () => () => {
      objectUrls.current.forEach((url) => URL.revokeObjectURL(url));
      objectUrls.current = [];
    },
    []
  );

  const selectIdentityDocument = (slot: IdentityDocumentSlot, file: File | null) => {
    if (!file) return;
    setError(null);
    setNotice(null);
    const problem = validateDocumentFile(file, DOCUMENT_MAX_BYTES);
    if (problem) {
      setFieldErrors((prev) => ({ ...prev, [slot]: problem }));
      return;
    }
    const previewUrl = isPreviewableImage(file) ? URL.createObjectURL(file) : null;
    if (previewUrl) objectUrls.current.push(previewUrl);
    setIdentitySlots((prev) => {
      releasePreview(prev[slot]);
      return {
        ...prev,
        [slot]: { file, previewUrl, documentId: null, status: 'ready', error: null },
      };
    });
    setFieldErrors((prev) => ({ ...prev, [slot]: '' }));
  };

  const clearIdentityDocument = (slot: IdentityDocumentSlot) => {
    setIdentitySlots((prev) => {
      releasePreview(prev[slot]);
      return { ...prev, [slot]: null };
    });
    setFieldErrors((prev) => ({ ...prev, [slot]: '' }));
  };

  const selectLicence = (file: File | null) => {
    if (!file) return;
    setError(null);
    setNotice(null);
    const problem = validateDocumentFile(file, DOCUMENT_MAX_BYTES);
    if (problem) {
      setFieldErrors((prev) => ({ ...prev, licence: problem }));
      return;
    }
    const previewUrl = isPreviewableImage(file) ? URL.createObjectURL(file) : null;
    if (previewUrl) objectUrls.current.push(previewUrl);
    setLicenceSelection((prev) => {
      releasePreview(prev);
      return { file, previewUrl, documentId: null, status: 'ready', error: null };
    });
    setFieldErrors((prev) => ({ ...prev, licence: '' }));
  };

  const clearLicence = () => {
    setLicenceSelection((prev) => {
      releasePreview(prev);
      return null;
    });
    setFieldErrors((prev) => ({ ...prev, licence: '' }));
  };

  /**
   * Uploads ONE pending selection and records the document id on it.
   *
   * The id is remembered so a failed submission can be retried without sending
   * the same file again (the server would otherwise store a second copy), and
   * so the member's file stays attached to the form while the rest of the
   * submission is corrected.
   */
  const uploadIdentitySlot = async (slot: IdentityDocumentSlot): Promise<string> => {
    const current = identitySlots[slot];
    if (!current) throw new Error('Choose a document first.');
    if (current.documentId) return current.documentId;

    const rules = identityDocumentSlots(documentType);
    setIdentitySlots((prev) =>
      prev[slot] ? { ...prev, [slot]: { ...prev[slot]!, status: 'uploading', error: null } } : prev
    );
    try {
      const result = await api.uploadVerificationDocument(current.file, rules[slot].kind);
      setIdentitySlots((prev) =>
        prev[slot] && prev[slot]!.file === current.file
          ? { ...prev, [slot]: { ...prev[slot]!, status: 'uploaded', documentId: result.document.id, error: null } }
          : prev
      );
      return result.document.id;
    } catch (err) {
      const message = messageForError(err);
      setIdentitySlots((prev) =>
        prev[slot] ? { ...prev, [slot]: { ...prev[slot]!, status: 'failed', error: message } } : prev
      );
      throw err;
    }
  };

  const uploadLicence = async (): Promise<string> => {
    if (!licenceSelection) throw new Error('Choose a document first.');
    if (licenceSelection.documentId) return licenceSelection.documentId;
    setLicenceSelection((prev) => (prev ? { ...prev, status: 'uploading', error: null } : prev));
    try {
      const result = await api.uploadVerificationDocument(licenceSelection.file, 'licence', 'professional');
      setLicenceSelection((prev) =>
        prev ? { ...prev, status: 'uploaded', documentId: result.document.id, error: null } : prev
      );
      return result.document.id;
    } catch (err) {
      const message = messageForError(err);
      setLicenceSelection((prev) => (prev ? { ...prev, status: 'failed', error: message } : prev));
      throw err;
    }
  };

  const removeUploaded = async (document: VerificationDocument) => {
    setBusy(true);
    try {
      await api.deleteVerificationDocument(document.id);
      // `load()` re-reads the summary, so the removed document disappears from
      // "Documents on file" without any local list to keep in sync.
      await load();
      setNotice('Document removed. It is no longer attached to your verification.');
    } catch (err) {
      setError(messageForError(err));
    } finally {
      setBusy(false);
    }
  };

  const clearAllIdentitySlots = () => {
    setIdentitySlots((prev) => {
      releasePreview(prev.front);
      releasePreview(prev.back);
      return { front: null, back: null };
    });
  };

  const submitIdentity = async (event: React.FormEvent) => {
    event.preventDefault();
    // One submission at a time: a double tap on a slow connection must not
    // create two submissions or upload the same file twice.
    if (submittingRef.current) return;
    setFieldErrors({});
    setError(null);
    setNotice(null);

    const rules = identityDocumentSlots(documentType);
    const stored = (summary?.identity.documents ?? []).filter((doc) => doc.scope === 'identity');
    const replacedKinds = new Set<string>(
      (['front', 'back'] as IdentityDocumentSlot[])
        .filter((slot) => identitySlots[slot])
        .map((slot) => rules[slot].kind)
    );

    // A new file for a side replaces what a saved document of the same side
    // would have been sent as. The saved file is left in storage (nothing is
    // deleted here); it is simply not referenced by this submission.
    const keptIds = stored.filter((doc) => !replacedKinds.has(doc.kind)).map((doc) => doc.id);
    const kindsOnFile = new Set<string>([
      ...stored.filter((doc) => !replacedKinds.has(doc.kind)).map((doc) => doc.kind),
      ...replacedKinds,
    ]);

    // The same rule the server applies, so a member is never sent to a 422 for
    // half a Ghana Card.
    const missing = identitySubmissionProblem(documentType, [...kindsOnFile]);

    if (missing) {
      setFieldErrors({ documents: missing });
      return;
    }

    submittingRef.current = true;
    setSubmitting('identity');
    try {
      // Every required document is uploaded together, in this one action.
      const ids = [...keptIds];
      if (identitySlots.front) ids.push(await uploadIdentitySlot('front'));
      if (identitySlots.back) ids.push(await uploadIdentitySlot('back'));

      await api.submitIdentityVerification({
        legalName: legalName.trim(),
        documentType,
        documentNumber: documentNumber.trim(),
        documentIds: ids,
      });
      setDocumentNumber('');
      clearAllIdentitySlots();
      await load();
      setNotice('Identity submitted for review. A reviewer will check it — this does not grant any permission.');
    } catch (err) {
      // The selections stay exactly as they were, so the member can fix the
      // problem and press submit again without choosing the files a second time.
      const apiError = err as { fields?: Record<string, string> };
      setFieldErrors(apiError.fields ?? {});
      setError(messageForError(err));
    } finally {
      submittingRef.current = false;
      setSubmitting(null);
    }
  };

  const submitProfessional = async (event: React.FormEvent) => {
    event.preventDefault();
    if (submittingRef.current) return;
    setFieldErrors({});
    setError(null);
    setNotice(null);

    const stored = professional?.documents ?? [];
    const keptIds = licenceSelection ? stored.filter((doc) => doc.kind !== 'licence').map((doc) => doc.id) : stored.map((doc) => doc.id);
    if (!licenceSelection && !stored.some((doc) => doc.kind === 'licence')) {
      setFieldErrors({ licence: 'Attach your licence or registration certificate.' });
      return;
    }

    submittingRef.current = true;
    setSubmitting('professional');
    try {
      const ids = [...keptIds];
      if (licenceSelection) ids.push(await uploadLicence());

      await api.submitProfessionalAuthorisation({
        licenceNumber: licenceNumber.trim(),
        issuingAuthority: issuingAuthority.trim(),
        licenceCategory: licenceCategory.trim(),
        issueDate: issueDate || undefined,
        expiryDate: expiryDate || undefined,
        documentIds: ids,
      });
      setLicenceNumber('');
      setLicenceSelection((prev) => {
        releasePreview(prev);
        return null;
      });
      await load();
      setNotice('Authorisation submitted for review. Nothing is verified until a reviewer decides.');
    } catch (err) {
      const apiError = err as { fields?: Record<string, string> };
      setFieldErrors(apiError.fields ?? {});
      setError(messageForError(err));
    } finally {
      submittingRef.current = false;
      setSubmitting(null);
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
                <li key={doc.id} className="flex flex-wrap items-center justify-between gap-x-2 gap-y-1 text-[11px] bg-surface border border-line rounded-lg px-3 py-2">
                  <span className="flex items-center gap-2 text-ink/70 min-w-0">
                    <FileText className="w-3.5 h-3.5 text-ink/70 shrink-0" />
                    <span className="min-w-0 break-words">{doc.kindLabel}</span>
                    <span className="text-ink/70 shrink-0">{Math.round(doc.bytes / 1024)} KB</span>
                  </span>
                  <span className="flex items-center gap-3 shrink-0">
                    {doc.downloadUrl && (
                      <a href={doc.downloadUrl} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 text-ink font-bold">
                        <Download className="w-3.5 h-3.5" /> Open
                      </a>
                    )}
                    {!identityLocked && (
                      <button
                        type="button"
                        onClick={() => void removeUploaded(doc)}
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

            <div className="space-y-2">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <p className="text-[11px] font-bold uppercase tracking-wide text-ink/70">
                  {documentType === 'ghana_card' ? 'Ghana Card — both sides' : 'Document images'}
                </p>
                <p className="text-[10px] text-ink/70">
                  PDF, JPG or PNG · up to {formatBytes(DOCUMENT_MAX_BYTES)} each
                </p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <DocumentSlotField
                  slotId="front"
                  label={documentType === 'ghana_card' ? 'Ghana Card — front' : 'Document — front'}
                  required
                  savedDocument={documentsForIdentity.find((doc) => doc.kind === 'document_front') ?? null}
                  selection={identitySlots.front}
                  disabled={submitting === 'identity'}
                  error={fieldErrors.front}
                  onSelect={(file) => selectIdentityDocument('front', file)}
                  onClear={() => clearIdentityDocument('front')}
                />
                <DocumentSlotField
                  slotId="back"
                  label={documentType === 'ghana_card' ? 'Ghana Card — back' : 'Document — back'}
                  required={documentType === 'ghana_card'}
                  savedDocument={documentsForIdentity.find((doc) => doc.kind === 'document_back') ?? null}
                  selection={identitySlots.back}
                  disabled={submitting === 'identity'}
                  error={fieldErrors.back}
                  onSelect={(file) => selectIdentityDocument('back', file)}
                  onClear={() => clearIdentityDocument('back')}
                />
              </div>

              {documentType === 'ghana_card' && (
                <p className="text-[10px] text-ink/70">
                  A Ghana Card is checked from both sides, so both files are needed before this can be submitted.
                  Nothing is sent until you press Submit, and choosing a file never submits anything.
                </p>
              )}
            </div>

            {fieldErrors.documents && (
              <p role="alert" className="text-[10px] text-ink flex items-start gap-1">
                <AlertTriangle className="w-3 h-3 shrink-0 mt-0.5" />
                <span className="min-w-0 break-words">{fieldErrors.documents}</span>
              </p>
            )}

            {(identitySlots.front || identitySlots.back) && (
              <div className="rounded-xl border border-interactive/30 bg-interactive/5 p-3 space-y-1">
                <p className="text-[11px] font-bold text-ink">Check before you submit</p>
                <ul className="text-[10px] text-ink/70 space-y-0.5">
                  <li className="truncate">Front: {identitySlots.front?.file.name ?? 'not chosen yet'}</li>
                  <li className="truncate">
                    {documentType === 'ghana_card' ? 'Back' : 'Back (optional)'}:{' '}
                    {identitySlots.back?.file.name ?? 'not chosen yet'}
                  </li>
                </ul>
              </div>
            )}

            <button
              type="submit"
              disabled={busy || submitting !== null}
              className="gl-btn gl-btn-primary px-5 py-2.5 text-xs"
            >
              {submitting === 'identity' ? 'Uploading and submitting…' : 'Submit for review'}
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
                <li key={doc.id} className="flex flex-wrap items-center justify-between gap-x-2 gap-y-1 text-[11px] bg-surface border border-line rounded-lg px-3 py-2">
                  <span className="flex items-center gap-2 text-ink/70 min-w-0">
                    <FileText className="w-3.5 h-3.5 text-ink/70 shrink-0" />
                    <span className="min-w-0 break-words">{doc.kindLabel}</span>
                  </span>
                  <span className="flex items-center gap-3 shrink-0">
                    {doc.downloadUrl && (
                      <a href={doc.downloadUrl} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 text-ink font-bold">
                        <Download className="w-3.5 h-3.5" /> Open
                      </a>
                    )}
                    {professionalCanSubmit && (
                      <button
                        type="button"
                        onClick={() => void removeUploaded(doc)}
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
                <div className="min-w-0">
                  <DocumentSlotField
                    slotId="licence"
                    label="Licence / registration certificate"
                    required
                    savedDocument={(professional.documents ?? []).find((doc) => doc.kind === 'licence') ?? null}
                    selection={licenceSelection}
                    disabled={submitting === 'professional'}
                    error={fieldErrors.licence}
                    onSelect={selectLicence}
                    onClear={clearLicence}
                  />
                </div>
              </div>

              <button
                type="submit"
                disabled={busy || submitting !== null}
                className="gl-btn gl-btn-primary px-5 py-2.5 text-xs"
              >
                {submitting === 'professional' ? 'Uploading and submitting…' : 'Submit authorisation'}
              </button>
            </form>
          )}
        </div>
      )}
    </div>
  );
};
