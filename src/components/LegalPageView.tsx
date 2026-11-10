import React, { useEffect, useMemo, useState } from 'react';
import { AlertCircle, ArrowLeft, FileText, Loader2, ShieldCheck } from 'lucide-react';
import { useApp } from '../context/AppContext';
import { api, messageForError } from '../services/apiService';
import { SEOHead } from './SEOHead';
import { SITE_ORIGIN } from '../config/site';
import type { LegalDocument, LegalDocumentType } from '../types';

/**
 * A public legal page: `/terms-and-conditions` or `/privacy-policy`.
 *
 * The text is NOT in this file and is not in any React component. It is the
 * current PUBLISHED version stored in the database, fetched from
 * `GET /api/legal/<slug>`; the server refuses to serve a draft, so this page can
 * never show an administrator's unpublished work. Publishing a new version is
 * enough to change the page — no deployment, and the URL stays the same.
 *
 * The body is rendered with `dangerouslySetInnerHTML` because it is HTML the
 * SERVER sanitised against a small allowlist (headings, paragraphs, emphasis,
 * lists, links) before storing it. Nothing from this page is user input.
 */

interface LegalPageViewProps {
  documentType: LegalDocumentType;
}

const SLUGS: Record<LegalDocumentType, string> = {
  terms: 'terms-and-conditions',
  privacy: 'privacy-policy',
};

/** `2026-11-10T18:50:43+00:00` → `10 November 2026`. */
function formatLongDate(value?: string | null): string {
  if (!value) return '';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return '';
  return parsed.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
}

export const LegalPageView: React.FC<LegalPageViewProps> = ({ documentType }) => {
  const { navigate } = useApp();
  const slug = SLUGS[documentType];

  const [document, setDocument] = useState<LegalDocument | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);

    api
      .getLegalDocument(slug)
      .then((result) => {
        if (!cancelled) setDocument(result.document);
      })
      .catch((err) => {
        if (!cancelled) setError(messageForError(err));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [slug, attempt]);

  // The other document, offered at the foot of the page as a way onwards.
  const other: { type: LegalDocumentType; label: string } =
    documentType === 'terms'
      ? { type: 'privacy', label: 'Privacy Policy' }
      : { type: 'terms', label: 'Terms and Conditions' };

  const title = document?.title ?? (documentType === 'terms' ? 'Terms and Conditions' : 'Privacy Policy');
  const description =
    document?.summary ||
    (documentType === 'terms'
      ? 'The rules that apply when you use Goodlucks Homes: accounts, listings, viewings, verification and disputes.'
      : 'What personal information Goodlucks Homes collects, how it is used and the rights you have under Ghana’s Data Protection Act, 2012 (Act 843).');

  const jsonLd = useMemo(
    () => ({
      '@context': 'https://schema.org',
      '@type': documentType === 'terms' ? 'WebPage' : 'PrivacyPolicy',
      name: title,
      description,
      url: `${SITE_ORIGIN}/${slug}`,
      ...(document?.effectiveAt ? { dateModified: document.effectiveAt } : {}),
      publisher: { '@type': 'Organization', name: 'Goodlucks Homes', url: SITE_ORIGIN },
    }),
    [documentType, title, description, slug, document?.effectiveAt]
  );

  return (
    <>
      <SEOHead
        title={`${title} | Goodlucks Homes`}
        description={description}
        canonicalUrl={`${SITE_ORIGIN}/${slug}`}
        jsonLd={jsonLd}
      />

      <main className="bg-page min-h-[70vh] py-8 sm:py-12 px-4 sm:px-6">
        <div className="max-w-3xl mx-auto">
          <button
            type="button"
            onClick={() => navigate('/')}
            className="inline-flex items-center gap-2 text-xs font-semibold text-ink/70 hover:text-ink mb-5 rounded-lg px-2 py-1 hover:bg-surface transition-colors"
          >
            <ArrowLeft className="w-4 h-4" /> Back to Goodlucks Homes
          </button>

          <article className="bg-surface border border-line rounded-2xl shadow-sm overflow-hidden">
            <header className="border-b border-line px-5 sm:px-8 py-6 sm:py-8">
              <div className="inline-flex items-center gap-2 rounded-full bg-interactive/10 border border-interactive/20 px-3 py-1 text-[10px] font-extrabold uppercase tracking-wide text-ink">
                {documentType === 'terms' ? <FileText className="w-3.5 h-3.5" /> : <ShieldCheck className="w-3.5 h-3.5" />}
                Legal
              </div>
              <h1 className="mt-3 text-2xl sm:text-3xl font-black text-ink leading-tight">{title}</h1>
              {document?.summary && <p className="mt-2 text-sm text-ink/70 leading-relaxed">{document.summary}</p>}
              <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-ink/60">
                {document?.version ? <span>Version {document.version}</span> : null}
                {document?.effectiveAt ? <span>Effective {formatLongDate(document.effectiveAt)}</span> : null}
                {document?.updatedAt ? <span>Last updated {formatLongDate(document.updatedAt)}</span> : null}
              </div>
            </header>

            <div className="px-5 sm:px-8 py-6 sm:py-8">
              {loading && (
                <div className="flex items-center gap-3 text-sm text-ink/70 py-10 justify-center">
                  <Loader2 className="w-4 h-4 animate-spin" /> Loading the {title.toLowerCase()}…
                </div>
              )}

              {!loading && error && (
                <div className="rounded-xl border border-accent/30 bg-accent/5 p-4 text-sm text-ink">
                  <p className="flex items-start gap-2 font-semibold">
                    <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
                    We could not load this page.
                  </p>
                  <p className="mt-1 text-ink/70">{error}</p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <button type="button" onClick={() => setAttempt((n) => n + 1)} className="gl-btn gl-btn-ghost">
                      Try again
                    </button>
                    <a href="/contact" className="gl-btn gl-btn-ghost">
                      Contact us
                    </a>
                  </div>
                </div>
              )}

              {!loading && !error && document && (
                <div
                  className="gl-article gl-legal"
                  // Sanitised on the server against the article allowlist; no
                  // scripts, styles, images or event handlers survive it.
                  dangerouslySetInnerHTML={{ __html: document.contentHtml }}
                />
              )}

              {!loading && !error && !document && (
                <p className="text-sm text-ink/70">
                  This document has not been published yet. Please try again shortly, or{' '}
                  <a className="font-semibold underline" href="/contact">
                    contact us
                  </a>
                  .
                </p>
              )}
            </div>

            <footer className="border-t border-line bg-page/50 px-5 sm:px-8 py-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 text-[11px] text-ink/70">
              <span>
                Questions about this document?{' '}
                <a href="/contact" className="font-semibold text-ink underline decoration-1 underline-offset-2">
                  Contact us
                </a>
              </span>
              <a
                href={`/${SLUGS[other.type]}`}
                className="font-semibold text-ink underline decoration-1 underline-offset-2"
              >
                Read the {other.label}
              </a>
            </footer>
          </article>
        </div>
      </main>
    </>
  );
};
