import React, { useCallback, useEffect, useRef, useState } from 'react';
import { AlertCircle, CheckCircle2, Link2, Loader2, Mail, RefreshCw, Send } from 'lucide-react';
import { api, messageForError } from '../services/apiService';
import { AdminCampaign, AdminCampaignSummary, BlogPostSummary, Property } from '../types';
import { useApp } from '../context/AppContext';

const AUDIENCES: Array<{ value: string; label: string; hint: string }> = [
  { value: 'all', label: 'Everyone', hint: 'Tenants, landlords, agents and administrators' },
  { value: 'tenants', label: 'Tenants', hint: 'Accounts looking for a home' },
  { value: 'landlords', label: 'Landlords', hint: 'Accounts that own listings' },
  { value: 'agents', label: 'Agents', hint: 'Registered agents' },
  { value: 'providers', label: 'Agents and landlords', hint: 'Everyone who provides listings' },
  { value: 'admins', label: 'Administrators', hint: 'Staff accounts' },
];

const KINDS: Array<{ value: 'marketing' | 'service'; label: string; hint: string }> = [
  {
    value: 'marketing',
    label: 'Marketing',
    hint: 'Only reaches addresses that have opted in. Every message carries an unsubscribe link.',
  },
  {
    value: 'service',
    label: 'Service notice',
    hint: 'Account, security or policy news. Reaches every account in the audience and still carries the preferences link.',
  },
];

const STATUS_LABEL: Record<string, string> = {
  draft: 'Draft',
  queued: 'Queued',
  sent: 'Sent',
  partly_failed: 'Partly failed',
};

/**
 * Bulk email (Upgrade 2, A12).
 *
 * The composer writes a draft. Nothing is sent from the browser: queueing turns
 * the draft into one `email_outbox` row per recipient — one address per message,
 * never a list — and the existing outbox worker delivers them with its existing
 * retry ladder. The table below reads the real delivery state back from those
 * rows, so "sent" and "failed" mean what they say.
 *
 * Marketing is opt-in. The recipient counter is the server's answer, computed
 * before anything is written, and it says how many addresses were skipped
 * because they have not opted in.
 */
