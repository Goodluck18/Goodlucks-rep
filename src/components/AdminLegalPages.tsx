import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  Bold,
  CheckCircle2,
  Clock3,
  ExternalLink,
  Eye,
  FileText,
  Heading2,
  Heading3,
  History,
  Italic,
  Link2,
  List,
  ListOrdered,
  Loader2,
  Lock,
  Pencil,
  RotateCcw,
  Save,
  ShieldCheck,
  Trash2,
} from 'lucide-react';
import { useApp } from '../context/AppContext';
import { api, messageForError } from '../services/apiService';
import type {
  AdminLegalDocument,
  AdminLegalSummary,
  LegalDocumentType,
  LegalVersionDetail,
  LegalVersionSummary,
} from '../types';

/**
 * Admin → Legal Pages (Terms and Conditions, Privacy Policy, version history).
 *
 * What this screen is allowed to do is decided by the SERVER, twice:
 *   * `can_manage_legal` — open the console, save a draft, preview, discard;
 *   * `can_publish_legal` — publish, restore an older version, switch the
 *     re-acceptance prompt.
 * Both default to deny and are granted only from the server console
 * (`php-backend/grant_legal.php`). Hiding a button here is a convenience; the
 * endpoints refuse an unauthorised administrator regardless.
 *
 * The workflow is deliberately draft-first:
 *   edit → Save Draft (public page unchanged) → Preview (renders as public,
 *   still nothing live) → Publish (confirmed, versioned, audited).
 * There is no auto-publish anywhere in this component.
 */

const DOCUMENTS: Array<{ type: LegalDocumentType; label: string; slug: string }> = [
  { type: 'terms', label: 'Terms and Conditions', slug: 'terms-and-conditions' },
  { type: 'privacy', label: 'Privacy Policy', slug: 'privacy-policy' },
];

type Tab = 'terms' | 'privacy' | 'history';

type PendingAction =
  | { kind: 'publish' }
  | { kind: 'restore'; version: number }
  | { kind: 'discard' }
  | null;

const formatDate = (value?: string | null): string => {
  if (!value) return '—';
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime())
    ? value
    : parsed.toLocaleString(undefined, {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      });
};

const statusTone = (status: string): string =>
  status === 'published'
    ? 'bg-emerald-500/15 text-emerald-700 border border-emerald-500/30'
    : status === 'draft'
      ? 'bg-amber-500/15 text-amber-800 border border-amber-500/30'
      : 'bg-page text-ink/60 border border-line';

/** The toolbar buttons. `execCommand` is what the blog editor uses too. */
const TOOLBAR: Array<{ command: string; value?: string; label: string; Icon: React.ComponentType<{ className?: string }> }> = [
  { command: 'formatBlock', value: 'H2', label: 'Section heading', Icon: Heading2 },
  { command: 'formatBlock', value: 'H3', label: 'Sub-heading', Icon: Heading3 },
  { command: 'bold', label: 'Bold', Icon: Bold },
  { command: 'italic', label: 'Italic', Icon: Italic },
  { command: 'insertUnorderedList', label: 'Bulleted list', Icon: List },
  { command: 'insertOrderedList', label: 'Numbered list', Icon: ListOrdered },
];

