import React, { useCallback, useEffect, useState } from 'react';
import { ArrowLeft, Building2, FileText, Heart, Loader2, MapPin, ShieldAlert } from 'lucide-react';
import { api, messageForError } from '../services/apiService';
import { AdminUserActivityEntry, AdminUserRecord } from '../types';

interface Props {
  userId: string;
  /** Return to the directory. */
  onBack: () => void;
}

const KIND_META: Record<AdminUserActivityEntry['kind'], { label: string; icon: React.ReactNode }> = {
  property: { label: 'Listing', icon: <Building2 className="w-4 h-4" /> },
  saved: { label: 'Favourite', icon: <Heart className="w-4 h-4" /> },
  request: { label: 'Rental request', icon: <MapPin className="w-4 h-4" /> },
  viewing: { label: 'Viewing', icon: <MapPin className="w-4 h-4" /> },
  enquiry: { label: 'Enquiry', icon: <FileText className="w-4 h-4" /> },
  action: { label: 'Staff action', icon: <FileText className="w-4 h-4" /> },
};

/**
 * Formal suspension / reinstatement of an Agent or Landlord account.
 *
 * The two actions are deliberately separate, each with its own mandatory reason.
 * Suspension is not verification: an approved identity stays approved and the
 * account still cannot list. Reinstatement never republishes anything — each
 * previously live listing waits for a fresh availability confirmation.
 */
