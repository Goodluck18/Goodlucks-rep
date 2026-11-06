import React, { useEffect, useMemo, useState } from 'react';
import { useApp } from '../context/AppContext';
import { SEOHead } from './SEOHead';
import { BlogArticleBody } from './BlogArticleBody';
import { BlogPostCard } from './BlogPostCard';
import { BlogShareButtons, BlogCategoryChip, formatBlogDate, wasUpdatedAfterPublication } from './blogShared';
import { api, messageForError } from '../services/apiService';
import { SITE_ORIGIN } from '../config/site';
import type { BlogPost } from '../types';
import { AlertCircle, ArrowLeft, Clock, Loader2, UserRound } from 'lucide-react';

/**
 * One published article (`/blog/<slug>`).
 *
 * The server answers 404 for a draft, a scheduled post before its time and an
 * unpublished one, so this page has no "preview mode" that could be mistaken for
 * the real thing — an administrator previews from the console instead.
 */
export const BlogPostView: React.FC = () => {
  const { route, navigate } = useApp();
  const slug = route.params.slug ?? '';

  const [post, setPost] = useState<BlogPost | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    setNotFound(false);
    setPost(null);

    api
      .blogPost(slug)
      .then((result) => {
        if (cancelled) return;
        setPost(result.post);
      })
      .catch((err) => {
        if (cancelled) return;
        if ((err as { status?: number })?.status === 404) {
          setNotFound(true);
          return;
        }
        setError(messageForError(err));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    window.scrollTo({ top: 0, behavior: 'smooth' });
    return () => {
      cancelled = true;
    };
  }, [slug]);

  const jsonLd = useMemo(() => {
    if (!post) return undefined;
    const url = `${SITE_ORIGIN}/blog/${post.slug}`;
    const image = post.featuredImage
      ? /^https?:\/\//i.test(post.featuredImage)
        ? post.featuredImage
        : `${SITE_ORIGIN}${post.featuredImage}`
      : `${SITE_ORIGIN}/og-image.jpg`;

    const article: Record<string, unknown> = {
      '@context': 'https://schema.org',
      '@type': 'Article',
      headline: post.title,
      description: post.seoDescription || post.summary,
      image: [image],
      datePublished: post.publishedAt || post.createdAt,
      dateModified: post.updatedAt || post.publishedAt || post.createdAt,
      author: { '@type': 'Person', name: post.author?.name || 'Goodlucks Homes' },
      publisher: {
        '@type': 'Organization',
        name: 'Goodlucks Homes',
        url: SITE_ORIGIN,
      },
      mainEntityOfPage: { '@type': 'WebPage', '@id': url },
      url,
      articleSection: post.category?.name ?? undefined,
      keywords: post.tags.length ? post.tags.join(', ') : undefined,
    };

    const breadcrumbs = {
      '@context': 'https://schema.org',
      '@type': 'BreadcrumbList',
      itemListElement: [
        { '@type': 'ListItem', position: 1, name: 'Home', item: `${SITE_ORIGIN}/` },
        { '@type': 'ListItem', position: 2, name: 'Learning Centre', item: `${SITE_ORIGIN}/blog` },
        { '@type': 'ListItem', position: 3, name: post.title, item: url },
      ],
    };

    return [article, breadcrumbs];
  }, [post]);

  if (loading) {
    return (
      <div className="min-h-[60vh] bg-page flex items-center justify-center gap-2 text-sm text-ink/70">
        <Loader2 className="w-4 h-4 animate-spin" /> Loading article…
      </div>
    );
  }

  if (notFound) {
    return (
      <div className="min-h-[70vh] bg-page text-ink flex items-center justify-center px-4 py-16">
        <div className="gl-card max-w-md w-full p-8 text-center space-y-3">
          <h1 className="text-xl font-black">This article is not available</h1>
          <p className="text-xs text-ink/70 leading-relaxed">
            It may have been unpublished by the team, or the link may be incomplete. Everything we have published is
            in the Learning Centre.
          </p>
          <button
            type="button"
            onClick={() => navigate('/blog')}
            className="gl-btn gl-btn-primary mt-2 text-xs"
          >
            Open the Learning Centre
          </button>
        </div>
      </div>
    );
  }

  if (error || !post) {
    return (
      <div className="min-h-[60vh] bg-page text-ink flex items-center justify-center px-4">
        <div role="alert" className="max-w-md text-center space-y-3">
          <AlertCircle className="w-6 h-6 text-accent mx-auto" />
          <p className="text-sm text-ink/70">{error || 'The article could not be loaded.'}</p>
          <button
            type="button"
            onClick={() => navigate('/blog')}
            className="gl-btn gl-btn-secondary text-xs"
          >
            Back to the Learning Centre
          </button>
        </div>
      </div>
    );
  }

  const canonical = `${SITE_ORIGIN}/blog/${post.slug}`;
  const publishedLabel = formatBlogDate(post.publishedAt || post.createdAt);
  const updatedLabel = wasUpdatedAfterPublication(post.publishedAt, post.updatedAt)
    ? formatBlogDate(post.updatedAt)
    : '';

  return (
    <div className="min-h-screen bg-page text-ink">
      <SEOHead
        title={post.seoTitle || `${post.title} | Goodlucks Homes`}
        description={post.seoDescription || post.summary || post.subtitle}
        canonicalUrl={canonical}
        ogType="article"
        ogImage={post.featuredImage || undefined}
        jsonLd={jsonLd}
      />

      <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <article className="gl-card p-5 sm:p-8 lg:p-10 space-y-6">
        {/* Breadcrumbs */}
        <nav aria-label="Breadcrumb" className="text-[11px] text-ink/70 flex flex-wrap items-center gap-1">
          <button type="button" onClick={() => navigate('/')} className="hover:text-ink">
            Home
          </button>
          <span aria-hidden="true">/</span>
          <button type="button" onClick={() => navigate('/blog')} className="hover:text-ink">
            Learning Centre
          </button>
          {post.category ? (
            <>
              <span aria-hidden="true">/</span>
              <button
                type="button"
                onClick={() => navigate(`/blog?category=${encodeURIComponent(post.category!.slug)}`)}
                className="hover:text-ink"
              >
                {post.category.name}
              </button>
            </>
          ) : null}
        </nav>

        <header className="space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            {post.category ? <BlogCategoryChip name={post.category.name} /> : null}
            {post.tags.map((tag) => (
              <button
                key={tag}
                type="button"
                onClick={() => navigate(`/blog?tag=${encodeURIComponent(tag)}`)}
                className="text-[10px] font-bold uppercase tracking-wider text-ink/70 hover:text-ink"
              >
                #{tag}
              </button>
            ))}
          </div>

          <h1 className="text-2xl sm:text-4xl font-black tracking-tight leading-tight">{post.title}</h1>
          {post.subtitle ? <p className="text-sm sm:text-base text-ink/70 leading-relaxed">{post.subtitle}</p> : null}

          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-ink/70 pt-1">
            {post.author?.name ? (
              <span className="flex items-center gap-1">
                <UserRound className="w-3.5 h-3.5" /> {post.author.name}
              </span>
            ) : null}
            {publishedLabel ? (
              <span>
                Published <time dateTime={post.publishedAt || post.createdAt}>{publishedLabel}</time>
              </span>
            ) : null}
            {updatedLabel ? (
              <span>
                Updated <time dateTime={post.updatedAt}>{updatedLabel}</time>
              </span>
            ) : null}
            <span className="flex items-center gap-1">
              <Clock className="w-3.5 h-3.5" /> {post.readingMinutes} min read
            </span>
          </div>
        </header>

        {post.featuredImage ? (
          <figure className="rounded-2xl overflow-hidden border border-line bg-surface">
            <img
              src={post.featuredImage}
              alt={post.featuredImageAlt || post.title}
              className="w-full h-auto object-cover"
              loading="eager"
              decoding="async"
            />
          </figure>
        ) : null}

        <BlogArticleBody
          html={post.contentHtml}
          placeholder={post.showcasePlaceholder}
          cards={post.propertyCards ?? []}
          showcaseHeading="Listings in this article"
        />

        <div className="pt-2 border-t border-line">
          <BlogShareButtons url={canonical} title={post.title} />
        </div>

        {/* Internal links: the practical next steps. */}
        <aside className="rounded-2xl border border-line bg-surface p-5 space-y-3">
          <h2 className="text-sm font-bold text-ink">Keep going</h2>
          <div className="flex flex-wrap gap-2 text-xs font-bold">
            <button
              type="button"
              onClick={() => navigate('/properties')}
              className="px-3 py-2 rounded-xl bg-page border border-line hover:bg-page"
            >
              Browse current listings
            </button>
            <button
              type="button"
              onClick={() => navigate('/find-a-home')}
              className="px-3 py-2 rounded-xl bg-page border border-line hover:bg-page"
            >
              Ask us to find a home
            </button>
            <button
              type="button"
              onClick={() => navigate('/contact')}
              className="px-3 py-2 rounded-xl bg-page border border-line hover:bg-page"
            >
              Contact the team
            </button>
          </div>
        </aside>

        {post.related.length > 0 ? (
          <section className="space-y-3 pt-2">
            <h2 className="text-lg font-black text-ink">Related articles</h2>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              {post.related.map((related) => (
                <BlogPostCard key={related.id} post={related} variant="compact" />
              ))}
            </div>
          </section>
        ) : null}

        <button
          type="button"
          onClick={() => navigate('/blog')}
          className="gl-link inline-flex items-center gap-1 text-xs font-bold"
        >
          <ArrowLeft className="w-3.5 h-3.5" /> All articles
        </button>
      </article>
      </div>
    </div>
  );
};

export default BlogPostView;
