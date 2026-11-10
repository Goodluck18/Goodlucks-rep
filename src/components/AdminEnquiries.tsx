import React, { useCallback, useEffect, useState } from 'react';
import { AlertCircle, ChevronLeft, ChevronRight, Loader2, Mail, Search } from 'lucide-react';
import { api, messageForError } from '../services/apiService';
import { Enquiry } from '../types';
import { useApp } from '../context/AppContext';

/** The enquiry lifecycle, in the order an administrator works through it. */
const STATUSES: Array<{ value: Enquiry['status'] | ''; label: string; hint: string }> = [
  { value: '', label: 'All', hint: 'Every enquiry' },
  { value: 'new', label: 'New', hint: 'Just arrived, nobody has picked it up' },
  { value: 'received', label: 'Received', hint: 'Taken on by an administrator' },
  { value: 'contacted', label: 'Contacted', hint: 'The visitor has been contacted' },
  { value: 'replied', label: 'Replied', hint: 'An answer was sent' },
  { value: 'closed', label: 'Closed', hint: 'No further action' },
];

const PAGE_SIZE = 10;

/**
 * Web enquiries (Upgrade 2, A10).
 *
 * Why this is server-backed
 * -------------------------
 * The console fetched every enquiry once and filtered it in memory. A search did
 * not exist at all, and any enquiry past the fetch cap was invisible. The search
 * here is a real query over the stored records — name, email address or phone
 * number — and the status chips filter in SQL.
 *
 * The counts on the chips come from the server and cover EVERY enquiry, so they
 * stay truthful while a search narrows the list below them.
 *
 * Moving an enquiry forward writes the new status through the existing admin
 * endpoint (which audits the change). Nothing is marked `replied` automatically:
 * that word means an answer was actually sent, and only a person knows that.
 */