const SuspensionPanel: React.FC<{
  userId: string;
  user: AdminUserRecord;
  onUpdated: (user: AdminUserRecord) => void;
}> = ({ userId, user, onUpdated }) => {
  const suspended = user.accountStatus === 'suspended';
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

  const submit = async () => {
    setBusy(true);
    setError(null);
    setDone(null);
    try {
      const result = suspended
        ? await api.reinstateProvider(userId, reason.trim())
        : await api.suspendProvider(userId, reason.trim());
      onUpdated(result.user as unknown as AdminUserRecord);
      setReason('');
      setDone(result.message);
    } catch (err) {
      setError(messageForError(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className={`gl-card p-5 space-y-3 ${suspended ? 'border-accent/40' : ''}`}>
      <div className="flex items-center gap-2">
        <ShieldAlert className="w-4 h-4 text-ink" />
        <h3 className="text-sm font-bold text-ink">
          {suspended ? 'Account suspended' : 'Suspend this account'}
        </h3>
      </div>
      <p className="text-xs text-ink-muted">
        {suspended
          ? 'The account can still sign in and see its records, but it cannot create, publish or reactivate listings, and its live listings are not public. Reinstating it restores access; it does not republish anything, because each listing needs a fresh availability confirmation.'
          : 'Suspension is separate from identity verification: a verified account that is suspended still cannot list. Live listings are removed from public view immediately and kept, with their history. The provider is told the reason.'}
      </p>
      {user.suspension?.reason && (
        <p className="text-xs text-ink">
          Recorded reason: {user.suspension.reason}
          {user.suspension.suspendedBy ? ` — ${user.suspension.suspendedBy}` : ''}
        </p>
      )}
      {user.suspension?.reinstatedAt && !suspended && (
        <p className="text-xs text-ink-muted">
          Last reinstated {formatWhen(user.suspension.reinstatedAt)}
          {user.suspension.reinstatedBy ? ` by ${user.suspension.reinstatedBy}` : ''}
        </p>
      )}
      <label className="block text-[11px] font-semibold text-ink-muted">
        {suspended ? 'Why is the suspension being lifted?' : 'Why is this account being suspended?'}
        <textarea
          value={reason}
          onChange={(event) => setReason(event.target.value)}
          rows={2}
          className="mt-1 w-full bg-page border border-line rounded-xl px-3 py-2 text-xs text-ink"
          placeholder="At least 10 characters. The provider is shown this reason."
        />
      </label>
      {error && <p role="alert" className="text-xs text-accent">{error}</p>}
      {done && <p role="status" className="text-xs text-ink">{done}</p>}
      <button
        type="button"
        onClick={() => void submit()}
        disabled={busy || reason.trim().length < 10}
        className="gl-button-secondary text-xs inline-flex items-center gap-2 disabled:opacity-50"
      >
        {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <ShieldAlert className="w-3.5 h-3.5" />}
        {suspended ? 'Reinstate account' : 'Suspend account'}
      </button>
    </div>
  );
};

const formatWhen = (iso: string): string => {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
};

/**
 * One person's profile and history (Upgrade 2, A13).
 *
 * What it shows, and what it deliberately does not
 * -----------------------------------------------
 * The counts and the timeline come from the stored records — listings,
 * favourites, rental requests, viewings, enquiries and the audit trail. Nothing
 * is estimated.
 *
 * Identity documents are reported as a count ("on file"), never as a link: the
 * private store is reachable only through the audited document endpoint, and
 * only by an administrator who holds that capability. This screen never receives
 * a file name or a path from the server, so it could not leak one if it tried.
 */
export const AdminUserProfile: React.FC<Props> = ({ userId, onBack }) => {
  const [user, setUser] = useState<AdminUserRecord | null>(null);
  const [activity, setActivity] = useState<AdminUserActivityEntry[]>([]);
  const [canViewActivity, setCanViewActivity] = useState(false);
  // E2: classification correction, available only when the server says so.
  const [canCorrect, setCanCorrect] = useState(false);
  const [newRole, setNewRole] = useState<'tenant' | 'landlord' | 'agent'>('tenant');
  const [reason, setReason] = useState('');
  const [correcting, setCorrecting] = useState(false);
  const [correctError, setCorrectError] = useState<string | null>(null);
  const [corrected, setCorrected] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await api.getAdminUser(userId);
      setUser(result.user);
      setActivity(result.activity ?? []);
      setCanViewActivity(Boolean(result.canViewActivity));
      setCanCorrect(Boolean(result.canCorrectClassification));
    } catch (err) {
      setError(messageForError(err));
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    void load();
  }, [load]);

  if (loading) {
    return (
      <div className="gl-card p-8 flex items-center gap-3 text-sm text-ink-muted">
        <Loader2 className="w-4 h-4 animate-spin" /> Loading the profile…
      </div>
    );
  }

  if (error || !user) {
    return (
      <div className="gl-card p-6 space-y-3">
        <p role="alert" className="text-sm text-ink">{error ?? 'That account could not be loaded.'}</p>
        <div className="flex gap-2">
          <button type="button" onClick={() => void load()} className="gl-button-secondary text-xs">
            Try again
          </button>
          <button type="button" onClick={onBack} className="gl-button-secondary text-xs">
            Back to the directory
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <button type="button" onClick={onBack} className="gl-button-secondary text-xs inline-flex items-center gap-2">
        <ArrowLeft className="w-4 h-4" /> Back to the directory
      </button>

      <div className="gl-card p-5 space-y-3">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h3 className="text-lg font-bold text-ink">{user.name}</h3>
            <p className="text-xs text-ink-muted">{user.email}</p>
            <p className="text-xs text-ink-muted">{user.phone || 'No phone number on file'}</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <span className="gl-chip capitalize">{user.role}</span>
            {user.providerCategory === 'pending' && (
              <span className="gl-chip">Has not chosen Agent or Landlord yet</span>
            )}
            <span className={`gl-chip ${user.isVerified ? 'text-success' : 'text-ink-muted'}`}>
              {user.isVerified ? 'Verified account' : 'Not verified'}
            </span>
          </div>
        </div>

        <dl className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
          <div className="rounded-xl bg-surface-alt p-3">
            <dt className="text-ink-muted">Listings</dt>
            <dd className="text-lg font-bold text-ink">{user.counts.properties}</dd>
          </div>
          <div className="rounded-xl bg-surface-alt p-3">
            <dt className="text-ink-muted">Favourites</dt>
            <dd className="text-lg font-bold text-ink">{user.counts.saved}</dd>
          </div>
          <div className="rounded-xl bg-surface-alt p-3">
            <dt className="text-ink-muted">Rental requests</dt>
            <dd className="text-lg font-bold text-ink">{user.counts.requests}</dd>
          </div>
          <div className="rounded-xl bg-surface-alt p-3">
            <dt className="text-ink-muted">Viewings</dt>
            <dd className="text-lg font-bold text-ink">{user.counts.viewings}</dd>
          </div>
        </dl>

        <div className="grid sm:grid-cols-2 gap-3 text-xs">
          <div className="rounded-xl border border-line p-3 space-y-1">
            <p className="font-bold text-ink">Verification</p>
            <p className="text-ink-muted">
              Identity: {user.verification.identityStatus
                ? user.verification.identityStatus.replace(/_/g, ' ')
                : 'not submitted'}
            </p>
            <p className="text-ink-muted">
              Documents on file: {user.verification.documentsOnFile}
              {user.verification.documentsOnFile > 0
                ? ' — open them from the Verification screen, which is audited.'
                : ''}
            </p>
          </div>
          <div className="rounded-xl border border-line p-3 space-y-1">
            <p className="font-bold text-ink">Account</p>
            <p className="text-ink-muted">Joined {formatWhen(user.createdAt)}</p>
            <p className="text-ink-muted">
              Last staff action: {user.lastActiveAt ? formatWhen(user.lastActiveAt) : 'none recorded'}
            </p>
            {user.accountStatus === 'suspended' && (
              <p className="text-ink font-bold">
                Account suspended{user.suspension?.reason ? `: ${user.suspension.reason}` : ''}
                {user.suspension?.suspendedAt ? ` (since ${formatWhen(user.suspension.suspendedAt)})` : ''}
              </p>
            )}
            {user.agentProfile && (
              <p className="text-ink-muted">
                Agent status: {user.agentProfile.accountStatus.replace(/_/g, ' ')}
                {user.agentProfile.canSubmitListings ? ' · may submit listings' : ' · cannot submit listings yet'}
              </p>
            )}
            {user.landlordState && (
              <p className="text-ink-muted">
                Listings: {user.landlordState.listings} total · {user.landlordState.activeListings} live ·{' '}
                {user.landlordState.pendingListings} awaiting approval
              </p>
            )}
          </div>
        </div>
      </div>

      {canCorrect && (
        <div className="gl-card p-5 space-y-3">
          <div className="flex items-center gap-2">
            <ShieldAlert className="w-4 h-4 text-ink" />
            <h3 className="text-sm font-bold text-ink">Correct the account type</h3>
          </div>
          <p className="text-xs text-ink-muted">
            An account type is chosen at registration and is final once verified. Use this only to
            fix a genuine mistake — the change is recorded with your name and the reason you give,
            and the account holder is told.
          </p>
          <div className="grid sm:grid-cols-3 gap-2">
            <label className="text-[11px] font-semibold text-ink-muted">
              Correct type to
              <select
                value={newRole}
                onChange={(event) => setNewRole(event.target.value as 'tenant' | 'landlord' | 'agent')}
                className="mt-1 w-full bg-page border border-line rounded-xl px-3 py-2 text-xs text-ink"
              >
                {/* Agent first, as everywhere the two are named together. */}
                <option value="agent">Agent</option>
                <option value="landlord">Landlord</option>
                <option value="tenant">Tenant</option>
              </select>
            </label>
            <label className="sm:col-span-2 text-[11px] font-semibold text-ink-muted">
              Why is this correction needed?
              <input
                value={reason}
                onChange={(event) => setReason(event.target.value)}
                placeholder="e.g. registered as a landlord but is the letting agent for these flats"
                className="mt-1 w-full bg-page border border-line rounded-xl px-3 py-2 text-xs text-ink"
              />
            </label>
          </div>
          {correctError && <p role="alert" className="text-xs text-accent">{correctError}</p>}
          {corrected && <p role="status" className="text-xs text-ink">{corrected}</p>}
          <button
            type="button"
            disabled={correcting || reason.trim().length < 10 || newRole === user.role}
            onClick={async () => {
              setCorrecting(true);
              setCorrectError(null);
              setCorrected(null);
              try {
                const result = await api.correctUserRole(userId, newRole, reason.trim());
                setUser(result.user);
                setReason('');
                setCorrected(
                  `Classification corrected from ${result.corrected.from} to ${result.corrected.to}. Recorded in the audit trail.`
                );
              } catch (err) {
                setCorrectError(messageForError(err));
              } finally {
                setCorrecting(false);
              }
            }}
            className="gl-button-secondary text-xs inline-flex items-center gap-2 disabled:opacity-50"
          >
            {correcting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <ShieldAlert className="w-3.5 h-3.5" />}
            Record correction
          </button>
        </div>
      )}

      {(user.role === 'agent' || user.role === 'landlord') && (
        <SuspensionPanel userId={userId} user={user} onUpdated={setUser} />
      )}

      <div className="gl-card p-5 space-y-3">
        <div className="flex items-center justify-between gap-3">
          <h3 className="text-sm font-bold text-ink">History</h3>
          <span className="text-xs text-ink-muted">{activity.length} recorded events</span>
        </div>

        {!canViewActivity && (
          <p className="text-xs text-ink-muted">
            Your account can open profiles but not read the activity history.
          </p>
        )}

        {canViewActivity && activity.length === 0 && (
          <p className="text-xs text-ink-muted">
            Nothing recorded yet for this account: no listings, favourites, requests, viewings or staff actions.
          </p>
        )}

        <ol className="space-y-2">
          {activity.map((entry, index) => (
            <li
              key={`${entry.kind}-${entry.id}-${entry.at}-${index}`}
              className="flex items-start gap-3 rounded-xl border border-line p-3"
            >
              <span className="mt-0.5 text-ink-muted">{KIND_META[entry.kind]?.icon}</span>
              <div className="flex-1">
                <p className="text-sm text-ink">{entry.title}</p>
                <p className="text-xs text-ink-muted">
                  {KIND_META[entry.kind]?.label ?? entry.kind} · {entry.status.replace(/_/g, ' ')}
                </p>
              </div>
              <span className="text-xs text-ink-muted whitespace-nowrap">{formatWhen(entry.at)}</span>
            </li>
          ))}
        </ol>
      </div>
    </div>
  );
};
