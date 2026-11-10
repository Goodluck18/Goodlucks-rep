import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Property, PropertyStatus } from '../types';
import { useApp } from '../context/AppContext';
import { api, messageForError } from '../services/apiService';
import { Loader2, Search, SlidersHorizontal, X, ChevronLeft, ChevronRight } from 'lucide-react';

interface Props {
  /** Open the existing edit form for a listing (owned by the dashboard). */
  onEdit: (property: Property) => void;
}

/** The sort orders the API supports (php-backend/lib/repository.php). */
const SORTS: Array<{ value: string; label: string }> = [
  { value: 'newest', label: 'Newest first' },
  { value: 'oldest', label: 'Oldest first' },
  { value: 'price_asc', label: 'Price: low to high' },
  { value: 'price_desc', label: 'Price: high to low' },
  { value: 'popular', label: 'Most viewed' },
];

const STATUSES: Array<{ value: PropertyStatus | ''; label: string }> = [
  { value: '', label: 'Any status' },
  { value: 'active', label: 'Live' },
  { value: 'pending', label: 'Pending review' },
  { value: 'rejected', label: 'Rejected' },
  { value: 'deactivated', label: 'Archived' },
  { value: 'rented', label: 'Rented' },
];

interface Filters {
  q: string;
  status: string;
  location: string;
  minRent: string;
  maxRent: string;
  createdFrom: string;
  createdTo: string;
  sort: string;
}

const EMPTY_FILTERS: Filters = {
  q: '',
  status: '',
  location: '',
  minRent: '',
  maxRent: '',
  createdFrom: '',
  createdTo: '',
  sort: 'newest',
};

const PAGE_SIZE = 20;

/**
 * Manage Listings (Upgrade 2, A6).
 *
 * Why this is a server-backed list
 * --------------------------------
 * The console used to fetch one page of listings and filter it in the browser.
 * Two consequences, both wrong: a search only looked at the listings already
 * downloaded, and anything past the API's row cap was unreachable — an
 * administrator could not find a listing they knew existed.
 *
 * Every control below is sent to `GET /admin/properties`, which filters in SQL
 * over the real table and returns the true total. The page control then walks
 * the whole result set, so "showing 21–40 of 137" is a fact about the database,
 * not about what happened to be in memory.
 *
 * Search covers the title, location, city and description (the server's own
 * definition), so "East Legon" finds a listing by its area even if the words are
 * not in the title.
 */
