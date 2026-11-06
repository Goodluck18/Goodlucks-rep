import React, { useCallback, useEffect, useRef, useState } from 'react';
import { api, fieldErrorsFor, messageForError } from '../services/apiService';
import type { EmailTemplate, EmailTemplateTarget } from '../types';
import {
  AlertTriangle,
  Bold,
  Check,
  ExternalLink,
  FileText,
  Italic,
  Link2,
  List,
  Loader2,
  Mail,
  Plus,
  Save,
  Search,
  Trash2,
  X,
} from 'lucide-react';

interface Props {
  notify: (kind: 'success' | 'error' | 'info', title: string, message?: string) => void;
}

/**
 * The email template editor.
 *
 * This is the ONE place email content is edited. It does not replace the
 * transactional emails — it adds a block of administrator-written content to the
 * end of a chosen email (see php-backend/lib/email_templates.php). The email's
 * own details (names, references, dates, amounts) always stay as the system
 * writes them.
 *
 * "Insert Blog Post" only ever lists PUBLISHED articles, and the server refuses
 * to save a template that links to anything else — so a customer cannot be sent
 * a link to a draft.
 */
export const AdminEmailTemplates: React.FC<Props> = ({ notify }) => {
  const [templates, setTemplates] = useState<EmailTemplate[]>([]);
  const [targets, setTargets] = useState<EmailTemplateTarget[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<EmailTemplate | 'new' | null>(null);

  const [name, setName] = useState('');
  const [targetType, setTargetType] = useState('');
  const [status, setStatus] = useState<'active' | 'inactive'>('active');
  const [saving, setSaving] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [brokenLinks, setBrokenLinks] = useState<Array<{ slug: string; status: string; title: string }>>([]);

  // The "Insert Blog Post" picker
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pickerQuery, setPickerQuery] = useState('');
  const [pickerPosts, setPickerPosts] = useState<Array<{ id: string; title: string; slug: string; url: string }>>([]);
  const [pickerLoading, setPickerLoading] = useState(false);
  const [linkText, setLinkText] = useState('');

  const bodyRef = useRef<HTMLTextAreaElement | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await api.adminEmailTemplates();
      setTemplates(result.templates ?? []);
      setTargets(result.targets ?? []);
    } catch (err) {
      setError(messageForError(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const openEditor = (template: EmailTemplate | 'new') => {
    setEditing(template);
    setFieldErrors({});
    setBrokenLinks([]);
    setPickerOpen(false);
    setLinkText('');
    if (template === 'new') {
      setName('');
      setTargetType(targets[0]?.type ?? '');
      setStatus('active');
      setPickerOpen(false);
    } else {
      setName(template.name);
      setTargetType(template.targetType);
      setStatus(template.status);
      setBrokenLinks(template.brokenLinks ?? []);
    }
  };

  const bodyValue = (): string => {
    if (editing === 'new') return '';
    return bodyRef.current?.value ?? (editing?.bodyHtml ?? '');
  };

  const loadPickerPosts = async (query: string) => {
    setPickerLoading(true);
    try {
      const result = await api.adminBlogPublishedForLinks(query);
      setPickerPosts(result.posts ?? []);
    } catch (err) {
      notify('error', 'Could not load published articles', messageForError(err));
    } finally {
      setPickerLoading(false);
    }
  };

  const openPicker = () => {
    setPickerOpen(true);
    void loadPickerPosts(pickerQuery);
  };

  /** Insert the chosen article's permanent URL with the administrator's own link text. */
  const insertPost = (post: { title: string; url: string }) => {
    const text = (linkText.trim() || post.title).replace(/</g, '&lt;').replace(/&/g, '&amp;');
    const snippet = `<p><a href="${post.url}">${text}</a></p>`;
    const textarea = bodyRef.current;
    if (textarea) {
      const start = textarea.selectionStart ?? textarea.value.length;
      const end = textarea.selectionEnd ?? textarea.value.length;
      textarea.value = textarea.value.slice(0, start) + snippet + textarea.value.slice(end);
    }
    setPickerOpen(false);
    setLinkText('');
    notify('info', 'Article link inserted', 'Save the template to keep it.');
  };

  const wrapSelection = (before: string, after: string) => {
    const textarea = bodyRef.current;
    if (!textarea) return;
    const start = textarea.selectionStart ?? 0;
    const end = textarea.selectionEnd ?? 0;
    const selected = textarea.value.slice(start, end);
    textarea.value =
      textarea.value.slice(0, start) + before + selected + after + textarea.value.slice(end);
  };

  const checkLinks = async () => {
    try {
      const result = await api.adminEmailTemplateCheckLinks(bodyValue());
      setBrokenLinks(result.broken ?? []);
      if ((result.broken ?? []).length === 0) {
        notify('success', 'All article links resolve', 'Every linked article is published.');
      }
    } catch (err) {
      notify('error', 'Could not check the links', messageForError(err));
    }
  };

  const save = async () => {
    setSaving(true);
    setFieldErrors({});
    try {
      const payload = {
        name,
        targetType,
        status,
        bodyHtml: bodyValue(),
      };
      const result =
        editing === 'new'
          ? await api.adminEmailTemplateCreate(payload)
          : await api.adminEmailTemplateUpdate((editing as EmailTemplate).id, payload);
      notify('success', 'Template saved', result.message);
      setEditing(null);
      await load();
    } catch (err) {
      setFieldErrors(fieldErrorsFor(err));
      notify('error', 'Could not save the template', messageForError(err));
    } finally {
      setSaving(false);
    }
  };

  const remove = async (template: EmailTemplate) => {
    if (!window.confirm(`Delete the template “${template.name}”? The email it was added to is unchanged.`)) return;
    try {
      await api.adminEmailTemplateDelete(template.id);
      notify('success', 'Template deleted');
      await load();
    } catch (err) {
      notify('error', 'Could not delete the template', messageForError(err));
    }
  };

  if (editing) {
    return (
      <div className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2 bg-slate-800/80 border border-white/10 rounded-2xl p-4">
          <h2 className="text-sm font-bold text-white flex items-center gap-2">
            <Mail className="w-4 h-4 text-[#08D9D6]" />
            {editing === 'new' ? 'New email template' : `Editing: ${editing.name}`}
          </h2>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => void checkLinks()}
              className="px-3 py-2 rounded-xl bg-white/10 text-xs font-bold"
            >
              Check article links
            </button>
            <button
              type="button"
              onClick={() => void save()}
              disabled={saving}
              className="px-3 py-2 rounded-xl bg-[#08D9D6] text-[#252A34] text-xs font-bold flex items-center gap-1.5 disabled:opacity-50"
            >
              {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />} Save
            </button>
            <button type="button" onClick={() => setEditing(null)} className="p-2 rounded-xl bg-white/5" aria-label="Close">
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {brokenLinks.length > 0 ? (
          <div role="alert" className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-200 text-xs flex items-start gap-2">
            <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
            <div>
              <p className="font-bold">A linked article is not published</p>
              <ul className="mt-1 space-y-0.5">
                {brokenLinks.map((link) => (
                  <li key={link.slug}>
                    /blog/{link.slug} — {link.title || 'article'} ({link.status})
                  </li>
                ))}
              </ul>
              <p className="mt-1 text-[11px] text-amber-200/80">
                The server will refuse to save this template until the article is published or the link is removed, so a
                customer never receives a dead or draft-only link. The email itself is unaffected until then.
              </p>
            </div>
          </div>
        ) : null}

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <div className="lg:col-span-2 bg-slate-800/80 border border-white/10 rounded-2xl p-4 space-y-3">
            <label className="block space-y-1">
              <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">Template name</span>
              <input
                value={name}
                onChange={(event) => setName(event.target.value)}
                placeholder="Renting guide in viewing emails"
                className="w-full bg-slate-900 border border-white/10 rounded-xl px-3 py-2 text-sm text-white"
              />
              {fieldErrors.name ? <span className="text-[10px] text-[#FF8FA8]">{fieldErrors.name}</span> : null}
            </label>

            <label className="block space-y-1">
              <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">Added to this email</span>
              <select
                value={targetType}
                onChange={(event) => setTargetType(event.target.value)}
                className="w-full bg-slate-900 border border-white/10 rounded-xl px-3 py-2 text-sm text-white"
              >
                {targets.map((target) => (
                  <option key={target.type} value={target.type}>
                    {target.label}
                  </option>
                ))}
              </select>
              {fieldErrors.targetType ? (
                <span className="text-[10px] text-[#FF8FA8]">{fieldErrors.targetType}</span>
              ) : null}
            </label>

            <div className="space-y-2">
              <div className="flex items-center justify-between gap-2">
                <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">Content</span>
                <button
                  type="button"
                  onClick={openPicker}
                  className="px-2.5 py-1.5 rounded-lg bg-[#08D9D6]/15 border border-[#08D9D6]/30 text-[#08D9D6] text-[11px] font-bold flex items-center gap-1"
                >
                  <FileText className="w-3 h-3" /> Insert Blog Post
                </button>
              </div>

              <div className="flex flex-wrap items-center gap-1">
                <button type="button" onClick={() => wrapSelection('<strong>', '</strong>')} className="p-1.5 rounded bg-white/5" title="Bold">
                  <Bold className="w-3.5 h-3.5" />
                </button>
                <button type="button" onClick={() => wrapSelection('<em>', '</em>')} className="p-1.5 rounded bg-white/5" title="Italic">
                  <Italic className="w-3.5 h-3.5" />
                </button>
                <button type="button" onClick={() => wrapSelection('<ul><li>', '</li></ul>')} className="p-1.5 rounded bg-white/5" title="List">
                  <List className="w-3.5 h-3.5" />
                </button>
                <button
                  type="button"
                  onClick={() => wrapSelection('<a href="/blog">', '</a>')}
                  className="p-1.5 rounded bg-white/5"
                  title="Link to the Learning Centre"
                >
                  <Link2 className="w-3.5 h-3.5" />
                </button>
                <span className="text-[10px] text-slate-500 ml-1">HTML is cleaned on save (no scripts, no embeds).</span>
              </div>

              <textarea
                ref={bodyRef}
                defaultValue={editing === 'new' ? '' : editing.bodyHtml}
                rows={10}
                placeholder={'<p>Read our <a href="https://rent.goodlucks.co/blog/…">guide to renting in Ghana</a>.</p>'}
                className="w-full bg-slate-900 border border-white/10 rounded-xl px-3 py-2 text-xs font-mono text-white"
              />
              {fieldErrors.bodyHtml ? (
                <span className="text-[10px] text-[#FF8FA8]">{fieldErrors.bodyHtml}</span>
              ) : null}
            </div>
          </div>

          <div className="space-y-4">
            <div className="bg-slate-800/80 border border-white/10 rounded-2xl p-4 space-y-2">
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400">Status</h3>
              <label className="flex items-center gap-2 text-xs text-slate-300">
                <input
                  type="radio"
                  checked={status === 'active'}
                  onChange={() => setStatus('active')}
                  className="accent-[#08D9D6]"
                />
                Active — added to that email
              </label>
              <label className="flex items-center gap-2 text-xs text-slate-300">
                <input
                  type="radio"
                  checked={status === 'inactive'}
                  onChange={() => setStatus('inactive')}
                  className="accent-[#08D9D6]"
                />
                Inactive — saved, never sent
              </label>
            </div>

            <div className="bg-slate-800/80 border border-white/10 rounded-2xl p-4 space-y-2">
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400">How this works</h3>
              <p className="text-[11px] text-slate-300 leading-relaxed">
                Your content is added after the email&apos;s own message. The system always keeps the facts it must
                send — the recipient&apos;s name, references, dates and amounts. Nothing else about that email changes.
              </p>
              <p className="text-[11px] text-slate-400 leading-relaxed">
                If a linked article is later unpublished, the block is skipped and the email goes out without it, so a
                reader never lands on a dead page.
              </p>
            </div>
          </div>
        </div>

        {pickerOpen ? (
          <div className="bg-slate-800/95 border border-[#08D9D6]/30 rounded-2xl p-4 space-y-3">
            <div className="flex items-center justify-between gap-2">
              <h3 className="text-sm font-bold text-white">Insert a published article</h3>
              <button type="button" onClick={() => setPickerOpen(false)} className="p-1.5 rounded bg-white/5" aria-label="Close picker">
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
            <div className="flex flex-wrap gap-2">
              <div className="flex-1 min-w-[180px] flex items-center gap-2 bg-slate-900 border border-white/10 rounded-xl px-3 py-2">
                <Search className="w-4 h-4 text-[#08D9D6]" />
                <input
                  value={pickerQuery}
                  onChange={(event) => setPickerQuery(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') {
                      event.preventDefault();
                      void loadPickerPosts(pickerQuery);
                    }
                  }}
                  placeholder="Search published articles"
                  className="flex-1 bg-transparent text-xs text-white outline-none"
                />
              </div>
              <button
                type="button"
                onClick={() => void loadPickerPosts(pickerQuery)}
                className="px-3 py-2 rounded-xl bg-white/10 text-xs font-bold"
              >
                Search
              </button>
            </div>
            <input
              value={linkText}
              onChange={(event) => setLinkText(event.target.value)}
              placeholder="Link text (optional — defaults to the article title)"
              className="w-full bg-slate-900 border border-white/10 rounded-xl px-3 py-2 text-xs text-white"
            />
            {pickerLoading ? (
              <div className="flex items-center gap-2 text-xs text-slate-400">
                <Loader2 className="w-3.5 h-3.5 animate-spin" /> Loading published articles…
              </div>
            ) : pickerPosts.length === 0 ? (
              <p className="text-xs text-slate-400">
                No published articles match. Only published articles can be inserted — publish one in Blog Management
                first.
              </p>
            ) : (
              <ul className="max-h-64 overflow-y-auto divide-y divide-white/5 border border-white/10 rounded-xl">
                {pickerPosts.map((post) => (
                  <li key={post.id} className="flex items-center gap-2 p-2">
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-bold text-white truncate">{post.title}</p>
                      <p className="text-[10px] text-slate-500 truncate">{post.url}</p>
                    </div>
                    <button
                      type="button"
                      onClick={() => insertPost(post)}
                      className="px-2 py-1 rounded-lg bg-[#08D9D6] text-[#252A34] text-[10px] font-bold flex items-center gap-1"
                    >
                      <Plus className="w-3 h-3" /> Insert
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        ) : null}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold text-white flex items-center gap-2">
            <Mail className="w-5 h-5 text-[#08D9D6]" /> Email templates
          </h2>
          <p className="text-xs text-slate-400 max-w-2xl">
            Add the extra paragraph or article link you want in a transactional email. The email keeps its own facts;
            your content is appended. Templates that link to an unpublished article are flagged and skipped when the
            email is sent.
          </p>
        </div>
        <button
          type="button"
          onClick={() => openEditor('new')}
          className="px-3 py-2 rounded-xl bg-[#08D9D6] text-[#252A34] text-xs font-bold flex items-center gap-1.5"
        >
          <Plus className="w-3.5 h-3.5" /> New template
        </button>
      </div>

      {error ? (
        <div role="alert" className="p-3 rounded-xl bg-[#FF2E63]/15 border border-[#FF2E63]/30 text-[#FF8FA8] text-xs flex items-start gap-2">
          <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
          <span className="flex-1">{error}</span>
        </div>
      ) : null}

      {loading ? (
        <div className="flex items-center gap-2 text-xs text-slate-400 py-8 justify-center">
          <Loader2 className="w-4 h-4 animate-spin" /> Loading templates…
        </div>
      ) : templates.length === 0 ? (
        <div className="rounded-2xl border border-white/10 bg-slate-800/60 p-8 text-center space-y-2">
          <Mail className="w-6 h-6 text-[#08D9D6] mx-auto" />
          <p className="text-sm font-bold text-white">No templates yet</p>
          <p className="text-xs text-slate-400">
            Every email currently sends exactly what the system writes. Add a template to include a guide or an article
            link in one of them.
          </p>
        </div>
      ) : (
        <ul className="space-y-2">
          {templates.map((template) => (
            <li key={template.id} className="bg-slate-800/70 border border-white/10 rounded-2xl p-3 space-y-2">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-sm font-bold text-white">{template.name}</span>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold border border-white/10 bg-white/5 text-slate-300">
                  {template.targetLabel}
                </span>
                <span
                  className={`px-2 py-0.5 rounded-full text-[10px] font-bold border ${
                    template.status === 'active'
                      ? 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30'
                      : 'bg-slate-500/15 text-slate-300 border-slate-500/30'
                  }`}
                >
                  {template.status}
                </span>
                {template.needsAttention ? (
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-500/15 text-amber-300 border border-amber-500/30 flex items-center gap-1">
                    <AlertTriangle className="w-3 h-3" /> article not published
                  </span>
                ) : null}
                <div className="ml-auto flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => openEditor(template)}
                    className="px-2 py-1 rounded-lg bg-white/5 hover:bg-white/10 text-[10px] font-bold"
                  >
                    Edit
                  </button>
                  <button
                    type="button"
                    onClick={() => void remove(template)}
                    className="p-1.5 rounded-lg bg-[#FF2E63]/15 text-[#FF8FA8]"
                    aria-label={`Delete ${template.name}`}
                  >
                    <Trash2 className="w-3 h-3" />
                  </button>
                </div>
              </div>

              <p className="text-[11px] text-slate-400 line-clamp-2">{template.bodyHtml.replace(/<[^>]+>/g, ' ')}</p>

              {template.links.length > 0 ? (
                <ul className="space-y-1">
                  {template.links.map((link) => (
                    <li key={link.url} className="flex items-center gap-1.5 text-[10px]">
                      {link.status === 'published' ? (
                        <Check className="w-3 h-3 text-emerald-400" />
                      ) : (
                        <AlertTriangle className="w-3 h-3 text-amber-400" />
                      )}
                      <span className={link.status === 'published' ? 'text-slate-300' : 'text-amber-300'}>
                        /blog/{link.slug} — {link.status}
                      </span>
                      <a
                        href={link.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-slate-500 hover:text-[#08D9D6]"
                      >
                        <ExternalLink className="w-3 h-3" />
                      </a>
                    </li>
                  ))}
                </ul>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};

export default AdminEmailTemplates;
