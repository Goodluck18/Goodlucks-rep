import React from 'react';
import { useApp } from '../context/AppContext';
import { formatBlogDate, BlogCategoryChip } from './blogShared';
import { Clock, UserRound } from 'lucide-react';
import type { BlogPostSummary } from '../types';

interface Props {
  post: BlogPostSummary;
  /** The lead card on the index: bigger image, larger heading. */
  variant?: 'lead' | 'default' | 'compact';
  onSelectCategory?: (slug: string) => void;
}

/**
 * An article teaser. One component for the featured strip, the latest list and
 * the related-article row so the same article never has three different looks.
 */
export const BlogPostCard: React.FC<Props> = ({ post, variant = 'default', onSelectCategory }) => {
  const { navigate } = useApp();
  const isLead = variant === 'lead';
  const isCompact = variant === 'compact';

  const open = (event: React.MouseEvent) => {
    event.preventDefault();
    navigate(`/blog/${post.slug}`);
  };

  return (
    <article
      className={`group bg-[#252A34]/90 border border-white/10 rounded-2xl overflow-hidden flex flex-col h-full hover:border-[#08D9D6]/40 hover:shadow-xl hover:shadow-[#08D9D6]/10 transition-all ${
        isLead ? 'sm:flex-row' : ''
      }`}
    >
      <a
        href={`/blog/${post.slug}`}
        onClick={open}
        className={`block bg-slate-800 overflow-hidden ${
          isLead ? 'sm:w-1/2 aspect-[16/10] sm:aspect-auto' : isCompact ? 'aspect-[16/9]' : 'aspect-[16/10]'
        }`}
        tabIndex={-1}
        aria-hidden="true"
      >
        {post.featuredImage ? (
          <img
            src={post.featuredImage}
            alt={post.featuredImageAlt || post.title}
            loading="lazy"
            decoding="async"
            className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
          />
        ) : (
          <div className="w-full h-full min-h-[140px] flex items-center justify-center bg-gradient-to-br from-[#08D9D6]/10 to-transparent text-[#08D9D6]/60">
            <span className="text-xs font-bold uppercase tracking-widest">Learning Centre</span>
          </div>
        )}
      </a>

      <div className={`flex flex-col gap-2 ${isLead ? 'p-5 sm:p-6 sm:w-1/2 justify-center' : isCompact ? 'p-3' : 'p-4'}`}>
        <div className="flex flex-wrap items-center gap-2">
          {post.category ? (
            <BlogCategoryChip name={post.category.name} slug={post.category.slug} onSelect={onSelectCategory} />
          ) : null}
          {post.isFeatured ? (
            <span className="text-[10px] font-bold uppercase tracking-wider text-amber-300">Featured</span>
          ) : null}
        </div>

        <h3 className={`font-black text-white leading-snug ${isLead ? 'text-xl sm:text-2xl' : isCompact ? 'text-sm' : 'text-base'}`}>
          <a href={`/blog/${post.slug}`} onClick={open} className="hover:text-[#08D9D6] transition-colors">
            {post.title}
          </a>
        </h3>

        {post.summary ? (
          <p className={`text-slate-300 leading-relaxed ${isCompact ? 'text-[11px] line-clamp-2' : isLead ? 'text-sm' : 'text-xs'}`}>
            {post.summary}
          </p>
        ) : null}

        <div className="mt-auto pt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[10px] text-slate-400">
          <span>{formatBlogDate(post.publishedAt || post.createdAt)}</span>
          <span className="flex items-center gap-1">
            <Clock className="w-3 h-3" /> {post.readingMinutes} min read
          </span>
          {post.author?.name ? (
            <span className="flex items-center gap-1">
              <UserRound className="w-3 h-3" /> {post.author.name}
            </span>
          ) : null}
        </div>
      </div>
    </article>
  );
};

export default BlogPostCard;