export const AdminEnquiries: React.FC = () => {
  const { setEnquiryStatus, showSuccessToast, showErrorToast } = useApp();

  const [query, setQuery] = useState('');
  const [status, setStatus] = useState<Enquiry['status'] | ''>('');
  const [enquiries, setEnquiries] = useState<Enquiry[]>([]);
  const [statusCounts, setStatusCounts] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [page, setPage] = useState(1);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await api.listEnquiries({ q: query.trim(), status });
      setEnquiries(result.enquiries ?? []);
      setStatusCounts(result.statusCounts ?? {});
    } catch (err) {
      setError(messageForError(err));
    } finally {
      setLoading(false);
    }
  }, [query, status]);

  // One request per pause in typing.
  useEffect(() => {
    const timer = setTimeout(() => {
      void load();
    }, 250);
    return () => clearTimeout(timer);
  }, [load]);

  useEffect(() => {
    setPage(1);
  }, [query, status]);

  const move = async (enquiry: Enquiry, next: Enquiry['status']) => {
    setBusyId(enquiry.id);
    try {
      await setEnquiryStatus(enquiry.id, next);
      await load();
      showSuccessToast('Enquiry updated', `${enquiry.name} is marked ${next}.`);
    } catch (err) {
      showErrorToast('Could not update the enquiry', messageForError(err));
    } finally {
      setBusyId(null);
    }
  };

  const total = enquiries.length;
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const current = Math.min(page, pages);
  const visible = enquiries.slice((current - 1) * PAGE_SIZE, current * PAGE_SIZE);
  const totalAll = Object.values(statusCounts).reduce<number>((sum, value) => sum + Number(value ?? 0), 0);

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
        <div>
          <h2 className="text-xl font-bold text-ink">Website Enquiries & Messages</h2>
          <p className="text-xs text-ink/70">
            Contact form and property questions submitted through the website. Search covers the name, email address and
            phone number as stored.
          </p>
        </div>
        <span className="px-3 py-1 rounded-full bg-interactive/15 text-ink text-xs font-bold border border-interactive/30 shrink-0">
          {totalAll.toLocaleString()} {totalAll === 1 ? 'enquiry' : 'enquiries'}
        </span>
      </div>

      <div className="bg-surface border border-line rounded-2xl p-3 space-y-2">
        <div className="relative">
          <Search className="w-4 h-4 absolute left-3 top-2.5 text-ink/60" />
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search by name, email or phone number…"
            aria-label="Search enquiries"
            className="w-full bg-page border border-line rounded-xl pl-9 pr-3 py-2 text-xs text-ink"
          />
        </div>

        <div className="flex flex-wrap gap-1.5">
          {STATUSES.map((option) => {
            const selected = status === option.value;
            const count = option.value === '' ? totalAll : statusCounts[option.value] ?? 0;
            return (
              <button
                key={option.value || 'all'}
                type="button"
                title={option.hint}
                onClick={() => setStatus(option.value)}
                aria-pressed={selected}
                className={`px-2.5 py-1 rounded-lg text-[11px] font-bold border ${
                  selected ? 'bg-interactive text-ink border-interactive' : 'bg-page text-ink border-line'
                }`}
              >
                {option.label} ({count})
              </button>
            );
          })}
        </div>

        <p className="text-[10px] text-ink/70">
          {loading
            ? 'Searching the enquiries…'
            : total === 0
              ? 'No enquiry matches this search and status.'
              : `Showing ${(current - 1) * PAGE_SIZE + 1}–${Math.min(current * PAGE_SIZE, total)} of ${total}`}
        </p>
      </div>

      {error ? (
        <div role="alert" className="p-3 rounded-xl bg-accent/15 border border-accent/30 text-ink text-xs flex items-start gap-2">
          <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
          <span className="flex-1">{error}</span>
          <button type="button" onClick={() => void load()} className="font-bold">
            Try again
          </button>
        </div>
      ) : null}

      {loading ? (
        <div className="p-8 flex items-center justify-center gap-2 text-xs text-ink/70 bg-surface border border-line rounded-2xl">
          <Loader2 className="w-4 h-4 animate-spin" /> Loading enquiries…
        </div>
      ) : visible.length === 0 ? (
        <div className="text-center py-12 bg-surface/40 rounded-2xl border border-line">
          <Mail className="w-12 h-12 text-ink/70 mx-auto mb-3" />
          <div className="text-base font-bold text-ink">
            {query || status ? 'No matching enquiry' : 'No enquiries yet'}
          </div>
          <p className="text-xs text-ink/70">
            {query || status
              ? 'Try a different name, phone number or status.'
              : 'Messages sent from the contact form will appear here.'}
          </p>
        </div>
      ) : (
        <div className="bg-surface rounded-2xl border border-line divide-y divide-line">
          {visible.map((enquiry) => (
            <div key={enquiry.id} className="p-4 space-y-1.5">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="px-2 py-0.5 rounded bg-interactive/20 text-ink font-bold text-[10px] uppercase">
                  {enquiry.source === 'property_page' ? 'property enquiry' : 'contact form'}
                </span>
                <span className="font-bold text-ink text-sm">{enquiry.name}</span>
                <span className="text-[11px] text-ink/70 break-all">{enquiry.email}</span>
                {enquiry.phone && <span className="text-[11px] text-ink/70">• {enquiry.phone}</span>}
                <span
                  className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
                    enquiry.status === 'new'
                      ? 'bg-amber-500/20 text-amber-700'
                      : enquiry.status === 'received'
                        ? 'bg-interactive/20 text-ink'
                        : enquiry.status === 'contacted'
                          ? 'bg-sky-500/20 text-sky-700'
                          : enquiry.status === 'replied'
                            ? 'bg-emerald-500/20 text-emerald-700'
                            : 'bg-line/40 text-ink/70'
                  }`}
                >
                  {enquiry.status}
                </span>
                <span className="text-[10px] text-ink/70 ml-auto">
                  {new Date(enquiry.createdAt).toLocaleString()}
                </span>
              </div>
              {enquiry.propertyTitle && <div className="text-[11px] text-ink">Re: {enquiry.propertyTitle}</div>}
              <p className="text-xs text-ink/70 whitespace-pre-line">{enquiry.message}</p>

              <div className="flex flex-wrap items-center gap-1.5 pt-1">
                {enquiry.status === 'new' ? (
                  <button
                    type="button"
                    disabled={busyId === enquiry.id}
                    onClick={() => void move(enquiry, 'received')}
                    className="px-3 py-1.5 rounded-lg bg-interactive/20 text-ink hover:bg-interactive/30 font-bold text-[11px] disabled:opacity-50"
                  >
                    Take it on
                  </button>
                ) : null}
                {enquiry.status !== 'contacted' && enquiry.status !== 'closed' ? (
                  <button
                    type="button"
                    disabled={busyId === enquiry.id}
                    onClick={() => void move(enquiry, 'contacted')}
                    className="px-3 py-1.5 rounded-lg bg-sky-500/20 text-sky-700 hover:bg-sky-500/30 font-bold text-[11px] disabled:opacity-50"
                  >
                    Mark contacted
                  </button>
                ) : null}
                {enquiry.status !== 'replied' && enquiry.status !== 'closed' ? (
                  <button
                    type="button"
                    disabled={busyId === enquiry.id}
                    onClick={() => void move(enquiry, 'replied')}
                    className="px-3 py-1.5 rounded-lg bg-emerald-500/20 text-emerald-700 hover:bg-emerald-500/30 font-bold text-[11px] disabled:opacity-50"
                  >
                    Mark replied
                  </button>
                ) : null}
                {enquiry.status !== 'closed' ? (
                  <button
                    type="button"
                    disabled={busyId === enquiry.id}
                    onClick={() => void move(enquiry, 'closed')}
                    className="px-3 py-1.5 rounded-lg bg-line/70 text-ink hover:bg-line font-bold text-[11px] disabled:opacity-50"
                  >
                    Close
                  </button>
                ) : (
                  <button
                    type="button"
                    disabled={busyId === enquiry.id}
                    onClick={() => void move(enquiry, 'new')}
                    className="px-3 py-1.5 rounded-lg bg-page text-ink hover:bg-line font-bold text-[11px] disabled:opacity-50"
                  >
                    Reopen
                  </button>
                )}
                <a
                  href={`mailto:${enquiry.email}?subject=${encodeURIComponent('Re: your enquiry with Goodlucks Homes')}`}
                  className="px-3 py-1.5 rounded-lg bg-interactive/15 text-ink hover:bg-interactive/25 font-bold text-[11px]"
                >
                  Reply by email
                </a>
              </div>
            </div>
          ))}
        </div>
      )}

      {pages > 1 ? (
        <div className="flex items-center justify-between gap-2">
          <button
            type="button"
            onClick={() => setPage((value) => Math.max(1, value - 1))}
            disabled={current <= 1}
            className="px-3 py-2 rounded-xl bg-page text-xs font-bold text-ink disabled:opacity-40 flex items-center gap-1"
          >
            <ChevronLeft className="w-3.5 h-3.5" /> Previous
          </button>
          <span className="text-[11px] text-ink/70">
            Page {current} of {pages}
          </span>
          <button
            type="button"
            onClick={() => setPage((value) => Math.min(pages, value + 1))}
            disabled={current >= pages}
            className="px-3 py-2 rounded-xl bg-page text-xs font-bold text-ink disabled:opacity-40 flex items-center gap-1"
          >
            Next <ChevronRight className="w-3.5 h-3.5" />
          </button>
        </div>
      ) : null}
    </div>
  );
};

export default AdminEnquiries;
