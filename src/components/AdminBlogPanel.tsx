import React, { useCallback, useEffect, useState } from 'react';
import { api, messageForError } from '../services/apiService';
import { useApp } from '../context/AppContext';
import { AdminBlogEditor } from './AdminBlogEditor';
import type { BlogCategory, BlogPostSummary, BlogPostStatus } from '../types';
import {
  AlertCircle,
  BookOpen,
  CalendarClock,
  CheckCircle2,
  Eye,
  FolderPlus,
  Loader2,
  Pencil,
  Plus,
  RefreshCw,
  Search,
  Trash2,
} from 'lucide-react';

/**
 * Blog Management inside the existing admin console.
 *
 * The list is the console view of every article, in every status; the editor is
 * one screen away. Nothing here can publish by accident: "New article" creates a
 * draft, and publication is its own explicit action in the editor.
 */
export const AdminBlogPanel: React.FC = () => {
  const { showSuccessToast, showErrorToast, showInfoToast, navigate } = useApp();

  const [posts, setPosts] = useState<BlogPostSummary[]>([]);
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [categories, setCategories] = useState<BlogCategory[]>([]);
  const [statusFilter, setStatusFilter] = useState('');
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  // Category manager
  const [showCategories, setShowCategories] = useState(false);
  const [newCategoryName, setNewCategoryName] = useState('');
  const [newCategoryDescription, setNewCategoryDescription] = useState('');
  const [categoryBusy, setCategoryBusy] = useState(false);

  const notify = useCallback(
    (kind: 'success' | 'error' | 'info', title: string, message?: string) => {
      if (kind === 'success') showSuccessToast(title, message);
      else if (kind === 'error') showErrorToast(title, message);
      else showInfoToast(title, message);
    },
    [showSuccessToast, showErrorToast, showInfoToast]
  );

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await api.adminBlogPosts({ status: statusFilter, q: query });
      setPosts(result.posts ?? []);
      setCounts(result.counts ?? {});
      setCategories(result.categories ?? []);
    } catch (err) {
      setError(messageForError(err));
    } finally {
      setLoading(false);
    }
  }, [statusFilter, query]);

  useEffect(() => {
    void load();
  }, [load]);

  const dateLabel = (value: string) => {
    if (!value) return '—';
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? '—' : date.toLocaleString();
  };

  const statusBadge = (status: BlogPostStatus) => {
    const styles: Record<string, string> = {
      published: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30',
      scheduled: 'bg-amber-500/15 text-amber-300 border-amber-500/30',
      unpublished: 'bg-slate-500/15 text-slate-300 border-slate-500/30',
      draft: 'bg-white/5 text-slate-300 border-white/10',
    };
    return (
      <span className={`px-2 py-0.5 rounded-full text-[10px] font-extrabold uppercase tracking-wider border ${styles[status] ?? styles.draft}`}>
        {status}
      </span>
    );
  };

  const createCategory = async () => {
    if (newCategoryName.trim().length < 2) {
      notify('error', 'Category name too short', 'Enter at least 2 characters.');
      return;
    }
    setCategoryBusy(true);
    try {
      const result = await api.adminBlogCreateCategory({
        name: newCategoryName.trim(),
        description: newCategoryDescription.trim(),
      });
      notify('success', 'Category created', `${result.category.name} is available for articles now.`);
      setNewCategoryName('');
      setNewCategoryDescription('');
      await load();
    } catch (err) {
      notify('error', 'Could not create the category', messageForError(err));
    } finally {
      setCategoryBusy(false);
    }
  };

  const deleteCategory = async (category: BlogCategory) => {
    if (!window.confirm(`Delete the category “${category.name}”? A category with articles cannot be deleted.`)) return;
    setCategoryBusy(true);
    try {
      await api.adminBlogDeleteCategory(category.id);
      notify('success', 'Category deleted');
      await load();
    } catch (err) {
      notify('error', 'Could not delete the category', messageForError(err));
    } finally {
      setCategoryBusy(false);
    }
  };

  if (creating || editingId) {
    return (
      <AdminBlogEditor
        postId={editingId}
        categories={categories}
        notify={notify}
        onSaved={() => void load()}
        onClose={() => {
          setCreating(false);
          setEditingId(null);
          void load();
        }}
      />
    );
  }

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold text-white flex items-center gap-2">
            <BookOpen className="w-5 h-5 text-[#08D9D6]" /> Blog &amp; Learning Centre
          </h2>
          <p className="text-xs text-slate-400 max-w-2xl">
            Write and publish the guides that appear at /blog. Drafts, scheduled articles and unpublished articles are
            private: they are not reachable at their URL, not in the sitemap and cannot be linked from an email template.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => setShowCategories((value) => !value)}
            className="px-3 py-2 rounded-xl bg-white/10 text-xs font-bold flex items-center gap-1.5"
          >
            <FolderPlus className="w-3.5 h-3.5" /> Categories ({categories.length})
          </button>
          <button
            type="button"
            onClick={() => void load()}
            className="px-3 py-2 rounded-xl bg-white/10 text-xs font-bold flex items-center gap-1.5"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} /> Refresh
          </button>
          <button
            type="button"
            onClick={() => setCreating(true)}
            className="px-3 py-2 rounded-xl bg-[#08D9D6] text-[#252A34] text-xs font-bold flex items-center gap-1.5"
          >
            <Plus className="w-3.5 h-3.5" /> New article
          </button>
        </div>
      </div>

      {/* Counts */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
        {[
          { key: '', label: 'All articles', value: counts.total ?? 0 },
          { key: 'published', label: 'Published', value: counts.published ?? 0 },
          { key: 'scheduled', label: 'Scheduled', value: counts.scheduled ?? 0 },
          { key: 'draft', label: 'Drafts', value: counts.draft ?? 0 },
          { key: 'unpublished', label: 'Unpublished', value: counts.unpublished ?? 0 },
        ].map((item) => (
          <button
            key={item.key || 'all'}
            type="button"
            onClick={() => setStatusFilter(item.key)}
            className={`rounded-2xl border p-3 text-left transition-colors ${
              statusFilter === item.key
                ? 'border-[#08D9D6]/50 bg-[#08D9D6]/10'
                : 'border-white/10 bg-slate-800/70 hover:bg-slate-800'
            }`}
          >
            <div className="text-lg font-black text-white">{item.value}</div>
            <div className="text-[10px] uppercase tracking-wider text-slate-400">{item.label}</div>
          </button>
        ))}
      </div>

      {showCategories ? (
        <div className="bg-slate-800/70 border border-white/10 rounded-2xl p-4 space-y-3">
          <h3 className="text-sm font-bold text-white">Article categories</h3>
          <ul className="divide-y divide-white/5">
            {categories.map((category) => (
              <li key={category.id} className="flex items-center gap-2 py-2">
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-bold text-white">{category.name}</p>
                  <p className="text-[10px] text-slate-400">
                    /blog?category={category.slug} · {category.publishedCount ?? 0} published
                    {typeof category.postCount === 'number' ? `, ${category.postCount} in total` : ''}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => void deleteCategory(category)}
                  disabled={categoryBusy}
                  className="p-1.5 rounded-lg bg-[#FF2E63]/15 text-[#FF8FA8] disabled:opacity-40"
                  aria-label={`Delete ${category.name}`}
                >
                  <Trash2 className="w-3 h-3" />
                </button>
              </li>
            ))}
            {categories.length === 0 ? (
              <li className="py-2 text-xs text-slate-400">No categories yet.</li>
            ) : null}
          </ul>
          <div className="grid grid-cols-1 sm:grid-cols-[1fr_1.5fr_auto] gap-2">
            <input
              value={newCategoryName}
              onChange={(event) => setNewCategoryName(event.target.value)}
              placeholder="Category name"
              className="bg-slate-900 border border-white/10 rounded-xl px-3 py-2 text-xs text-white"
            />
            <input
              value={newCategoryDescription}
              onChange={(event) => setNewCategoryDescription(event.target.value)}
              placeholder="Short description (optional)"
              className="bg-slate-900 border border-white/10 rounded-xl px-3 py-2 text-xs text-white"
            />
            <button
              type="button"
              onClick={() => void createCategory()}
              disabled={categoryBusy}
              className="px-3 py-2 rounded-xl bg-[#08D9D6] text-[#252A34] text-xs font-bold disabled:opacity-50"
            >
              {categoryBusy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : 'Add category'}
            </button>
          </div>
          <p className="text-[10px] text-slate-500">
            Categories are data, not code: adding one here makes it available to every article and to the public
            filter bar immediately.
          </p>
        </div>
      ) : null}

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex-1 min-w-[200px] flex items-center gap-2 bg-slate-900 border border-white/10 rounded-xl px-3 py-2">
          <Search className="w-4 h-4 text-[#08D9D6]" />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search titles and slugs"
            className="flex-1 bg-transparent text-xs text-white outline-none"
          />
        </div>
        <select
          value={statusFilter}
          onChange={(event) => setStatusFilter(event.target.value)}
          className="bg-slate-900 border border-white/10 rounded-xl px-3 py-2 text-xs text-white"
        >
          <option value="">All statuses</option>
          <option value="published">Published</option>
          <option value="scheduled">Scheduled</option>
          <option value="draft">Draft</option>
          <option value="unpublished">Unpublished</option>
        </select>
      </div>

      {error ? (
        <div role="alert" className="p-3 rounded-xl bg-[#FF2E63]/15 border border-[#FF2E63]/30 text-[#FF8FA8] text-xs flex items-start gap-2">
          <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
          <span className="flex-1">{error}</span>
        </div>
      ) : null}

      {loading ? (
        <div className="flex items-center gap-2 text-xs text-slate-400 py-10 justify-center">
          <Loader2 className="w-4 h-4 animate-spin" /> Loading articles…
        </div>
      ) : posts.length === 0 ? (
        <div className="rounded-2xl border border-white/10 bg-slate-800/60 p-8 text-center space-y-2">
          <CheckCircle2 className="w-6 h-6 text-[#08D9D6] mx-auto" />
          <p className="text-sm font-bold text-white">No articles here yet</p>
          <p className="text-xs text-slate-400">
            Create the first guide. It starts as a draft, so nothing is public until you publish it.
          </p>
          <button
            type="button"
            onClick={() => setCreating(true)}
            className="mt-2 px-4 py-2 rounded-xl bg-[#08D9D6] text-[#252A34] text-xs font-bold"
          >
            Write an article
          </button>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-white/10">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-800/80 text-[10px] uppercase tracking-wider text-slate-400">
              <tr>
                <th className="p-3">Article</th>
                <th className="p-3">Status</th>
                <th className="p-3 hidden md:table-cell">Category</th>
                <th className="p-3 hidden lg:table-cell">Published</th>
                <th className="p-3 hidden lg:table-cell">Updated</th>
                <th className="p-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {posts.map((post) => (
                <tr key={post.id} className="bg-slate-900/40 hover:bg-slate-800/60">
                  <td className="p-3">
                    <button
                      type="button"
                      onClick={() => setEditingId(post.id)}
                      className="text-left font-bold text-white hover:text-[#08D9D6]"
                    >
                      {post.title}
                    </button>
                    <div className="text-[10px] text-slate-500">/blog/{post.slug}</div>
                  </td>
                  <td className="p-3">{statusBadge(post.status)}</td>
                  <td className="p-3 hidden md:table-cell text-slate-300">{post.category?.name ?? '—'}</td>
                  <td className="p-3 hidden lg:table-cell text-slate-400">
                    {post.status === 'scheduled' ? (
                      <span className="flex items-center gap-1 text-amber-300">
                        <CalendarClock className="w-3 h-3" /> {dateLabel(post.publishAt)}
                      </span>
                    ) : (
                      dateLabel(post.publishedAt)
                    )}
                  </td>
                  <td className="p-3 hidden lg:table-cell text-slate-400">{dateLabel(post.updatedAt || post.createdAt)}</td>
                  <td className="p-3">
                    <div className="flex items-center justify-end gap-1">
                      <button
                        type="button"
                        onClick={() => setEditingId(post.id)}
                        className="p-1.5 rounded-lg bg-white/5 hover:bg-white/10"
                        aria-label={`Edit ${post.title}`}
                      >
                        <Pencil className="w-3 h-3" />
                      </button>
                      {post.status === 'published' ? (
                        <button
                          type="button"
                          onClick={() => navigate(`/blog/${post.slug}`)}
                          className="p-1.5 rounded-lg bg-white/5 hover:bg-white/10"
                          aria-label={`View ${post.title} on the site`}
                        >
                          <Eye className="w-3 h-3" />
                        </button>
                      ) : null}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <p className="text-[10px] text-slate-500 leading-snug">
        Publication rules: only a published article is public. A scheduled article becomes public at its own time; a
        draft or an unpublished article is never served at its URL. The author shown on an article is the administrator
        account that last saved it.
      </p>
    </div>
  );
};

export default AdminBlogPanel;
