import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  api,
  fieldErrorsFor,
  messageForError,
} from '../services/apiService';
import type { BlogCategory, BlogPost, BlogPropertyCard, BlogPostStatus } from '../types';
import { BlogArticleBody } from './BlogArticleBody';
import {
  AlertCircle,
  ArrowDown,
  ArrowUp,
  Bold,
  Check,
  Eye,
  Heading2,
  Heading3,
  Image as ImageIcon,
  Italic,
  Link2,
  List,
  ListOrdered,
  Loader2,
  Plus,
  Quote,
  Save,
  Search,
  Send,
  Trash2,
  Video,
  Wand2,
  X,
} from 'lucide-react';

interface Props {
  postId: string | null;
  categories: BlogCategory[];
  /** Called after a successful save so the list can refresh its counts. */
  onSaved: (post: BlogPost) => void;
  onClose: () => void;
  notify: (kind: 'success' | 'error' | 'info', title: string, message?: string) => void;
}

/**
 * The article editor.
 *
 * Formatting is plain `contentEditable` with `document.execCommand`: no extra
 * dependency, and — importantly — the HTML that is loaded and saved is the same
 * HTML, so opening an existing article and saving it again never rewrites or
 * loses the author's content. The server sanitises on the way in
 * (`blog_sanitize_html`), which is the only guard that matters.
 *
 * The property showcase is a list of REFERENCES: this editor only chooses ids,
 * an order and a display rule. Prices, photos and availability are read from the
 * live listing when a reader opens the article.
 */