export const AdminBulkEmail: React.FC = () => {
  const { showSuccessToast, showErrorToast } = useApp();

  const [audience, setAudience] = useState('all');
  const [kind, setKind] = useState<'marketing' | 'service'>('marketing');
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [preview, setPreview] = useState<{ total: number; excludedUnsubscribed: number }>({
    total: 0,
    excludedUnsubscribed: 0,
  });
  const [campaigns, setCampaigns] = useState<AdminCampaign[]>([]);
  const [selected, setSelected] = useState<AdminCampaignSummary | null>(null);
  const [busy, setBusy] = useState<'save' | 'queue' | 'retry' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [loadingCampaigns, setLoadingCampaigns] = useState(true);

  // Link insertion helpers.
  const [linkSearch, setLinkSearch] = useState('');
  const [linkResults, setLinkResults] = useState<Array<{ label: string; url: string; kind: string }>>([]);
  const [linkLoading, setLinkLoading] = useState(false);
  const bodyRef = useRef<HTMLTextAreaElement | null>(null);

  const loadCampaigns = useCallback(async () => {
    setLoadingCampaigns(true);
    try {
      const result = await api.listCampaigns();
      setCampaigns(result.campaigns ?? []);
    } catch (err) {
      setError(messageForError(err));
    } finally {
      setLoadingCampaigns(false);
    }
  }, []);

  const loadPreview = useCallback(async () => {
    try {
      const result = await api.previewCampaign({ audience, kind });
      setPreview({ total: result.total, excludedUnsubscribed: result.excludedUnsubscribed });
    } catch {
      // A preview that cannot be read must not block the composer; the queue
      // step re-checks and refuses with a real message.
    }
  }, [audience, kind]);

  useEffect(() => {
    void loadCampaigns();
  }, [loadCampaigns]);

  useEffect(() => {
    void loadPreview();
  }, [loadPreview]);

  const insertAtCursor = (text: string) => {
    const element = bodyRef.current;
    if (!element) {
      setBody((current) => current + text);
      return;
    }
    const start = element.selectionStart ?? body.length;
    const end = element.selectionEnd ?? body.length;
    const next = body.slice(0, start) + text + body.slice(end);
    setBody(next);
    requestAnimationFrame(() => {
      element.focus();
      element.selectionStart = start + text.length;
      element.selectionEnd = start + text.length;
    });
  };

  const searchLinks = async (query: string) => {
    setLinkSearch(query);
    if (query.trim().length < 2) {
      setLinkResults([]);
      return;
    }
    setLinkLoading(true);
    try {
      const [propertiesResponse, blogResponse] = await Promise.all([
        api.adminProperties({ q: query.trim(), perPage: 5 }).catch(() => ({ properties: [] as Property[] })),
        api.adminBlogPosts({ status: 'published', perPage: 50 }).catch(() => ({ posts: [] as BlogPostSummary[] })),
      ]);

      const needle = query.trim().toLowerCase();
      const propertyResults = (propertiesResponse.properties ?? [])
        .filter((property) => property.title.toLowerCase().includes(needle))
        .slice(0, 5)
        .map((property) => ({
          label: property.title,
          url: `/property/${property.id}`,
          kind: 'Listing',
        }));

      const blogResults = (blogResponse.posts ?? [])
        .filter((post) => post.title.toLowerCase().includes(needle))
        .slice(0, 5)
        .map((post) => ({
          label: post.title,
          url: post.url,
          kind: 'Article',
        }));

      setLinkResults([...propertyResults, ...blogResults]);
    } catch {
      setLinkResults([]);
    } finally {
      setLinkLoading(false);
    }
  };

  const saveDraft = async (): Promise<string | null> => {
    setFieldErrors({});
    setError(null);
    setBusy('save');
    try {
      const result = await api.createCampaign({ subject, body, audience, kind });
      setSubject('');
      setBody('');
      await loadCampaigns();
      setSelected(await api.getCampaign(result.campaign.id));
      showSuccessToast('Draft saved', 'Nothing has been sent yet.');
      return result.campaign.id;
    } catch (err) {
      const problems = (err as { fields?: Record<string, string> }).fields;
      if (problems) setFieldErrors(problems);
      const message = messageForError(err);
      setError(message);
      showErrorToast('Could not save the draft', message);
      return null;
    } finally {
      setBusy(null);
    }
  };

  const queueNow = async () => {
    const id = await saveDraft();
    if (!id) return;
    setBusy('queue');
    try {
      const summary = await api.queueCampaign(id);
      setSelected(summary);
      await loadCampaigns();
      showSuccessToast('Queued', `One message per recipient is on its way (${summary.counts.total}).`);
    } catch (err) {
      const problems = (err as { fields?: Record<string, string> }).fields;
      if (problems) setFieldErrors(problems);
      const message = messageForError(err);
      setError(message);
      showErrorToast('Could not queue the campaign', message);
    } finally {
      setBusy(null);
    }
  };

  const retryFailed = async (id: string) => {
    setBusy('retry');
    try {
      const summary = await api.retryCampaign(id);
      setSelected(summary);
      await loadCampaigns();
      showSuccessToast('Requeued', 'The failed messages are back in the queue.');
    } catch (err) {
      const message = messageForError(err);
      setError(message);
      showErrorToast('Could not requeue', message);
    } finally {
      setBusy(null);
    }
  };

  const openCampaign = async (id: string) => {
    try {
      setSelected(await api.getCampaign(id));
    } catch (err) {
      setError(messageForError(err));
    }
  };

  return (
    <div className="grid lg:grid-cols-2 gap-4">
      <div className="gl-card p-5 space-y-4">
        <div className="flex items-center gap-2">
          <Mail className="w-5 h-5 text-accent" />
          <h3 className="text-sm font-bold text-ink">Write a message</h3>
        </div>

        <div className="space-y-1">
          <label htmlFor="campaign-audience" className="text-xs font-bold text-ink">Audience</label>
          <select
            id="campaign-audience"
            value={audience}
            onChange={(event) => setAudience(event.target.value)}
            className="gl-input w-full"
          >
            {AUDIENCES.map((option) => (
              <option key={option.value} value={option.value}>{option.label}</option>
            ))}
          </select>
          <p className="text-xs text-ink-muted">{AUDIENCES.find((option) => option.value === audience)?.hint}</p>
        </div>

        <fieldset className="space-y-2">
          <legend className="text-xs font-bold text-ink">Type</legend>
          {KINDS.map((option) => (
            <label key={option.value} className="flex items-start gap-2 text-xs text-ink">
              <input
                type="radio"
                name="campaign-kind"
                value={option.value}
                checked={kind === option.value}
                onChange={() => setKind(option.value)}
                className="mt-0.5"
              />
              <span>
                <span className="font-bold">{option.label}</span> — {option.hint}
              </span>
            </label>
          ))}
        </fieldset>

        <div className="rounded-xl bg-surface-alt p-3 text-xs text-ink">
          <p className="font-bold">
            {preview.total} recipient{preview.total === 1 ? '' : 's'}
          </p>
          <p className="text-ink-muted">
            {kind === 'marketing'
              ? `${preview.excludedUnsubscribed} address(es) in this audience have not opted in to marketing and will be skipped.`
              : 'A service notice reaches every account in this audience; each message still carries the preferences link.'}
          </p>
        </div>

        <div className="space-y-1">
          <label htmlFor="campaign-subject" className="text-xs font-bold text-ink">Subject</label>
          <input
            id="campaign-subject"
            type="text"
            value={subject}
            onChange={(event) => setSubject(event.target.value)}
            maxLength={200}
            className="gl-input w-full"
            placeholder="New homes in East Legon this week"
          />
          {fieldErrors.subject && <p className="text-xs text-accent">{fieldErrors.subject}</p>}
        </div>

        <div className="space-y-1">
          <label htmlFor="campaign-body" className="text-xs font-bold text-ink">Message</label>
          <textarea
            id="campaign-body"
            ref={bodyRef}
            value={body}
            onChange={(event) => setBody(event.target.value)}
            rows={8}
            className="gl-input w-full font-mono text-xs"
            placeholder={'<p>Hello {{name}},</p>\n<p>Three new listings in East Legon…</p>'}
          />
          <p className="text-xs text-ink-muted">
            Basic HTML is allowed and sanitised on the server. <code>{'{{name}}'}</code> is replaced with the
            recipient&rsquo;s name.
          </p>
          {fieldErrors.body && <p className="text-xs text-accent">{fieldErrors.body}</p>}
        </div>

        <div className="space-y-2 rounded-xl border border-line p-3">
          <p className="text-xs font-bold text-ink inline-flex items-center gap-1">
            <Link2 className="w-4 h-4" /> Insert a link, a listing or an article
          </p>
          <input
            type="search"
            value={linkSearch}
            onChange={(event) => void searchLinks(event.target.value)}
            placeholder="Search listings and articles by title"
            aria-label="Search listings and articles to link"
            className="gl-input w-full text-xs"
          />
          {linkLoading && <p className="text-xs text-ink-muted">Searching…</p>}
          {linkResults.length > 0 && (
            <ul className="space-y-1">
              {linkResults.map((result) => (
                <li key={`${result.kind}-${result.url}`}>
                  <button
                    type="button"
                    onClick={() => {
                      insertAtCursor(`<p><a href="${result.url}">${result.label}</a></p>`);
                      setLinkResults([]);
                      setLinkSearch('');
                    }}
                    className="text-xs text-left w-full hover:underline"
                  >
                    <span className="text-ink">{result.label}</span>{' '}
                    <span className="text-ink-muted">· {result.kind} · {result.url}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        {error && (
          <p role="alert" className="text-xs text-accent inline-flex items-start gap-2">
            <AlertCircle className="w-4 h-4 shrink-0" /> {error}
          </p>
        )}

        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => void saveDraft()}
            disabled={busy !== null || subject.trim() === '' || body.trim() === ''}
            className="gl-button-secondary text-xs disabled:opacity-50"
          >
            {busy === 'save' ? <Loader2 className="w-4 h-4 animate-spin" /> : null} Save draft
          </button>
          <button
            type="button"
            onClick={() => void queueNow()}
            disabled={busy !== null || subject.trim() === '' || body.trim() === '' || preview.total === 0}
            className="gl-button-primary text-xs disabled:opacity-50 inline-flex items-center gap-2"
          >
            {busy === 'queue' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
            Save and queue
          </button>
        </div>
        {preview.total === 0 && (
          <p className="text-xs text-ink-muted">
            There is nobody to send to yet: no address in this audience has opted in. Switch to a service notice,
            or wait for recipients to opt in from the link in any email.
          </p>
        )}
      </div>

      <div className="space-y-4">
        <div className="gl-card p-5 space-y-3">
          <div className="flex items-center justify-between gap-2">
            <h3 className="text-sm font-bold text-ink">Campaigns</h3>
            <button type="button" onClick={() => void loadCampaigns()} className="gl-button-secondary text-xs">
              <RefreshCw className="w-4 h-4" /> Refresh
            </button>
          </div>

          {loadingCampaigns ? (
            <p className="text-xs text-ink-muted inline-flex items-center gap-2">
              <Loader2 className="w-4 h-4 animate-spin" /> Loading…
            </p>
          ) : campaigns.length === 0 ? (
            <p className="text-xs text-ink-muted">No campaign has been written yet.</p>
          ) : (
            <ul className="space-y-2">
              {campaigns.map((campaign) => (
                <li key={campaign.id}>
                  <button
                    type="button"
                    onClick={() => void openCampaign(campaign.id)}
                    className={`w-full text-left rounded-xl border p-3 hover:bg-surface-alt/60 ${
                      selected?.campaign.id === campaign.id ? 'border-accent' : 'border-line'
                    }`}
                  >
                    <p className="text-sm font-bold text-ink">{campaign.subject}</p>
                    <p className="text-xs text-ink-muted">
                      {campaign.audienceLabel} · {campaign.kind} · {STATUS_LABEL[campaign.status] ?? campaign.status} ·{' '}
                      {campaign.recipientTotal} recipient(s)
                    </p>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        {selected && (
          <div className="gl-card p-5 space-y-3">
            <div className="flex items-start justify-between gap-2">
              <div>
                <h3 className="text-sm font-bold text-ink">{selected.campaign.subject}</h3>
                <p className="text-xs text-ink-muted">
                  {selected.campaign.audienceLabel} · {selected.campaign.kind}
                </p>
              </div>
              {selected.counts.failed > 0 && (
                <button
                  type="button"
                  onClick={() => void retryFailed(selected.campaign.id)}
                  disabled={busy !== null}
                  className="gl-button-secondary text-xs inline-flex items-center gap-1 disabled:opacity-50"
                >
                  <RefreshCw className="w-4 h-4" /> Retry failed ({selected.counts.failed})
                </button>
              )}
            </div>

            <p className="text-xs text-ink-muted">
              Delivery: <span className="font-bold text-ink">{selected.deliveryStatus.replace('_', ' ')}</span>
            </p>

            <dl className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
              <div className="rounded-xl bg-surface-alt p-2">
                <dt className="text-ink-muted">Sent</dt>
                <dd className="text-base font-bold text-ink">{selected.counts.sent}</dd>
              </div>
              <div className="rounded-xl bg-surface-alt p-2">
                <dt className="text-ink-muted">Pending</dt>
                <dd className="text-base font-bold text-ink">{selected.counts.pending}</dd>
              </div>
              <div className="rounded-xl bg-surface-alt p-2">
                <dt className="text-ink-muted">Failed</dt>
                <dd className="text-base font-bold text-ink">{selected.counts.failed}</dd>
              </div>
              <div className="rounded-xl bg-surface-alt p-2">
                <dt className="text-ink-muted">Total</dt>
                <dd className="text-base font-bold text-ink">{selected.counts.total}</dd>
              </div>
            </dl>

            {selected.campaign.skippedUnsubscribed > 0 && (
              <p className="text-xs text-ink-muted">
                {selected.campaign.skippedUnsubscribed} address(es) were skipped because they have not opted in.
              </p>
            )}

            <ul className="space-y-1 max-h-64 overflow-y-auto">
              {selected.recipients.map((_recipient, index) => {
                const recipient = selected.recipients[index];
                return (
                  <li
                    key={`${recipient.email}-${index}`}
                    className="flex items-center justify-between gap-2 text-xs border-b border-line/60 py-1 last:border-0"
                  >
                    <span className="text-ink">{recipient.email}</span>
                    <span className="inline-flex items-center gap-1 text-ink-muted">
                      {recipient.status === 'sent' ? (
                        <CheckCircle2 className="w-3.5 h-3.5 text-success" />
                      ) : recipient.status === 'failed' ? (
                        <AlertCircle className="w-3.5 h-3.5 text-accent" />
                      ) : (
                        <Loader2 className="w-3.5 h-3.5" />
                      )}
                      {recipient.status}
                      {recipient.error ? ` — ${recipient.error}` : ''}
                    </span>
                  </li>
                );
              })}
            </ul>
          </div>
        )}
      </div>
    </div>
  );
};
