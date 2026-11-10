import React, { useCallback, useEffect, useState } from 'react';
import { ChevronLeft, ChevronRight, Loader2, Search, Users, X } from 'lucide-react';
import { api, messageForError } from '../services/apiService';
import { AdminUserRecord } from '../types';
import { AdminUserProfile } from './AdminUserProfile';

const ROLES: Array<{ value: string; label: string }> = [
  { value: '', label: 'Everyone' },
  { value: 'tenant', label: 'Tenants' },
  { value: 'landlord', label: 'Landlords' },
  { value: 'agent', label: 'Agents' },
  { value: 'admin', label: 'Administrators' },
];

const STATUSES: Array<{ value: string; label: string }> = [
  { value: '', label: 'Any verification' },
  { value: 'verified', label: 'Verified' },
  { value: 'unverified', label: 'Not verified' },
];

const PAGE_SIZE = 25;

const formatDate = (iso: string): string => {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
};

/**
 * User Management (Upgrade 2, A11).
 *
 * One row per account, found by name, email address or phone number, filtered by
 * role and verification, and paged by the server. Opening a row shows that
 * person's profile and stored history (A13).
 *
 * The search and the filters run in SQL over every account: this screen never
 * downloads a page and filters it in the browser, which is the mistake the older
 * console panels made.
 *
 * What is not on this screen: password hashes (never sent), identity documents
 * (a count only), and any provider contact detail that the public site must not
 * show (that rule belongs to the public responses, not to staff).
 */
export const AdminUserManagement: React.FC = () => {
  const [query, setQuery] = useState('');
  const [role, setRole] = useState('');
  const [status, setStatus] = useState('');
  const [users, setUsers] = useState<AdminUserRecord[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [openUserId, setOpenUserId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await api.listAdminUsers({ q: query.trim(), role, status, page, perPage: PAGE_SIZE });
      setUsers(result.users ?? []);
      setTotal(result.total ?? 0);
    } catch (err) {
      setError(messageForError(err));
      setUsers([]);
      setTotal(0);
    } finally {
      setLoading(false);
    }
  }, [query, role, status, page]);

  // One request per pause in typing.
  useEffect(() => {
    const timer = setTimeout(() => {
      void load();
    }, 250);
    return () => clearTimeout(timer);
  }, [load]);

  useEffect(() => {
    setPage(1);
  }, [query, role, status]);

  if (openUserId) {
    return <AdminUserProfile userId={openUserId} onBack={() => setOpenUserId(null)} />;
  }

  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div className="space-y-4">
      <div className="gl-card p-4 space-y-3">
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative flex-1 min-w-[240px]">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-ink-muted" />
            <input
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search by name, email address or phone number"
              aria-label="Search accounts"
              className="gl-input pl-9 w-full"
            />
            {query !== '' && (
              <button
                type="button"
                onClick={() => setQuery('')}
                aria-label="Clear the search"
                className="absolute right-2 top-1/2 -translate-y-1/2 text-ink-muted"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>
          <span className="text-xs text-ink-muted inline-flex items-center gap-1">
            <Users className="w-4 h-4" /> {total} account{total === 1 ? '' : 's'}
          </span>
        </div>

        <div className="flex flex-wrap gap-2">
          {ROLES.map((option) => (
            <button
              key={option.value || 'all'}
              type="button"
              onClick={() => setRole(option.value)}
              className={`gl-chip ${role === option.value ? 'gl-chip-active' : ''}`}
            >
              {option.label}
            </button>
          ))}
        </div>

        <div className="flex flex-wrap gap-2">
          {STATUSES.map((option) => (
            <button
              key={option.value || 'any'}
              type="button"
              onClick={() => setStatus(option.value)}
              className={`gl-chip ${status === option.value ? 'gl-chip-active' : ''}`}
            >
              {option.label}
            </button>
          ))}
        </div>
      </div>

      {error && (
        <div role="alert" className="gl-card p-4 text-sm text-ink flex items-start justify-between gap-3">
          <span>{error}</span>
          <button type="button" onClick={() => void load()} className="gl-button-secondary text-xs">
            Try again
          </button>
        </div>
      )}

      <div className="gl-card overflow-hidden">
        {loading ? (
          <div className="p-8 flex items-center gap-3 text-sm text-ink-muted">
            <Loader2 className="w-4 h-4 animate-spin" /> Loading accounts…
          </div>
        ) : users.length === 0 ? (
          <div className="p-8 text-sm text-ink-muted">
            No account matches this search and filter. Nothing is hidden — there simply are no matching records.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-ink-muted border-b border-line">
                  <th scope="col" className="p-3">Name</th>
                  <th scope="col" className="p-3">Contact</th>
                  <th scope="col" className="p-3">Role</th>
                  <th scope="col" className="p-3">Verification</th>
                  <th scope="col" className="p-3">Records</th>
                  <th scope="col" className="p-3">Joined</th>
                </tr>
              </thead>
              <tbody>
                {users.map((user) => (
                  <tr
                    key={user.id}
                    className="border-b border-line/60 last:border-0 hover:bg-surface-alt/50 cursor-pointer"
                    onClick={() => setOpenUserId(user.id)}
                  >
                    <td className="p-3">
                      <button
                        type="button"
                        onClick={() => setOpenUserId(user.id)}
                        className="font-bold text-ink text-left"
                      >
                        {user.name}
                      </button>
                    </td>
                    <td className="p-3 text-xs text-ink-muted">
                      <div>{user.email}</div>
                      <div>{user.phone || '—'}</div>
                    </td>
                    <td className="p-3 text-xs capitalize">{user.role}</td>
                    <td className="p-3 text-xs">
                      {user.isVerified ? 'Verified' : 'Not verified'}
                      {user.verification.documentsOnFile > 0 && (
                        <span className="text-ink-muted"> · {user.verification.documentsOnFile} document(s)</span>
                      )}
                    </td>
                    <td className="p-3 text-xs text-ink-muted">
                      {user.counts.properties} listing(s) · {user.counts.requests} request(s) ·{' '}
                      {user.counts.viewings} viewing(s)
                    </td>
                    <td className="p-3 text-xs text-ink-muted">{formatDate(user.createdAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="flex items-center justify-between gap-3 text-xs text-ink-muted">
        <span>
          Page {page} of {pages}
        </span>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => setPage((current) => Math.max(1, current - 1))}
            disabled={page <= 1 || loading}
            className="gl-button-secondary text-xs inline-flex items-center gap-1 disabled:opacity-50"
          >
            <ChevronLeft className="w-4 h-4" /> Previous
          </button>
          <button
            type="button"
            onClick={() => setPage((current) => Math.min(pages, current + 1))}
            disabled={page >= pages || loading}
            className="gl-button-secondary text-xs inline-flex items-center gap-1 disabled:opacity-50"
          >
            Next <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
};
