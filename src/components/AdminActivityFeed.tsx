import React, { useCallback, useEffect, useState } from 'react';
import { Activity, ChevronRight, Loader2 } from 'lucide-react';
import { api, messageForError } from '../services/apiService';
import { AdminActivityEntry } from '../types';

interface Props {
  /** Open the record in the console section that owns it. */
  onOpen: (entry: AdminActivityEntry) => void;
}

const formatWhen = (iso: string): string => {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleString('en-GB', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
};

/**
 * Recent activity (Upgrade 2, A14).
 *
 * Every entry is a stored record — a registration, a listing, an enquiry, a
 * rental request, a viewing or an audited staff action — with the time it
 * happened. There are no invented metrics here and nothing is sampled: the list
 * is the newest rows of the database, ordered by their own timestamps.
 */
export const AdminActivityFeed: React.FC<Props> = ({ onOpen }) => {
  const [entries, setEntries] = useState<AdminActivityEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await api.getAdminActivity(20);
      setEntries(result.activity ?? []);
    } catch (err) {
      setError(messageForError(err));
      setEntries([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div className="bg-surface rounded-2xl border border-line p-5 space-y-3">
      <div className="flex items-center justify-between gap-2">
        <h3 className="font-bold text-base text-ink flex items-center gap-2">
          <Activity className="w-4 h-4" /> Recent activity
        </h3>
        <button type="button" onClick={() => void load()} className="gl-button-secondary text-xs">
          Refresh
        </button>
      </div>

      {loading ? (
        <p className="text-xs text-ink-muted inline-flex items-center gap-2">
          <Loader2 className="w-4 h-4 animate-spin" /> Loading the newest records…
        </p>
      ) : error ? (
        <p role="alert" className="text-xs text-ink">{error}</p>
      ) : entries.length === 0 ? (
        <p className="text-xs text-ink-muted">
          Nothing has happened yet: no registration, listing, enquiry, request, viewing or staff action is recorded.
        </p>
      ) : (
        <ul className="divide-y divide-line/60">
          {entries.map((entry, index) => (
            <li key={`${entry.kind}-${entry.id}-${entry.at}-${index}`}>
              <button
                type="button"
                onClick={() => onOpen(entry)}
                className="w-full text-left py-2 flex items-center gap-3 hover:bg-surface-alt/60 rounded-lg px-2"
              >
                <span className="flex-1">
                  <span className="block text-sm text-ink">{entry.title}</span>
                  <span className="block text-xs text-ink-muted">
                    {entry.detail || entry.actor || entry.kind}
                  </span>
                </span>
                <span className="text-xs text-ink-muted whitespace-nowrap">{formatWhen(entry.at)}</span>
                <ChevronRight className="w-4 h-4 text-ink-muted" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};
