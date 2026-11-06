import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useApp } from '../context/AppContext';
import { SEOHead } from './SEOHead';
import { BlogPostCard } from './BlogPostCard';
import { api, messageForError } from '../services/apiService';
import { SITE_ORIGIN } from '../config/site';
import type { BlogCategory, BlogPostSummary } from '../types';
import { BookOpen, ChevronLeft, ChevronRight, Loader2, Search, Sparkles, AlertCircle } from 'lucide-react';

/**
 * The Blog & Learning Centre index (`/blog`).
 *
 * Only published articles are ever returned by `/api/blog`, so this page cannot
 * show a draft even by accident. The active category and page live in the URL
 * (`/blog?category=tenant-guides&page=2`), which keeps a filtered view
 * shareable and restores it on reload.
 */
export const BlogView: React.FC = () => {
  const { route, navigate } = useApp();
  const categorySlug = route.query.category ?? '';
  const page = Math.max(1, Number(route.query.page ?? '1') || 1);
  const searchTerm = route.query.q ?? '';

  const [categories, setCategories] = useState<BlogCategory[]>([]);
  const [featured, setFeatured] = useState<BlogPostSummary[]>([]);
  const [posts, setPosts] = useState<BlogPostSummary[]>([]);
  const [pagination, setPagination] = useState({ page: 1, perPage: 9, total: 0, pages: 0 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchDraft, setSearchDraft] = useState(searchTerm);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await api.blogIndex({ category: categorySlug, page, q: searchTerm });
      setCategories(result.categories ?? []);
      setFeatured(result.featured ?? []);
      setPosts(result.posts ?? []);
      setPagination(result.pagination ?? { page: 1, perPage: 9, total: 0, pages: 0 });
    } catch (err) {
      setError(messageForError(err));
    } finally {
      setLoading(false);
    }
  }, [categorySlug, page, searchTerm]);

  useEffect(() => {
    void load();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, [load]);

  const goToCategory = (slug: string) => {
    const params = new URLSearchParams();
    if (slug) params.set('category', slug);
    const query = params.toString();
    navigate(`/blog${query ? `?${query}` : ''}`);
  };

  const goToPage = (next: number) => {
    const params = new URLSearchParams();
    if (categorySlug) params.set('category', categorySlug);
    if (searchTerm) params.set('q', searchTerm);
    if (next > 1) params.set('page', String(next));
    const query = params.toString();
    navigate(`/blog${query ? `?${query}` : ''}`);
  };

  const activeCategory = useMemo(
    () => categories.find((category) => category.slug === categorySlug) ?? null,
    [categories, categorySlug]
  );

  const jsonLd = useMemo(
    () => [
      {
        '@context': 'https://schema.org',
        '@type': 'CollectionPage',
        name: 'Goodlucks Homes Learning Centre',
        description:
          'Guides to renting in Ghana for tenants, landlords and agents, and how the Goodlucks Homes platform works.',
        url: `${SITE_ORIGIN}/blog`,
        isPartOf: { '@type': 'WebSite', name: 'Goodlucks Homes', url: SITE_ORIGIN },
      },
      {
        '@context': 'https://schema.org',
        '@type': 'BreadcrumbList',
        itemListElement: [
          { '@type': 'ListItem', position: 1, name: 'Home', item: `${SITE_ORIGIN}/` },
          { '@type': 'ListItem', position: 2, name: 'Learning Centre', item: `${SITE_ORIGIN}/blog` },
        ],
      },
    ],
    []
  );

  const submitSearch = (event: React.FormEvent) => {
    event.preventDefault();
    const params = new URLSearchParams();
    if (searchDraft.trim()) params.set('q', searchDraft.trim());
    if (categorySlug) params.set('category', categorySlug);
    const query = params.toString();
    navigate(`/blog${query ? `?${query}` : ''}`);
  };

  return (
    <div className="min-h-screen bg-[#1F242D] text-white">
      <SEOHead
        title={
          activeCategory
            ? `${activeCategory.name} articles | Goodlucks Homes Learning Centre`
            : 'Learning Centre: renting guides for Ghana | Goodlucks Homes'
        }
        description={
          activeCategory?.description ||
          'Practical guides to renting in Ghana: finding a home, arranging a viewing, landlord responsibilities, agent onboarding and how Goodlucks Homes works.'
        }
        canonicalUrl={`${SITE_ORIGIN}/blog${activeCategory ? `?category=${encodeURIComponent(activeCategory.slug)}` : ''}`}
        jsonLd={jsonLd}
      />

      {/* Hero */}
      <header className="border-b border-white/10 bg-gradient-to-b from-[#252A34] to-[#1F242D]">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-10 sm:py-14 space-y-4">
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-[#08D9D6]/10 border border-[#08D9D6]/25 text-[11px] font-bold uppercase tracking-wider text-[#08D9D6]">
            <BookOpen className="w-3.5 h-3.5" /> Blog &amp; Learning Centre
          </div>
          <h1 className="text-3xl sm:text-4xl font-black tracking-tight">
            Renting in Ghana, explained
          </h1>
          <p className="text-sm sm:text-base text-slate-300 max-w-2xl leading-relaxed">
            Guides for tenants, landlords and agents: how viewings are arranged, what a listing review does and
            does not cover, how fees and commissions work, and what to check before you pay anything. Written by the
            Goodlucks Homes team from the way the platform actually works.
          </p>

          <form onSubmit={submitSearch} className="max-w-md w-full">
            <div className="flex items-center gap-2 bg-slate-900/80 border border-white/10 rounded-xl px-3 py-2 focus-within:border-[#08D9D6]">
              <Search className="w-4 h-4 text-[#08D9D6] shrink-0" />
              <input
                type="search"
                value={searchDraft}
                onChange={(event) => setSearchDraft(event.target.value)}
                placeholder="Search the Learning Centre"
                aria-label="Search articles"
                className="flex-1 bg-transparent text-sm text-white placeholder:text-slate-500 outline-none"
              />
              <button
                type="submit"
                className="px-3 py-1 rounded-lg bg-[#08D9D6] text-[#252A34] text-xs font-bold shrink-0"
              >
                Search
              </button>
            </div>
          </form>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-10">
        {/* Categories */}
        <nav aria-label="Article categories" className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => goToCategory('')}
            className={`px-3 py-1.5 rounded-full text-xs font-bold border transition-colors ${
              categorySlug === ''
                ? 'bg-[#08D9D6] text-[#252A34] border-[#08D9D6]'
                : 'bg-white/5 text-slate-200 border-white/10 hover:bg-white/10'
            }`}
          >
            All articles
          </button>
          {categories.map((category) => (
            <button
              key={category.id}
              type="button"
              onClick={() => goToCategory(category.slug)}
              className={`px-3 py-1.5 rounded-full text-xs font-bold border transition-colors ${
                categorySlug === category.slug
                  ? 'bg-[#08D9D6] text-[#252A34] border-[#08D9D6]'
                  : 'bg-white/5 text-slate-200 border-white/10 hover:bg-white/10'
              }`}
            >
              {category.name}
              {typeof category.publishedCount === 'number' ? (
                <span className="ml-1 text-[10px] opacity-70">({category.publishedCount})</span>
              ) : null}
            </button>
          ))}
        </nav>

        {error ? (
          <div role="alert" className="p-4 rounded-2xl bg-[#FF2E63]/10 border border-[#FF2E63]/30 text-sm text-[#FF8FA8] flex items-start gap-2">
            <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
            <span className="flex-1">
              {error}
              <button type="button" onClick={() => void load()} className="ml-2 font-bold underline">
                Try again
              </button>
            </span>
          </div>
        ) : null}

        {loading ? (
          <div className="flex items-center gap-2 text-sm text-slate-400 py-16 justify-center">
            <Loader2 className="w-4 h-4 animate-spin" /> Loading articles…
          </div>
        ) : (
          <>
            {featured.length > 0 ? (
              <section className="space-y-3">
                <h2 className="text-lg font-black text-white flex items-center gap-2">
                  <Sparkles className="w-4 h-4 text-[#08D9D6]" /> Featured
                </h2>
                <div className="space-y-3">
                  {featured.map((post, index) => (
                    <BlogPostCard
                      key={post.id}
                      post={post}
                      variant={index === 0 ? 'lead' : 'default'}
                      onSelectCategory={goToCategory}
                    />
                  ))}
                </div>
              </section>
            ) : null}

            <section className="space-y-3">
              <div className="flex items-baseline justify-between gap-3 border-b border-white/10 pb-2">
                <h2 className="text-lg font-black text-white">
                  {activeCategory ? activeCategory.name : searchTerm ? `Search: “${searchTerm}”` : 'Latest articles'}
                </h2>
                <span className="text-[11px] text-slate-400">
                  {pagination.total} article{pagination.total === 1 ? '' : 's'}
                </span>
              </div>

              {posts.length === 0 ? (
                <div className="rounded-2xl border border-white/10 bg-[#252A34]/70 p-8 text-center space-y-2">
                  <p className="text-sm font-bold text-white">Nothing here yet</p>
                  <p className="text-xs text-slate-400 max-w-md mx-auto">
                    {searchTerm
                      ? 'No published article matches that search. Try a different word, or browse all articles.'
                      : 'No articles have been published in this section yet. Check back soon, or browse everything.'}
                  </p>
                  <button
                    type="button"
                    onClick={() => navigate('/blog')}
                    className="mt-2 px-4 py-2 rounded-xl bg-[#08D9D6] text-[#252A34] text-xs font-bold"
                  >
                    See all articles
                  </button>
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                  {posts.map((post) => (
                    <BlogPostCard key={post.id} post={post} onSelectCategory={goToCategory} />
                  ))}
                </div>
              )}
            </section>

            {pagination.pages > 1 ? (
              <nav aria-label="Article pages" className="flex items-center justify-center gap-2 pt-2">
                <button
                  type="button"
                  disabled={pagination.page <= 1}
                  onClick={() => goToPage(pagination.page - 1)}
                  className="inline-flex items-center gap-1 px-3 py-2 rounded-xl bg-white/5 border border-white/10 text-xs font-bold disabled:opacity-40"
                >
                  <ChevronLeft className="w-3.5 h-3.5" /> Newer
                </button>
                <span className="text-xs text-slate-400">
                  Page {pagination.page} of {pagination.pages}
                </span>
                <button
                  type="button"
                  disabled={pagination.page >= pagination.pages}
                  onClick={() => goToPage(pagination.page + 1)}
                  className="inline-flex items-center gap-1 px-3 py-2 rounded-xl bg-white/5 border border-white/10 text-xs font-bold disabled:opacity-40"
                >
                  Older <ChevronRight className="w-3.5 h-3.5" />
                </button>
              </nav>
            ) : null}
          </>
        )}

        {/* The honest note about what these articles are. */}
        <section className="rounded-2xl border border-white/10 bg-[#252A34]/60 p-5 space-y-2">
          <h2 className="text-sm font-bold text-white">About these guides</h2>
          <p className="text-xs text-slate-300 leading-relaxed">
            Goodlucks Homes is a property discovery and rental intermediary. Our guides explain how renting through
            the platform works and what to check before you commit to a home. They are general information, not legal
            advice, and a listing review is not an inspection of the property.
          </p>
        </section>
      </main>
    </div>
  );
};

export default BlogView;