export const AdminManageListings: React.FC<Props> = ({ onEdit }) => {
  const {
    updatePropertyStatus,
    verifyProperty,
    toggleFeatured,
    deleteProperty,
    refreshProperties,
    showSuccessToast,
    showErrorToast,
  } = useApp();

  const [filters, setFilters] = useState<Filters>(EMPTY_FILTERS);
  const [page, setPage] = useState(1);
  const [listings, setListings] = useState<Property[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [showFilters, setShowFilters] = useState(false);

  // Debounce the search box: one request per pause, not one per keystroke.
  const [query, setQuery] = useState('');
  const debounce = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (debounce.current) clearTimeout(debounce.current);
    debounce.current = setTimeout(() => {
      setFilters((current) => (current.q === query ? current : { ...current, q: query }));
      setPage(1);
    }, 300);
    return () => {
      if (debounce.current) clearTimeout(debounce.current);
    };
  }, [query]);

  const request = useMemo(
    () => ({
      q: filters.q,
      status: filters.status,
      location: filters.location,
      minRent: filters.minRent,
      maxRent: filters.maxRent,
      createdFrom: filters.createdFrom,
      createdTo: filters.createdTo,
      sort: filters.sort,
      page,
      perPage: PAGE_SIZE,
    }),
    [filters, page]
  );

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await api.adminProperties(request);
      setListings(result.properties ?? []);
      setTotal(result.total ?? 0);
    } catch (err) {
      setError(messageForError(err));
    } finally {
      setLoading(false);
    }
  }, [request]);

  useEffect(() => {
    void load();
  }, [load]);

  const update = (patch: Partial<Filters>) => {
    setFilters((current) => ({ ...current, ...patch }));
    setPage(1);
  };

  const run = async (id: string, action: () => Promise<void>, failure: string) => {
    setBusyId(id);
    try {
      await action();
      await load();
      // The public catalogue reads the same records, so keep it in step.
      await refreshProperties();
    } catch (err) {
      showErrorToast(failure, messageForError(err));
    } finally {
      setBusyId(null);
    }
  };

  const first = total === 0 ? 0 : (page - 1) * PAGE_SIZE + 1;
  const last = Math.min(page * PAGE_SIZE, total);
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const activeFilters = [
    filters.q,
    filters.status,
    filters.location,
    filters.minRent,
    filters.maxRent,
    filters.createdFrom,
    filters.createdTo,
  ].filter((value) => value !== '').length;

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
        <div>
          <h2 className="text-xl font-bold text-ink">All Property Listings</h2>
          <p className="text-xs text-ink/70">
            Edit details, publish or archive listings, and control what appears on the public website.
          </p>
        </div>
        <span className="px-3 py-1 rounded-full bg-interactive/15 text-ink text-xs font-bold border border-interactive/30">
          {total.toLocaleString()} {total === 1 ? 'record' : 'records'}
        </span>
      </div>

      {/* Search + filter controls */}
      <div className="bg-surface border border-line rounded-2xl p-3 space-y-3">
        <div className="flex flex-col sm:flex-row gap-2">
          <div className="relative flex-1">
            <Search className="w-4 h-4 absolute left-3 top-2.5 text-ink/60" />
            <input
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search title, area, city or description…"
              aria-label="Search listings"
              className="w-full bg-page border border-line rounded-xl pl-9 pr-3 py-2 text-xs text-ink"
            />
          </div>

          <select
            value={filters.sort}
            onChange={(event) => update({ sort: event.target.value })}
            aria-label="Sort listings"
            className="bg-page border border-line rounded-xl px-2 py-2 text-xs text-ink"
          >
            {SORTS.map((sort) => (
              <option key={sort.value} value={sort.value}>
                {sort.label}
              </option>
            ))}
          </select>

          <button
            type="button"
            onClick={() => setShowFilters((open) => !open)}
            aria-expanded={showFilters}
            className="px-3 py-2 rounded-xl bg-page text-xs font-bold text-ink flex items-center gap-1.5 shrink-0"
          >
            <SlidersHorizontal className="w-3.5 h-3.5" />
            Filters{activeFilters - (filters.q ? 1 : 0) > 0 ? ` (${activeFilters - (filters.q ? 1 : 0)})` : ''}
          </button>

          {activeFilters > 0 ? (
            <button
              type="button"
              onClick={() => {
                setQuery('');
                setFilters(EMPTY_FILTERS);
                setPage(1);
              }}
              className="px-3 py-2 rounded-xl bg-page text-xs font-bold text-ink flex items-center gap-1.5 shrink-0"
            >
              <X className="w-3.5 h-3.5" /> Clear
            </button>
          ) : null}
        </div>

        {/* Status chips: the common case, one tap */}
        <div className="flex flex-wrap gap-1.5">
          {STATUSES.map((status) => {
            const selected = filters.status === status.value;
            return (
              <button
                key={status.value || 'any'}
                type="button"
                onClick={() => update({ status: status.value })}
                aria-pressed={selected}
                className={`px-2.5 py-1 rounded-lg text-[11px] font-bold border ${
                  selected ? 'bg-interactive text-ink border-interactive' : 'bg-page text-ink border-line'
                }`}
              >
                {status.label}
              </button>
            );
          })}
        </div>

        {showFilters ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2 pt-1">
            <label className="space-y-1">
              <span className="text-[10px] uppercase tracking-wider text-ink/70">Area or location</span>
              <input
                value={filters.location}
                onChange={(event) => update({ location: event.target.value })}
                placeholder="e.g. East Legon"
                className="w-full bg-page border border-line rounded-xl px-2 py-1.5 text-xs text-ink"
              />
            </label>
            <label className="space-y-1">
              <span className="text-[10px] uppercase tracking-wider text-ink/70">Rent from (GH₵)</span>
              <input
                type="number"
                min="0"
                inputMode="numeric"
                value={filters.minRent}
                onChange={(event) => update({ minRent: event.target.value })}
                className="w-full bg-page border border-line rounded-xl px-2 py-1.5 text-xs text-ink"
              />
            </label>
            <label className="space-y-1">
              <span className="text-[10px] uppercase tracking-wider text-ink/70">Rent to (GH₵)</span>
              <input
                type="number"
                min="0"
                inputMode="numeric"
                value={filters.maxRent}
                onChange={(event) => update({ maxRent: event.target.value })}
                className="w-full bg-page border border-line rounded-xl px-2 py-1.5 text-xs text-ink"
              />
            </label>
            <label className="space-y-1">
              <span className="text-[10px] uppercase tracking-wider text-ink/70">Listed from</span>
              <input
                type="date"
                value={filters.createdFrom}
                onChange={(event) => update({ createdFrom: event.target.value })}
                className="w-full bg-page border border-line rounded-xl px-2 py-1.5 text-xs text-ink"
              />
            </label>
            <label className="space-y-1">
              <span className="text-[10px] uppercase tracking-wider text-ink/70">Listed to</span>
              <input
                type="date"
                value={filters.createdTo}
                onChange={(event) => update({ createdTo: event.target.value })}
                className="w-full bg-page border border-line rounded-xl px-2 py-1.5 text-xs text-ink"
              />
            </label>
          </div>
        ) : null}

        <p className="text-[10px] text-ink/70">
          {loading
            ? 'Searching the listings…'
            : error
              ? error
              : total === 0
                ? 'No listing matches these filters.'
                : `Showing ${first}–${last} of ${total.toLocaleString()}`}
        </p>
      </div>

      {error ? (
        <div role="alert" className="p-3 rounded-xl bg-accent/15 border border-accent/30 text-ink text-xs flex items-center gap-2">
          <span className="flex-1">{error}</span>
          <button type="button" onClick={() => void load()} className="font-bold">
            Try again
          </button>
        </div>
      ) : null}

      <div className="bg-surface rounded-2xl border border-line divide-y divide-line">
        {loading ? (
          <div className="p-8 flex items-center justify-center gap-2 text-xs text-ink/70">
            <Loader2 className="w-4 h-4 animate-spin" /> Loading listings…
          </div>
        ) : null}

        {!loading && listings.length === 0 && !error ? (
          <div className="p-8 text-center text-xs text-ink/70">No property records match these filters.</div>
        ) : null}

        {listings.map((property) => (
          <div key={property.id} className="p-4 flex flex-col lg:flex-row lg:items-center justify-between gap-3">
            <div className="flex items-center gap-3 min-w-0">
              <img
                src={property.images[0] || 'https://images.unsplash.com/photo-1560518883-ce09059eeffa?auto=format&fit=crop&w=200&q=60'}
                alt=""
                loading="lazy"
                decoding="async"
                className="w-14 h-14 rounded-xl object-cover border border-line shrink-0"
              />
              <div className="min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span
                    className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
                      property.status === 'active'
                        ? 'bg-emerald-500/20 text-emerald-700'
                        : property.status === 'pending'
                          ? 'bg-amber-500/20 text-amber-700'
                          : property.status === 'rejected'
                            ? 'bg-accent/20 text-accent'
                            : 'bg-line/40 text-ink/70'
                    }`}
                  >
                    {property.status}
                  </span>
                  {property.featured && (
                    <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-interactive/20 text-ink">FEATURED</span>
                  )}
                  <span
                    className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                      property.isLandlordVerified ? 'bg-emerald-500/20 text-emerald-700' : 'bg-line/40 text-ink/70'
                    }`}
                  >
                    {property.isLandlordVerified ? 'LANDLORD VERIFIED' : 'NOT VERIFIED'}
                  </span>
                  <span className="text-[10px] text-ink/70 font-mono">{property.id}</span>
                </div>
                <h3 className="font-bold text-sm text-ink truncate">{property.title}</h3>
                <p className="text-[11px] text-ink/70 truncate">
                  {property.location} • GH₵ {property.rentGhs.toLocaleString()}/mo • {property.bedrooms} Bed /{' '}
                  {property.bathrooms} Bath • {property.viewsCount} views
                </p>
                <p className="text-[11px] text-ink/70">
                  Viewing fee:{' '}
                  {property.viewingTerms?.isApproved && property.viewingTerms.feeGhs
                    ? `GH₵ ${property.viewingTerms.feeGhs.toLocaleString()} (approved)`
                    : property.viewingTerms?.pendingChange
                      ? `GH₵ ${property.viewingTerms.pendingChange.proposedFeeGhs?.toLocaleString()} proposed — awaiting review`
                      : 'none approved'}
                </p>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-1.5 shrink-0">
              <button
                onClick={() => onEdit(property)}
                className="px-3 py-1.5 rounded-lg bg-page hover:bg-line text-ink font-bold text-[11px]"
              >
                Edit
              </button>

              {property.status !== 'active' ? (
                <button
                  disabled={busyId === property.id}
                  onClick={() =>
                    void run(
                      property.id,
                      async () => {
                        await updatePropertyStatus(property.id, 'active');
                        showSuccessToast('Listing published', `${property.title} is now live.`);
                      },
                      'Could not publish the listing.'
                    )
                  }
                  className="px-3 py-1.5 rounded-lg bg-emerald-500/20 text-emerald-700 hover:bg-emerald-500/30 font-bold text-[11px] disabled:opacity-50"
                >
                  Publish
                </button>
              ) : (
                <button
                  disabled={busyId === property.id}
                  onClick={() =>
                    void run(
                      property.id,
                      () => updatePropertyStatus(property.id, 'deactivated'),
                      'Could not archive the listing.'
                    )
                  }
                  className="px-3 py-1.5 rounded-lg bg-line/60 text-ink hover:bg-line font-bold text-[11px] disabled:opacity-50"
                >
                  Archive
                </button>
              )}

              <button
                disabled={busyId === property.id}
                onClick={() =>
                  void run(
                    property.id,
                    () => verifyProperty(property.id, !property.isLandlordVerified),
                    'Could not update the verification state.'
                  )
                }
                className={`px-3 py-1.5 rounded-lg font-bold text-[11px] disabled:opacity-50 ${
                  property.isLandlordVerified
                    ? 'bg-emerald-500/20 text-emerald-700 hover:bg-emerald-500/30'
                    : 'bg-page text-ink hover:bg-line'
                }`}
                title="Only mark this after Goodlucks staff have inspected the property"
              >
                {property.isLandlordVerified ? 'Unverify' : 'Verify'}
              </button>

              <button
                disabled={busyId === property.id}
                onClick={() =>
                  void run(property.id, () => toggleFeatured(property.id, !property.featured), 'Could not update the featured flag.')
                }
                className="px-3 py-1.5 rounded-lg bg-interactive/15 text-ink hover:bg-interactive/25 font-bold text-[11px] disabled:opacity-50"
              >
                {property.featured ? 'Unfeature' : 'Feature'}
              </button>

              <button
                disabled={busyId === property.id}
                onClick={() => {
                  if (window.confirm(`Remove "${property.title}" from the public website?`)) {
                    void run(property.id, () => deleteProperty(property.id), 'Could not delete the listing.');
                  }
                }}
                className="px-3 py-1.5 rounded-lg bg-accent/15 text-accent hover:bg-accent/25 font-bold text-[11px] disabled:opacity-50"
              >
                Delete
              </button>
            </div>
          </div>
        ))}
      </div>

      {pages > 1 ? (
        <div className="flex items-center justify-between gap-2">
          <button
            type="button"
            onClick={() => setPage((current) => Math.max(1, current - 1))}
            disabled={page <= 1 || loading}
            className="px-3 py-2 rounded-xl bg-page text-xs font-bold text-ink disabled:opacity-40 flex items-center gap-1"
          >
            <ChevronLeft className="w-3.5 h-3.5" /> Previous
          </button>
          <span className="text-[11px] text-ink/70">
            Page {page} of {pages}
          </span>
          <button
            type="button"
            onClick={() => setPage((current) => Math.min(pages, current + 1))}
            disabled={page >= pages || loading}
            className="px-3 py-2 rounded-xl bg-page text-xs font-bold text-ink disabled:opacity-40 flex items-center gap-1"
          >
            Next <ChevronRight className="w-3.5 h-3.5" />
          </button>
        </div>
      ) : null}
    </div>
  );
};

export default AdminManageListings;