export const AdminBlogEditor: React.FC<Props> = ({ postId, categories, onSaved, onClose, notify }) => {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [post, setPost] = useState<BlogPost | null>(null);

  const [title, setTitle] = useState('');
  const [subtitle, setSubtitle] = useState('');
  const [slug, setSlug] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [tags, setTags] = useState('');
  const [seoTitle, setSeoTitle] = useState('');
  const [seoDescription, setSeoDescription] = useState('');
  const [isFeatured, setIsFeatured] = useState(false);
  const [featuredImage, setFeaturedImage] = useState('');
  const [featuredImageAlt, setFeaturedImageAlt] = useState('');
  const [content, setContent] = useState('');
  const [cards, setCards] = useState<BlogPropertyCard[]>([]);
  const [uploading, setUploading] = useState(false);
  const [scheduleAt, setScheduleAt] = useState('');
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [previewing, setPreviewing] = useState(false);

  // Property picker
  const [propertyQuery, setPropertyQuery] = useState('');
  const [propertyResults, setPropertyResults] = useState<BlogPropertyCard[]>([]);
  const [searchingProperties, setSearchingProperties] = useState(false);

  const editorRef = useRef<HTMLDivElement | null>(null);
  const showPlaceholder = '<div class="gl-showcase"></div>';
  const placeholder = post?.showcasePlaceholder || showPlaceholder;

  const applyPost = useCallback((loaded: BlogPost) => {
    setPost(loaded);
    setTitle(loaded.title);
    setSubtitle(loaded.subtitle || '');
    setSlug(loaded.slug);
    setCategoryId(loaded.category?.id ?? '');
    setTags((loaded.tags || []).join(', '));
    setSeoTitle(loaded.seoTitle || '');
    setSeoDescription(loaded.seoDescription || '');
    setIsFeatured(Boolean(loaded.isFeatured));
    setFeaturedImage(loaded.featuredImage || '');
    setFeaturedImageAlt(loaded.featuredImageAlt || '');
    setContent(loaded.contentHtml || '');
    setCards(loaded.propertyCards || []);
    setScheduleAt(loaded.publishAt ? loaded.publishAt.slice(0, 16) : '');
  }, []);

  useEffect(() => {
    let cancelled = false;
    if (!postId) {
      setLoading(false);
      setPost(null);
      return;
    }
    setLoading(true);
    api
      .adminBlogPost(postId)
      .then((result) => {
        if (!cancelled) applyPost(result.post);
      })
      .catch((error) => notify('error', 'Could not open the article', messageForError(error)))
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [postId, applyPost, notify]);

  // Load the editor's HTML once the content is known — never on every keystroke,
  // or the caret would jump to the start of the article.
  useEffect(() => {
    if (editorRef.current && editorRef.current.innerHTML !== content) {
      editorRef.current.innerHTML = content;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [post?.id, loading]);

  const exec = (command: string, value?: string) => {
    editorRef.current?.focus();
    document.execCommand(command, false, value);
    setContent(editorRef.current?.innerHTML ?? '');
  };

  const insertHtml = (html: string) => {
    editorRef.current?.focus();
    document.execCommand('insertHTML', false, html);
    setContent(editorRef.current?.innerHTML ?? '');
  };

  const insertLink = () => {
    const href = window.prompt('Link address (start with / for a page on this site, or https://…)');
    if (!href) return;
    const text = window.prompt('Link text', title || 'Read more') || href;
    insertHtml(`<a href="${href.replace(/"/g, '&quot;')}">${text.replace(/</g, '&lt;')}</a>`);
  };

  const insertImage = () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/jpeg,image/png,image/webp,image/gif';
    input.onchange = async () => {
      const file = input.files?.[0];
      if (!file) return;
      setUploading(true);
      try {
        const result = await api.uploadImages([file]);
        const url = result.urls?.[0];
        if (url) {
          const alt = window.prompt('Describe the image for a screen reader (alt text)') || '';
          insertHtml(`<img src="${url}" alt="${alt.replace(/"/g, '&quot;')}">`);
        }
      } catch (error) {
        notify('error', 'Image upload failed', messageForError(error));
      } finally {
        setUploading(false);
      }
    };
    input.click();
  };

  const insertYoutube = () => {
    const url = window.prompt('Paste a YouTube link (youtube.com/watch?v=…, youtu.be/…, or a Shorts link)');
    if (!url) return;
    // The server re-validates this and rewrites it to a canonical, cookie-free
    // embed; anything that is not a real YouTube video is dropped on save.
    insertHtml(`<iframe src="${url.replace(/"/g, '&quot;')}"></iframe>`);
    notify('info', 'Video added', 'Save the article to validate the link.');
  };

  const insertCallout = () => {
    const text = window.prompt('Callout text (e.g. "A viewing fee is paid only after the viewing")');
    if (!text) return;
    insertHtml(`<aside class="gl-callout">${text.replace(/</g, '&lt;')}</aside>`);
  };

  const insertShowcase = () => {
    if (content.includes('gl-showcase')) {
      notify('info', 'Already in the article', 'Remove the existing showcase block first.');
      return;
    }
    insertHtml(showPlaceholder);
  };

  const uploadFeaturedImage = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const result = await api.uploadImages([file]);
      const url = result.urls?.[0];
      if (url) setFeaturedImage(url);
    } catch (error) {
      notify('error', 'Image upload failed', messageForError(error));
    } finally {
      setUploading(false);
      event.target.value = '';
    }
  };

  const searchProperties = async () => {
    setSearchingProperties(true);
    try {
      const result = await api.adminBlogSearchProperties(propertyQuery);
      setPropertyResults(result.properties ?? []);
    } catch (error) {
      notify('error', 'Search failed', messageForError(error));
    } finally {
      setSearchingProperties(false);
    }
  };

  useEffect(() => {
    void searchProperties();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const addProperty = (card: BlogPropertyCard) => {
    if (cards.some((existing) => existing.propertyId === card.propertyId)) {
      notify('info', 'Already in the showcase', `${card.title} is already in this article.`);
      return;
    }
    setCards([...cards, { ...card, displayRule: 'show_status', note: '' }]);
  };

  const moveCard = (index: number, direction: -1 | 1) => {
    const next = [...cards];
    const target = index + direction;
    if (target < 0 || target >= next.length) return;
    const [item] = next.splice(index, 1);
    next.splice(target, 0, item);
    setCards(next);
  };

  const saveFields = async (): Promise<BlogPost | null> => {
    setFieldErrors({});
    setSaving(true);
    const payload = {
      title,
      subtitle,
      slug,
      categoryId: categoryId || null,
      tags,
      seoTitle,
      seoDescription,
      isFeatured,
      featuredImage,
      featuredImageAlt,
      contentHtml: editorRef.current?.innerHTML ?? content,
    };
    try {
      const result = post
        ? await api.adminBlogUpdatePost(post.id, payload)
        : await api.adminBlogCreatePost(payload);
      applyPost(result.post);
      onSaved(result.post);
      notify('success', post ? 'Article saved' : 'Draft created', result.message);
      return result.post;
    } catch (error) {
      setFieldErrors(fieldErrorsFor(error));
      notify('error', 'Could not save the article', messageForError(error));
      return null;
    } finally {
      setSaving(false);
    }
  };

  const saveWithCards = async (): Promise<BlogPost | null> => {
    const saved = await saveFields();
    if (!saved) return null;
    try {
      const result = await api.adminBlogSetProperties(
        saved.id,
        cards.map((card) => ({
          propertyId: card.propertyId,
          displayRule: card.displayRule,
          note: card.note,
        }))
      );
      setCards(result.propertyCards ?? []);
    } catch (error) {
      notify('error', 'Showcase not saved', messageForError(error));
      return saved;
    }
    return saved;
  };

  const changeStatus = async (status: BlogPostStatus, publishAt?: string) => {
    if (!post) {
      notify('info', 'Save the draft first', 'Create the article before publishing it.');
      return;
    }
    try {
      const result = await api.adminBlogSetStatus(post.id, { status, publishAt });
      applyPost(result.post);
      onSaved(result.post);
      notify('success', 'Status updated', result.message);
    } catch (error) {
      notify('error', 'Could not change the status', messageForError(error));
    }
  };

  const deletePost = async () => {
    if (!post) return;
    const confirmed = window.confirm(
      `Delete “${post.title}” permanently? The article and its URL will stop working. This cannot be undone.`
    );
    if (!confirmed) return;
    try {
      await api.adminBlogDeletePost(post.id);
      notify('success', 'Article deleted');
      onClose();
    } catch (error) {
      notify('error', 'Could not delete the article', messageForError(error));
    }
  };

  const tagList = useMemo(
    () => tags.split(',').map((tag) => tag.trim()).filter(Boolean),
    [tags]
  );

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-sm text-ink/70 py-10 justify-center">
        <Loader2 className="w-4 h-4 animate-spin" /> Opening the article…
      </div>
    );
  }

  const statusBadge = post ? (
    <span
      className={`px-2.5 py-1 rounded-full text-[10px] font-extrabold uppercase tracking-wider border ${
        post.status === 'published'
          ? 'bg-emerald-500/15 text-emerald-700 border-emerald-500/30'
          : post.status === 'scheduled'
            ? 'bg-amber-500/15 text-amber-700 border-amber-500/30'
            : post.status === 'unpublished'
              ? 'bg-line/15 text-ink/70 border-line/30'
              : 'bg-page text-ink/70 border-line'
      }`}
    >
      {post.status}
    </span>
  ) : (
    <span className="px-2.5 py-1 rounded-full text-[10px] font-extrabold uppercase tracking-wider border bg-page text-ink/70 border-line">
      new draft
    </span>
  );

  const toolButton =
    'p-2 rounded-lg bg-page border border-line text-ink hover:bg-page transition-colors';

  return (
    <div className="space-y-5">
      {/* Header / actions */}
      <div className="flex flex-wrap items-center justify-between gap-3 bg-surface border border-line rounded-2xl p-4">
        <div className="flex items-center gap-2">
          {statusBadge}
          <span className="text-xs text-ink/70">
            {post ? `Updated ${new Date(post.updatedAt || post.createdAt).toLocaleString()}` : 'Nothing is public until you publish.'}
          </span>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" onClick={() => setPreviewing((value) => !value)} className={toolButton}>
            <span className="flex items-center gap-1 text-xs font-bold">
              <Eye className="w-3.5 h-3.5" /> {previewing ? 'Hide preview' : 'Preview'}
            </span>
          </button>
          <button
            type="button"
            disabled={saving}
            onClick={() => void saveWithCards()}
            className="px-3 py-2 rounded-lg bg-page text-xs font-bold hover:bg-line disabled:opacity-50"
          >
            <span className="flex items-center gap-1">
              {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />} Save
            </span>
          </button>
          <button
            type="button"
            disabled={!post}
            onClick={() => void changeStatus('published')}
            className="px-3 py-2 rounded-lg bg-interactive text-ink text-xs font-bold disabled:opacity-50"
          >
            <span className="flex items-center gap-1">
              <Send className="w-3.5 h-3.5" /> Publish
            </span>
          </button>
          <button
            type="button"
            disabled={!post}
            onClick={() => void changeStatus('unpublished')}
            className="px-3 py-2 rounded-lg bg-page text-xs font-bold disabled:opacity-50"
          >
            Unpublish
          </button>
          <button
            type="button"
            disabled={!post}
            onClick={() => void deletePost()}
            className="px-3 py-2 rounded-lg bg-accent/15 text-ink border border-accent/30 text-xs font-bold disabled:opacity-50"
          >
            <span className="flex items-center gap-1">
              <Trash2 className="w-3.5 h-3.5" /> Delete
            </span>
          </button>
          <button type="button" onClick={onClose} className={toolButton} aria-label="Close editor">
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      {fieldErrors.title || fieldErrors.contentHtml ? (
        <div role="alert" className="p-3 rounded-xl bg-accent/15 border border-accent/30 text-ink text-xs flex items-start gap-2">
          <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
          <span>{fieldErrors.title || fieldErrors.contentHtml}</span>
        </div>
      ) : null}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Main column */}
        <div className="lg:col-span-2 space-y-4">
          <div className="bg-surface border border-line rounded-2xl p-4 space-y-3">
            <label className="block space-y-1">
              <span className="text-[11px] font-bold uppercase tracking-wider text-ink/70">Title</span>
              <input
                value={title}
                onChange={(event) => setTitle(event.target.value)}
                placeholder="Top available properties in East Legon"
                className="w-full bg-page border border-line rounded-xl px-3 py-2 text-sm text-ink"
              />
            </label>
            <label className="block space-y-1">
              <span className="text-[11px] font-bold uppercase tracking-wider text-ink/70">
                Subtitle or short introduction
              </span>
              <textarea
                value={subtitle}
                onChange={(event) => setSubtitle(event.target.value)}
                rows={2}
                className="w-full bg-page border border-line rounded-xl px-3 py-2 text-sm text-ink"
              />
            </label>
            <label className="block space-y-1">
              <span className="text-[11px] font-bold uppercase tracking-wider text-ink/70">
                Slug (the article URL)
              </span>
              <div className="flex items-center gap-1 text-xs text-ink/70">
                <span>/blog/</span>
                <input
                  value={slug}
                  onChange={(event) => setSlug(event.target.value)}
                  placeholder="top-available-properties-east-legon"
                  className="flex-1 bg-page border border-line rounded-xl px-3 py-2 text-sm text-ink"
                />
              </div>
              <span className="text-[10px] text-ink/70">
                Lowercase letters, numbers and hyphens. Leave empty to build it from the title.
              </span>
            </label>
          </div>

          {/* Editor toolbar */}
          <div className="bg-surface border border-line rounded-2xl p-4 space-y-3">
            <div className="flex flex-wrap items-center gap-1.5">
              <button type="button" className={toolButton} title="Heading" onClick={() => exec('formatBlock', 'H2')}>
                <Heading2 className="w-4 h-4" />
              </button>
              <button type="button" className={toolButton} title="Sub-heading" onClick={() => exec('formatBlock', 'H3')}>
                <Heading3 className="w-4 h-4" />
              </button>
              <button type="button" className={toolButton} title="Bold" onClick={() => exec('bold')}>
                <Bold className="w-4 h-4" />
              </button>
              <button type="button" className={toolButton} title="Italic" onClick={() => exec('italic')}>
                <Italic className="w-4 h-4" />
              </button>
              <button type="button" className={toolButton} title="Bulleted list" onClick={() => exec('insertUnorderedList')}>
                <List className="w-4 h-4" />
              </button>
              <button type="button" className={toolButton} title="Numbered list" onClick={() => exec('insertOrderedList')}>
                <ListOrdered className="w-4 h-4" />
              </button>
              <button type="button" className={toolButton} title="Quote" onClick={() => exec('formatBlock', 'BLOCKQUOTE')}>
                <Quote className="w-4 h-4" />
              </button>
              <button type="button" className={toolButton} title="Link" onClick={insertLink}>
                <Link2 className="w-4 h-4" />
              </button>
              <button type="button" className={toolButton} title="Image" onClick={insertImage} disabled={uploading}>
                <ImageIcon className="w-4 h-4" />
              </button>
              <button type="button" className={toolButton} title="YouTube video" onClick={insertYoutube}>
                <Video className="w-4 h-4" />
              </button>
              <button type="button" className={toolButton} title="Highlighted callout" onClick={insertCallout}>
                <Wand2 className="w-4 h-4" />
              </button>
              <button
                type="button"
                className={`${toolButton} text-[11px] font-bold px-2.5`}
                title="Insert the property showcase here"
                onClick={insertShowcase}
              >
                Property cards
              </button>
            </div>

            <div
              ref={editorRef}
              contentEditable
              suppressContentEditableWarning
              role="textbox"
              aria-multiline="true"
              aria-label="Article content"
              onInput={() => setContent(editorRef.current?.innerHTML ?? '')}
              onBlur={() => setContent(editorRef.current?.innerHTML ?? '')}
              className="gl-article min-h-[320px] bg-surface border border-line rounded-xl p-4 outline-none focus:border-interactive"
            />
            <p className="text-[10px] text-ink/70 leading-snug">
              Saved content is cleaned automatically: scripts, unsafe links and any embed that is not a YouTube video are
              removed. Images upload through the same uploader the listings use.
            </p>
          </div>

          {/* Showcase manager */}
          <div className="bg-surface border border-line rounded-2xl p-4 space-y-3">
            <div className="flex items-center justify-between gap-2">
              <h3 className="text-sm font-bold text-ink">Property showcase ({cards.length})</h3>
              <span className="text-[10px] text-ink/70">Cards read the live listing every time the article is opened.</span>
            </div>

            <div className="flex flex-wrap gap-2">
              <div className="flex-1 min-w-[180px] flex items-center gap-2 bg-surface border border-line rounded-xl px-3 py-2">
                <Search className="w-4 h-4 text-ink" />
                <input
                  value={propertyQuery}
                  onChange={(event) => setPropertyQuery(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') {
                      event.preventDefault();
                      void searchProperties();
                    }
                  }}
                  placeholder="Search listings by title, area or city"
                  className="flex-1 bg-transparent text-xs text-ink outline-none"
                />
              </div>
              <button
                type="button"
                onClick={() => void searchProperties()}
                className="px-3 py-2 rounded-xl bg-page text-xs font-bold"
              >
                {searchingProperties ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : 'Search'}
              </button>
            </div>

            {propertyResults.length > 0 ? (
              <ul className="max-h-56 overflow-y-auto divide-y divide-line border border-line rounded-xl">
                {propertyResults.slice(0, 20).map((result) => (
                  <li key={result.propertyId} className="flex items-center gap-2 p-2">
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-semibold text-ink truncate">{result.title}</p>
                      <p className="text-[10px] text-ink/70">
                        {result.location} · GH₵ {result.rentGhs.toLocaleString()} · {result.status ?? (result.isAvailable ? 'active' : 'not available')}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => addProperty(result)}
                      className="px-2 py-1 rounded-lg bg-interactive text-ink text-[10px] font-bold flex items-center gap-1"
                    >
                      <Plus className="w-3 h-3" /> Add
                    </button>
                  </li>
                ))}
              </ul>
            ) : null}

            {cards.length === 0 ? (
              <p className="text-xs text-ink/70">
                No listings attached. An article can be pure editorial, or use the “Property cards” button above to place
                the showcase inside the text.
              </p>
            ) : (
              <ul className="space-y-2">
                {cards.map((card, index) => (
                  <li key={card.propertyId} className="bg-surface border border-line rounded-xl p-2.5 space-y-2">
                    <div className="flex items-start gap-2">
                      <span className="text-[10px] font-bold text-ink/70 mt-1">{index + 1}</span>
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-bold text-ink truncate">{card.title}</p>
                        <p className="text-[10px] text-ink/70">
                          {card.location}
                          {card.isAvailable ? ` · GH₵ ${card.rentGhs.toLocaleString()}` : ' · no longer available'}
                        </p>
                      </div>
                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => moveCard(index, -1)}
                          disabled={index === 0}
                          className="p-1 rounded bg-page disabled:opacity-30"
                          aria-label={`Move ${card.title} up`}
                        >
                          <ArrowUp className="w-3 h-3" />
                        </button>
                        <button
                          type="button"
                          onClick={() => moveCard(index, 1)}
                          disabled={index === cards.length - 1}
                          className="p-1 rounded bg-page disabled:opacity-30"
                          aria-label={`Move ${card.title} down`}
                        >
                          <ArrowDown className="w-3 h-3" />
                        </button>
                        <button
                          type="button"
                          onClick={() => setCards(cards.filter((item) => item.propertyId !== card.propertyId))}
                          className="p-1 rounded bg-accent/15 text-ink"
                          aria-label={`Remove ${card.title}`}
                        >
                          <X className="w-3 h-3" />
                        </button>
                      </div>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <select
                        value={card.displayRule}
                        onChange={(event) =>
                          setCards(
                            cards.map((item) =>
                              item.propertyId === card.propertyId
                                ? { ...item, displayRule: event.target.value as BlogPropertyCard['displayRule'] }
                                : item
                            )
                          )
                        }
                        className="bg-page border border-line rounded-lg px-2 py-1 text-[10px] text-ink"
                      >
                        <option value="show_status">Show it with a status when unavailable</option>
                        <option value="hide_unavailable">Hide it once it is unavailable</option>
                      </select>
                      <input
                        value={card.note}
                        onChange={(event) =>
                          setCards(
                            cards.map((item) =>
                              item.propertyId === card.propertyId ? { ...item, note: event.target.value } : item
                            )
                          )
                        }
                        placeholder="Optional note (“Close to schools”)"
                        className="flex-1 min-w-[140px] bg-page border border-line rounded-lg px-2 py-1 text-[10px] text-ink"
                      />
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {previewing ? (
            <div className="bg-page border border-interactive/30 rounded-2xl p-4 space-y-3">
              <div className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-wider text-ink">
                <Eye className="w-3.5 h-3.5" /> Preview — exactly what a visitor will see
              </div>
              <h2 className="text-xl font-black text-ink">{title || 'Untitled article'}</h2>
              {subtitle ? <p className="text-sm text-ink/70">{subtitle}</p> : null}
              {featuredImage ? (
                <img src={featuredImage} alt={featuredImageAlt || title} className="w-full rounded-xl" />
              ) : null}
              <BlogArticleBody
                html={editorRef.current?.innerHTML ?? content}
                placeholder={placeholder}
                cards={cards.filter((card) => card.isAvailable || card.displayRule === 'show_status')}
                showcaseHeading="Listings in this article"
              />
            </div>
          ) : null}
        </div>

        {/* Side column */}
        <div className="space-y-4">
          <div className="bg-surface border border-line rounded-2xl p-4 space-y-3">
            <h3 className="text-xs font-bold uppercase tracking-wider text-ink/70">Publishing</h3>
            <label className="block space-y-1">
              <span className="text-[10px] text-ink/70">Schedule for (optional, UTC)</span>
              <input
                type="datetime-local"
                value={scheduleAt}
                onChange={(event) => setScheduleAt(event.target.value)}
                className="w-full bg-page border border-line rounded-xl px-2 py-1.5 text-xs text-ink"
              />
            </label>
            <button
              type="button"
              disabled={!post || !scheduleAt}
              onClick={() => void changeStatus('scheduled', scheduleAt ? new Date(scheduleAt).toISOString() : undefined)}
              className="w-full px-3 py-2 rounded-xl bg-page text-xs font-bold disabled:opacity-50"
            >
              Schedule publication
            </button>
            <p className="text-[10px] text-ink/70 leading-snug">
              A scheduled article stays private until its time arrives. Drafts and unpublished articles are never
              reachable at their URL, in the sitemap or from an email template.
            </p>
          </div>

          <div className="bg-surface border border-line rounded-2xl p-4 space-y-3">
            <h3 className="text-xs font-bold uppercase tracking-wider text-ink/70">Category and tags</h3>
            <select
              value={categoryId}
              onChange={(event) => setCategoryId(event.target.value)}
              className="w-full bg-page border border-line rounded-xl px-2 py-2 text-xs text-ink"
            >
              <option value="">No category</option>
              {categories.map((category) => (
                <option key={category.id} value={category.id}>
                  {category.name}
                </option>
              ))}
            </select>
            <label className="block space-y-1">
              <span className="text-[10px] text-ink/70">Tags (comma separated)</span>
              <input
                value={tags}
                onChange={(event) => setTags(event.target.value)}
                placeholder="East Legon, 2 bedrooms"
                className="w-full bg-page border border-line rounded-xl px-2 py-2 text-xs text-ink"
              />
            </label>
            {tagList.length > 0 ? (
              <div className="flex flex-wrap gap-1">
                {tagList.map((tag) => (
                  <span key={tag} className="px-2 py-0.5 rounded-full bg-page text-[10px] text-ink/70">
                    {tag}
                  </span>
                ))}
              </div>
            ) : null}
            <label className="flex items-center gap-2 text-xs text-ink/70">
              <input
                type="checkbox"
                checked={isFeatured}
                onChange={(event) => setIsFeatured(event.target.checked)}
                className="accent-interactive"
              />
              Feature this article on the Learning Centre home
            </label>
          </div>

          <div className="bg-surface border border-line rounded-2xl p-4 space-y-3">
            <h3 className="text-xs font-bold uppercase tracking-wider text-ink/70">Featured image</h3>
            {featuredImage ? (
              <img src={featuredImage} alt={featuredImageAlt || title} className="w-full rounded-xl border border-line" />
            ) : (
              <div className="w-full aspect-[16/10] rounded-xl border border-dashed border-line flex items-center justify-center text-ink/70">
                <ImageIcon className="w-6 h-6" />
              </div>
            )}
            <input
              type="file"
              accept="image/jpeg,image/png,image/webp,image/gif"
              onChange={uploadFeaturedImage}
              disabled={uploading}
              className="block w-full text-[10px] text-ink/70 file:mr-2 file:px-2 file:py-1 file:rounded-lg file:border-0 file:bg-page file:text-ink file:text-[10px] file:font-bold"
            />
            <label className="block space-y-1">
              <span className="text-[10px] text-ink/70">Image description (alt text)</span>
              <input
                value={featuredImageAlt}
                onChange={(event) => setFeaturedImageAlt(event.target.value)}
                placeholder="Front of a 3-bedroom apartment in Cantonments"
                className="w-full bg-page border border-line rounded-xl px-2 py-2 text-xs text-ink"
              />
            </label>
            <p className="text-[10px] text-ink/70 leading-snug">
              Alt text describes the picture for someone using a screen reader, and is what search engines read.
            </p>
          </div>

          <div className="bg-surface border border-line rounded-2xl p-4 space-y-3">
            <h3 className="text-xs font-bold uppercase tracking-wider text-ink/70">Search appearance</h3>
            <label className="block space-y-1">
              <span className="text-[10px] text-ink/70">SEO title</span>
              <input
                value={seoTitle}
                onChange={(event) => setSeoTitle(event.target.value)}
                placeholder={title || 'Defaults to the article title'}
                className="w-full bg-page border border-line rounded-xl px-2 py-2 text-xs text-ink"
              />
            </label>
            <label className="block space-y-1">
              <span className="text-[10px] text-ink/70">Meta description ({seoDescription.length}/320)</span>
              <textarea
                value={seoDescription}
                onChange={(event) => setSeoDescription(event.target.value.slice(0, 320))}
                rows={3}
                placeholder={subtitle || 'Defaults to the introduction'}
                className="w-full bg-page border border-line rounded-xl px-2 py-2 text-xs text-ink"
              />
            </label>
            <p className="text-[10px] text-ink/70 leading-snug">
              This is what a search result may show. Nothing here guarantees a ranking; the article still has to be
              useful to the person searching.
            </p>
          </div>

          {post ? (
            <div className="bg-surface border border-line rounded-2xl p-4 space-y-1 text-[10px] text-ink/70">
              <div className="flex items-center gap-1">
                <Check className="w-3 h-3 text-ink" /> Author: {post.author?.name}
              </div>
              <div>Created {new Date(post.createdAt).toLocaleString()}</div>
              <div>Updated {new Date(post.updatedAt || post.createdAt).toLocaleString()}</div>
              <div className="break-all">Public URL: {post.absoluteUrl}</div>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
};

export default AdminBlogEditor;
