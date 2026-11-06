import React, { useEffect } from 'react';
import { Helmet } from 'react-helmet-async';
import { Compass, Home, Search, LifeBuoy } from 'lucide-react';
import { useApp } from '../context/AppContext';

interface NotFoundViewProps {
  /** The path the visitor asked for, shown so they can spot a typo. */
  path?: string;
}

/**
 * The page shown for a URL that does not exist.
 *
 * It is a real screen (not a blank render): the visitor keeps the navigation,
 * sees what went wrong, and gets three ways back into the site. The HTTP status
 * for the initial document is decided by the server; this view only handles the
 * in-app route, exactly like every single-page application does.
 */
export const NotFoundView: React.FC<NotFoundViewProps> = ({ path }) => {
  const { navigate } = useApp();

  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'auto' });
  }, [path]);

  return (
    <div className="min-h-[70vh] flex items-center justify-center px-4 py-16 bg-surface text-ink animate-fadeIn">
      <Helmet>
        <title>Page not found — Goodlucks Homes</title>
        <meta name="robots" content="noindex,follow" />
        <link rel="canonical" href={`${window.location.origin}/`} />
      </Helmet>

      <div className="max-w-lg w-full bg-surface border border-line rounded-2xl p-8 text-center space-y-4 shadow-lg">
        <div className="w-14 h-14 rounded-2xl bg-interactive/15 border border-interactive/30 text-ink flex items-center justify-center mx-auto">
          <Compass className="w-7 h-7" />
        </div>

        <div className="space-y-2">
          <p className="text-[11px] font-extrabold uppercase tracking-wider text-ink">Error 404</p>
          <h1 className="text-2xl font-black text-ink">We could not find that page</h1>
          <p className="text-xs text-ink/70 leading-relaxed">
            The address may be mistyped, or the page may have moved. Nothing was lost — your
            account, saved homes and requests are unaffected.
          </p>
          {path && (
            <p className="text-[11px] text-ink/70 break-all bg-surface rounded-lg px-3 py-2 font-mono">
              {path}
            </p>
          )}
        </div>

        <div className="flex flex-col sm:flex-row gap-2 justify-center pt-2">
          <button
            onClick={() => navigate('/')}
            className="gl-btn gl-btn-primary px-5 py-2.5 text-xs flex"
          >
            <Home className="w-4 h-4" />
            Back to Home
          </button>
          <button
            onClick={() => navigate('/properties')}
            className="px-5 py-2.5 rounded-xl bg-page hover:bg-line text-ink font-semibold text-xs border border-line flex items-center justify-center gap-1.5"
          >
            <Search className="w-4 h-4 text-ink" />
            Browse Properties
          </button>
          <button
            onClick={() => navigate('/contact')}
            className="px-5 py-2.5 rounded-xl bg-page hover:bg-line text-ink font-semibold text-xs border border-line flex items-center justify-center gap-1.5"
          >
            <LifeBuoy className="w-4 h-4 text-ink" />
            Contact Support
          </button>
        </div>
      </div>
    </div>
  );
};