export const AdminLegalPages: React.FC = () => {
  const { currentUser, showSuccessToast, showErrorToast } = useApp();

  const [tab, setTab] = useState<Tab>('terms');
  const [summaries, setSummaries] = useState<AdminLegalSummary[]>([]);
  const [capabilities, setCapabilities] = useState({ manageLegal: false, publishLegal: false });
  const [reacceptance, setReacceptance] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  // Named `legalDocument`, never `document`: the editor calls window.document.execCommand.
  const [legalDocument, setLegalDocument] = useState<AdminLegalDocument | null>(null);
  const [content, setContent] = useState('');
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);

  const [preview, setPreview] = useState<{ title: string; contentHtml: string } | null>(null);
  const [reviewVersion, setReviewVersion] = useState<LegalVersionDetail | null>(null);
  const [pending, setPending] = useState<PendingAction>(null);
  const [changeNote, setChangeNote] = useState('');
  const [effectiveAt, setEffectiveAt] = useState('');

  const editorRef = useRef<HTMLDivElement | null>(null);
  const activeType: LegalDocumentType = tab === 'privacy' ? 'privacy' : 'terms';

  const loadIndex = useCallback(async () => {
    try {
      const result = await api.adminLegalDocuments();
      setSummaries(result.documents);
      setCapabilities(result.capabilities);
      setReacceptance(result.reacceptanceRequired);
      setLoadError(null);
    } catch (error) {
      setLoadError(messageForError(error));
    } finally {
      setLoading(false);
    }
  }, []);

  const loadDocument = useCallback(async (type: LegalDocumentType) => {
    setBusy('load');
    try {
      const result = await api.adminLegalDocument(type);
      setLegalDocument(result.document);
      // A saved draft is what an administrator continues from; otherwise the
      // editor starts from the text the public is reading right now.
      const starting = result.document.draft?.contentHtml ?? result.document.published?.contentHtml ?? '';
      setContent(starting);
      setDirty(false);
      if (editorRef.current && editorRef.current.innerHTML !== starting) {
        editorRef.current.innerHTML = starting;
      }
      setLoadError(null);
    } catch (error) {
      setLoadError(messageForError(error));
    } finally {
      setBusy(null);
    }
  }, []);

  useEffect(() => {
    void loadIndex();
  }, [loadIndex]);

  useEffect(() => {
    if (tab === 'history') return;
    void loadDocument(tab);
  }, [tab, loadDocument]);

  // Keep the editable surface in step with a fresh load without resetting the
  // caret on every keystroke.
  useEffect(() => {
    if (editorRef.current && legalDocument && editorRef.current.innerHTML !== content && !dirty) {
      editorRef.current.innerHTML = content;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [legalDocument?.type, legalDocument?.published?.id, legalDocument?.draft?.id]);

  const exec = (command: string, value?: string) => {
    editorRef.current?.focus();
    document.execCommand(command, false, value);
    setContent(editorRef.current?.innerHTML ?? '');
    setDirty(true);
  };

  const insertLink = () => {
    const href = window.prompt('Link address (start with / for a page on this site, or https://…)');
    if (!href) return;
    const text = window.prompt('Link text', href) || href;
    editorRef.current?.focus();
    document.execCommand(
      'insertHTML',
      false,
      `<a href="${href.replace(/"/g, '&quot;')}">${text.replace(/</g, '&lt;')}</a>`
    );
    setContent(editorRef.current?.innerHTML ?? '');
    setDirty(true);
  };

  const canManage = capabilities.manageLegal;
  const canPublish = capabilities.publishLegal;

  const saveDraft = async () => {
    setBusy('save');
    try {
      await api.adminLegalSaveDraft(activeType, content);
      setDirty(false);
      await Promise.all([loadDocument(activeType), loadIndex()]);
      showSuccessToast('Draft saved', 'The public page has not changed.');
    } catch (error) {
      showErrorToast('Could not save the draft', messageForError(error));
    } finally {
      setBusy(null);
    }
  };

  const openPreview = async () => {
    setBusy('preview');
    try {
      const result = await api.adminLegalPreview(activeType, content);
      setPreview({ title: result.preview.title, contentHtml: result.preview.contentHtml });
    } catch (error) {
      showErrorToast('Could not build the preview', messageForError(error));
    } finally {
      setBusy(null);
    }
  };

  const confirmAction = async () => {
    if (!pending) return;
    setBusy(pending.kind);
    try {
      if (pending.kind === 'publish') {
        const result = await api.adminLegalPublish(activeType, {
          confirm: true,
          changeNote: changeNote.trim() || undefined,
          effectiveAt: effectiveAt ? new Date(effectiveAt).toISOString() : undefined,
        });
        showSuccessToast('Published', result.message);
      } else if (pending.kind === 'restore') {
        const result = await api.adminLegalRestore(activeType, {
          version: pending.version,
          confirm: true,
          changeNote: changeNote.trim() || undefined,
        });
        showSuccessToast('Version restored', result.message);
      } else {
        const result = await api.adminLegalDiscardDraft(activeType);
        showSuccessToast('Draft discarded', result.message);
      }
      setPending(null);
      setChangeNote('');
      setEffectiveAt('');
      await Promise.all([loadDocument(activeType), loadIndex()]);
    } catch (error) {
      showErrorToast('That action was refused', messageForError(error));
    } finally {
      setBusy(null);
    }
  };

  const reviewStoredVersion = async (version: number) => {
    setBusy(`version-${version}`);
    try {
      const result = await api.adminLegalVersion(activeType, version);
      setReviewVersion(result.version);
    } catch (error) {
      showErrorToast('Could not open that version', messageForError(error));
    } finally {
      setBusy(null);
    }
  };

  const toggleReacceptance = async (next: boolean) => {
    setBusy('reacceptance');
    try {
      const result = await api.adminLegalSetReacceptance(next);
      setReacceptance(result.reacceptanceRequired);
      showSuccessToast('Saved', result.message);
    } catch (error) {
      showErrorToast('Could not change the prompt', messageForError(error));
    } finally {
      setBusy(null);
    }
  };

  const published = legalDocument?.published ?? null;
  const draft = legalDocument?.draft ?? null;
  const versions: LegalVersionSummary[] = useMemo(() => legalDocument?.versions ?? [], [legalDocument]);

  if (loading) {
    return (
      <div className="flex items-center gap-3 text-sm text-ink/70 py-12 justify-center">
        <Loader2 className="w-4 h-4 animate-spin" /> Loading the legal documents…
      </div>
    );
  }

  if (loadError && summaries.length === 0) {
    return (
      <div className="gl-alert gl-alert-error">
        <AlertTriangle className="w-4 h-4" />
        <div>
          <p className="font-semibold">The Legal Pages console is unavailable.</p>
          <p className="text-xs mt-1">{loadError}</p>
        </div>
      </div>
    );
  }

  if (!canManage) {
    return (
      <div className="gl-card p-5">
        <div className="flex items-start gap-3">
          <Lock className="w-5 h-5 text-ink/60 mt-0.5" />
          <div>
            <h3 className="font-bold text-ink">Legal Pages is restricted</h3>
            <p className="text-sm text-ink/70 mt-1">
              Editing or publishing the Terms and Conditions and the Privacy Policy requires the legal-pages
              capability. Ask a server administrator to grant it with{' '}
              <code className="text-xs bg-page px-1 rounded">grant_legal.php</code>. Reading the public pages needs no
              permission at all: they are open to everyone.
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              {DOCUMENTS.map((doc) => (
                <a key={doc.type} href={`/${doc.slug}`} target="_blank" rel="noopener noreferrer" className="gl-btn gl-btn-secondary text-xs">
                  <ExternalLink className="w-3.5 h-3.5" /> View {doc.label}
                </a>
              ))}
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* Heading */}
      <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-3">
        <div>
          <h2 className="text-lg font-black text-ink flex items-center gap-2">
            <ShieldCheck className="w-5 h-5" /> Legal Pages
          </h2>
          <p className="text-xs text-ink/70 mt-1 max-w-2xl">
            Edit the Terms and Conditions and the Privacy Policy here. Saving a draft never changes the public page;
            publishing creates a new version, records who published it and when, and updates the page immediately. The
            URLs never change.
          </p>
        </div>
        <div className="flex flex-wrap gap-2 text-[11px]">
          <span className={`px-2.5 py-1 rounded-full ${canManage ? 'bg-emerald-500/15 text-emerald-700' : 'bg-page text-ink/60'}`}>
            {canManage ? 'Can edit drafts' : 'Read only'}
          </span>
          <span className={`px-2.5 py-1 rounded-full ${canPublish ? 'bg-emerald-500/15 text-emerald-700' : 'bg-page text-ink/60'}`}>
            {canPublish ? 'Can publish' : 'Cannot publish'}
          </span>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex flex-wrap gap-2">
        {DOCUMENTS.map((doc) => {
          const summary = summaries.find((s) => s.type === doc.type);
          return (
            <button
              key={doc.type}
              type="button"
              onClick={() => setTab(doc.type)}
              className={`gl-tab ${tab === doc.type ? 'gl-tab-active' : ''}`}
            >
              <FileText className="w-4 h-4" /> {doc.label}
              {summary?.hasDraft && <span className="ml-1 w-2 h-2 rounded-full bg-amber-500 inline-block" title="Unpublished draft" />}
            </button>
          );
        })}
        <button
          type="button"
          onClick={() => setTab('history')}
          className={`gl-tab ${tab === 'history' ? 'gl-tab-active' : ''}`}
        >
          <History className="w-4 h-4" /> Version History
        </button>
      </div>

      {loadError && (
        <div className="gl-alert gl-alert-error">
          <AlertTriangle className="w-4 h-4" />
          <span className="text-xs">{loadError}</span>
        </div>
      )}

      {/* Editor */}
      {tab !== 'history' && (
        <div className="grid gap-5 xl:grid-cols-3">
          <div className="xl:col-span-2 space-y-3">
            <div className="gl-card p-3 sm:p-4">
              <div className="flex flex-wrap items-center gap-1.5 border-b border-line pb-3 mb-3">
                {TOOLBAR.map(({ command, value, label, Icon }) => (
                  <button
                    key={label}
                    type="button"
                    title={label}
                    aria-label={label}
                    disabled={!canManage}
                    onClick={() => exec(command, value)}
                    className="p-2 rounded-lg border border-line bg-surface text-ink hover:bg-page transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    <Icon className="w-4 h-4" />
                  </button>
                ))}
                <button
                  type="button"
                  title="Link"
                  aria-label="Link"
                  disabled={!canManage}
                  onClick={insertLink}
                  className="p-2 rounded-lg border border-line bg-surface text-ink hover:bg-page transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  <Link2 className="w-4 h-4" />
                </button>
                <span className="ml-auto text-[11px] text-ink/60">
                  {dirty ? 'Unsaved changes' : 'Saved'}
                </span>
              </div>

              <div
                ref={editorRef}
                contentEditable={canManage}
                suppressContentEditableWarning
                role="textbox"
                aria-multiline="true"
                aria-label={`${tab === 'privacy' ? 'Privacy Policy' : 'Terms and Conditions'} content`}
                data-testid="legal-editor"
                onInput={(event) => {
                  setContent((event.target as HTMLDivElement).innerHTML);
                  setDirty(true);
                }}
                onBlur={(event) => setContent((event.target as HTMLDivElement).innerHTML)}
                className="gl-article gl-legal min-h-[420px] max-h-[65vh] overflow-y-auto rounded-xl border border-line bg-surface p-4 focus:outline-none focus:ring-2 focus:ring-interactive/40"
              />
            </div>

            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={saveDraft}
                disabled={!canManage || busy !== null || !dirty}
                className="gl-btn gl-btn-secondary text-sm"
              >
                {busy === 'save' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                Save Draft
              </button>
              <button type="button" onClick={openPreview} disabled={busy !== null} className="gl-btn gl-btn-ghost text-sm">
                {busy === 'preview' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Eye className="w-4 h-4" />}
                Preview
              </button>
              <button
                type="button"
                onClick={() => setPending({ kind: 'publish' })}
                disabled={!canPublish || !draft || busy !== null}
                title={!draft ? 'Save a draft first' : undefined}
                className="gl-btn gl-btn-primary text-sm"
              >
                <CheckCircle2 className="w-4 h-4" /> Publish
              </button>
              <a href={`/${DOCUMENTS.find((d) => d.type === activeType)?.slug}`} target="_blank" rel="noopener noreferrer" className="gl-btn gl-btn-ghost text-sm">
                <ExternalLink className="w-4 h-4" /> View Published Version
              </a>
              {draft && (
                <button
                  type="button"
                  onClick={() => setPending({ kind: 'discard' })}
                  disabled={!canManage || busy !== null}
                  className="gl-btn gl-btn-ghost text-sm text-accent-text"
                >
                  <Trash2 className="w-4 h-4" /> Discard Draft
                </button>
              )}
            </div>

            {!draft && (
              <p className="text-[11px] text-ink/60">
                There is no draft yet. Editing and saving creates one; nothing is published until you press Publish.
              </p>
            )}
          </div>

          {/* Side panel: what is live, what is pending */}
          <div className="space-y-3">
            <div className="gl-card p-4">
              <h3 className="text-xs font-extrabold uppercase tracking-wide text-ink/60">Live now</h3>
              {published ? (
                <div className="mt-2 space-y-1 text-sm">
                  <p className="font-bold text-ink">Version {published.version}</p>
                  <p className="text-xs text-ink/70">Effective {formatDate(published.effectiveAt)}</p>
                  <p className="text-xs text-ink/70">Published by {published.publishedByName || '—'}</p>
                  <p className="text-xs text-ink/70">{formatDate(published.publishedAt)}</p>
                </div>
              ) : (
                <p className="text-sm text-ink/70 mt-2">Nothing is published yet — the public page shows an error.</p>
              )}
            </div>

            <div className="gl-card p-4">
              <h3 className="text-xs font-extrabold uppercase tracking-wide text-ink/60">Draft</h3>
              {draft ? (
                <div className="mt-2 space-y-1 text-sm">
                  <p className="font-bold text-ink">Version {draft.version}</p>
                  <p className="text-xs text-ink/70">Last saved {formatDate(draft.createdAt)}</p>
                  <p className="text-xs text-ink/70">by {draft.createdByName || '—'}</p>
                </div>
              ) : (
                <p className="text-sm text-ink/70 mt-2">No unpublished changes.</p>
              )}
            </div>

            <div className="gl-card p-4">
              <h3 className="text-xs font-extrabold uppercase tracking-wide text-ink/60">Acceptance prompt</h3>
              <label className="mt-2 flex items-start gap-2 text-sm text-ink">
                <input
                  type="checkbox"
                  checked={reacceptance}
                  disabled={!canPublish || busy !== null}
                  onChange={(event) => void toggleReacceptance(event.target.checked)}
                  className="mt-0.5 h-4 w-4 accent-interactive"
                />
                <span>
                  Ask account holders to accept the current Terms
                  <span className="block text-[11px] text-ink/60 mt-1">
                    Off by default. Publishing a new version does not switch this on, and publishing a new Privacy
                    Policy is never treated as acceptance.
                  </span>
                </span>
              </label>
            </div>

            <div className="gl-card p-4">
              <h3 className="text-xs font-extrabold uppercase tracking-wide text-ink/60">How publishing behaves</h3>
              <ul className="mt-2 space-y-1.5 text-[11px] text-ink/70 list-disc pl-4">
                <li>Drafts are private: no public URL and no public API serves one.</li>
                <li>Publishing keeps the previous version, whole, in the history.</li>
                <li>Restoring an old version publishes a NEW version that copies it.</li>
                <li>Every save, publish and restore is written to the audit log.</li>
              </ul>
            </div>
          </div>
        </div>
      )}

      {/* Version history */}
      {tab === 'history' && (
        <div className="space-y-4">
          <VersionHistoryTable
            document={legalDocument}
            canPublish={canPublish}
            busy={busy}
            onReview={reviewStoredVersion}
            onRestore={(version) => setPending({ kind: 'restore', version })}
          />
        </div>
      )}

      {/* Preview modal */}
      {preview && (
        <Modal title="Preview — not published" onClose={() => setPreview(null)}>
          <p className="text-[11px] text-ink/60 mb-3">
            This is exactly how the page would render. Nothing has been saved or published by opening this preview.
          </p>
          <div className="gl-article gl-legal max-h-[60vh] overflow-y-auto" dangerouslySetInnerHTML={{ __html: preview.contentHtml }} />
        </Modal>
      )}

      {/* Stored version modal */}
      {reviewVersion && (
        <Modal title={`Version ${reviewVersion.version} — ${reviewVersion.status}`} onClose={() => setReviewVersion(null)}>
          <div className="flex flex-wrap gap-3 text-[11px] text-ink/60 mb-3">
            <span>Effective {formatDate(reviewVersion.effectiveAt)}</span>
            <span>Published by {reviewVersion.publishedByName || '—'}</span>
            {reviewVersion.restoredFromVersion && <span>Restored from v{reviewVersion.restoredFromVersion}</span>}
          </div>
          {reviewVersion.changeNote && (
            <p className="text-xs text-ink/70 mb-3">
              <span className="font-semibold">Note:</span> {reviewVersion.changeNote}
            </p>
          )}
          <div className="gl-article gl-legal max-h-[60vh] overflow-y-auto" dangerouslySetInnerHTML={{ __html: reviewVersion.contentHtml }} />
        </Modal>
      )}

      {/* Confirmation modal */}
      {pending && (
        <Modal
          title={
            pending.kind === 'publish'
              ? 'Publish this version?'
              : pending.kind === 'restore'
                ? `Restore version ${pending.version}?`
                : 'Discard the draft?'
          }
          onClose={() => setPending(null)}
        >
          {pending.kind === 'publish' && (
            <p className="text-sm text-ink/70">
              Version {draft?.version ?? ''} will become the public{' '}
              {activeType === 'privacy' ? 'Privacy Policy' : 'Terms and Conditions'} immediately. The version that is
              live now is kept in the history, and any account holder who already accepted an older version keeps that
              record.
            </p>
          )}
          {pending.kind === 'restore' && (
            <p className="text-sm text-ink/70">
              A NEW version will be published with the content of version {pending.version}. Nothing in the history is
              overwritten, and the restoration is recorded with your name and the time.
            </p>
          )}
          {pending.kind === 'discard' && (
            <p className="text-sm text-ink/70">
              The unpublished draft will be removed. The published version stays exactly as it is.
            </p>
          )}

          {pending.kind !== 'discard' && (
            <div className="mt-4 space-y-3">
              <div>
                <label className="gl-label" htmlFor="legal-change-note">
                  Note for the history <span className="text-ink/50 font-normal">(optional)</span>
                </label>
                <input
                  id="legal-change-note"
                  value={changeNote}
                  onChange={(event) => setChangeNote(event.target.value)}
                  maxLength={500}
                  placeholder={pending.kind === 'restore' ? 'Why this version is being restored' : 'What changed'}
                  className="gl-input text-sm"
                />
              </div>
              {pending.kind === 'publish' && (
                <div>
                  <label className="gl-label" htmlFor="legal-effective-date">
                    Effective date <span className="text-ink/50 font-normal">(defaults to now)</span>
                  </label>
                  <input
                    id="legal-effective-date"
                    type="datetime-local"
                    value={effectiveAt}
                    max={new Date().toISOString().slice(0, 16)}
                    onChange={(event) => setEffectiveAt(event.target.value)}
                    className="gl-input text-sm"
                  />
                  <p className="text-[11px] text-ink/60 mt-1">
                    Publishing makes the version live immediately, so a future date is refused.
                  </p>
                </div>
              )}
            </div>
          )}

          <div className="mt-5 flex flex-wrap justify-end gap-2">
            <button type="button" onClick={() => setPending(null)} className="gl-btn gl-btn-ghost text-sm">
              Cancel
            </button>
            <button
              type="button"
              onClick={confirmAction}
              disabled={busy !== null}
              className={`gl-btn text-sm ${pending.kind === 'discard' ? 'gl-btn-ghost text-accent-text' : 'gl-btn-primary'}`}
            >
              {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : pending.kind === 'publish' ? <CheckCircle2 className="w-4 h-4" /> : <RotateCcw className="w-4 h-4" />}
              {pending.kind === 'publish' ? 'Publish now' : pending.kind === 'restore' ? 'Restore and publish' : 'Discard draft'}
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
};

/* -------------------------------------------------------------------------- */
/* Small pieces                                                               */
/* -------------------------------------------------------------------------- */

const Modal: React.FC<{ title: string; onClose: () => void; children: React.ReactNode }> = ({ title, onClose, children }) => (
  <div className="fixed inset-0 z-50 bg-ink/50 backdrop-blur-sm p-3 sm:p-6 overflow-y-auto" role="dialog" aria-modal="true" aria-label={title}>
    <div className="mx-auto max-w-3xl bg-surface border border-line rounded-2xl shadow-lg p-4 sm:p-6 my-6">
      <div className="flex items-start justify-between gap-3 border-b border-line pb-3 mb-3">
        <h3 className="font-bold text-ink">{title}</h3>
        <button type="button" onClick={onClose} className="text-xs font-semibold text-ink/60 hover:text-ink px-2 py-1 rounded-lg hover:bg-page">
          Close
        </button>
      </div>
      {children}
    </div>
  </div>
);

const VersionHistoryTable: React.FC<{
  document: AdminLegalDocument | null;
  canPublish: boolean;
  busy: string | null;
  onReview: (version: number) => void;
  onRestore: (version: number) => void;
}> = ({ document: historyDocument, canPublish, busy, onReview, onRestore }) => {
  const versions = historyDocument?.versions ?? [];
  if (versions.length === 0) {
    return <p className="text-sm text-ink/70">No versions yet.</p>;
  }

  return (
    <div className="gl-card p-4 overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left text-[11px] uppercase tracking-wide text-ink/60 border-b border-line">
            <th className="py-2 pr-3">Version</th>
            <th className="py-2 pr-3">Status</th>
            {/* The date and author columns are dropped on a narrow screen rather
                than forcing the table wider than the phone. */}
            <th className="py-2 pr-3 hidden md:table-cell">Effective</th>
            <th className="py-2 pr-3 hidden lg:table-cell">Published by</th>
            <th className="py-2 pr-3 hidden sm:table-cell">When</th>
            <th className="py-2 pr-3">Note</th>
            <th className="py-2">Actions</th>
          </tr>
        </thead>
        <tbody>
          {versions.map((version) => (
            <tr key={version.id} className="border-b border-line/70 last:border-0 align-top">
              <td className="py-2.5 pr-3 font-bold text-ink">
                v{version.version}
                {version.restoredFromVersion ? (
                  <span className="block text-[10px] font-normal text-ink/60">restored from v{version.restoredFromVersion}</span>
                ) : null}
              </td>
              <td className="py-2.5 pr-3">
                <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase ${statusTone(version.status)}`}>
                  {version.status}
                </span>
              </td>
              <td className="py-2.5 pr-3 text-xs text-ink/70 hidden md:table-cell">{formatDate(version.effectiveAt)}</td>
              <td className="py-2.5 pr-3 text-xs text-ink/70 hidden lg:table-cell">
                {version.publishedByName || (version.status === 'draft' ? version.createdByName || '—' : '—')}
              </td>
              <td className="py-2.5 pr-3 text-xs text-ink/70 hidden sm:table-cell">
                {formatDate(version.publishedAt ?? version.createdAt)}
              </td>
              <td className="py-2.5 pr-3 text-xs text-ink/70 max-w-[160px] sm:max-w-[220px] break-words">
                {version.changeNote || '—'}
              </td>
              <td className="py-2.5">
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => onReview(version.version)}
                    disabled={busy !== null}
                    className="text-[11px] font-semibold text-ink underline decoration-1 underline-offset-2"
                  >
                    {busy === `version-${version.version}` ? 'Opening…' : 'View'}
                  </button>
                  {version.status === 'superseded' && (
                    <button
                      type="button"
                      onClick={() => onRestore(version.version)}
                      disabled={!canPublish || busy !== null}
                      title={!canPublish ? 'Publishing requires the legal-publish capability' : undefined}
                      className="text-[11px] font-semibold text-ink underline decoration-1 underline-offset-2 disabled:text-ink/40 disabled:no-underline"
                    >
                      Restore
                    </button>
                  )}
                  {version.status === 'published' && (
                    <span className="text-[11px] text-emerald-700 font-semibold inline-flex items-center gap-1">
                      <CheckCircle2 className="w-3 h-3" /> live
                    </span>
                  )}
                  {version.status === 'draft' && (
                    <span className="text-[11px] text-amber-700 font-semibold inline-flex items-center gap-1">
                      <Clock3 className="w-3 h-3" /> not public
                    </span>
                  )}
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="text-[11px] text-ink/60 mt-3 flex items-center gap-1.5">
        <Pencil className="w-3 h-3" /> The published version cannot be edited in place: publishing a change creates a
        new version, so history and accepted versions stay truthful.
      </p>
    </div>
  );
};
