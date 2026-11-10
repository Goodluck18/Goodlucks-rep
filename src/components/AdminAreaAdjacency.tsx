import React, { useCallback, useEffect, useState } from 'react';
import { api, messageForError } from '../services/apiService';
import type { AreaAdjacency } from '../types';
import { useApp } from '../context/AppContext';
import { AlertTriangle, Info, Loader2, MapPin, Plus, RefreshCw, Trash2 } from 'lucide-react';

/**
 * Area proximity (Upgrade 2, B2).
 *
 * The match score's "near a preferred area" component cannot be invented: the
 * platform has no coordinates. This panel is where staff record the judgement
 * instead — "East Legon is next to Cantonments" — so a score can explain itself.
 * Areas with no recorded relationship simply earn no proximity points.
 */

const AdminAreaAdjacency: React.FC = () => {
  const { showSuccessToast, showErrorToast } = useApp();
  const [adjacencies, setAdjacencies] = useState<AreaAdjacency[]>([]);
  const [areas, setAreas] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [areaA, setAreaA] = useState('');
  const [areaB, setAreaB] = useState('');
  const [band, setBand] = useState(2);
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setIsLoading(true);
    try {
      const result = await api.areaAdjacency();
      setAdjacencies(result.adjacencies);
      setAreas(result.areas);
      setError(null);
    } catch (err) {
      setError(messageForError(err));
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const add = async () => {
    if (!areaA.trim() || !areaB.trim()) {
      showErrorToast('Name both areas', 'Choose two areas to record a relationship between.');
      return;
    }
    setSaving(true);
    try {
      await api.saveAreaAdjacency({ areaA: areaA.trim(), areaB: areaB.trim(), band, note: note.trim() });
      showSuccessToast('Proximity saved', `${areaA} and ${areaB} will now score proximity points.`);
      setAreaA('');
      setAreaB('');
      setNote('');
      setBand(2);
      await load();
    } catch (err) {
      showErrorToast('Could not save the proximity', messageForError(err));
    } finally {
      setSaving(false);
    }
  };

  const remove = async (row: AreaAdjacency) => {
    try {
      await api.deleteAreaAdjacency(row.id);
      showSuccessToast('Proximity removed', `${row.areaA} and ${row.areaB} no longer score as neighbours.`);
      await load();
    } catch (err) {
      showErrorToast('Could not remove the proximity', messageForError(err));
    }
  };

  if (isLoading && adjacencies.length === 0) {
    return (
      <div className="bg-surface p-6 rounded-2xl border border-line flex items-center gap-3 text-xs text-ink/70">
        <Loader2 className="w-4 h-4 animate-spin" /> Loading area proximity…
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-surface p-6 rounded-2xl border border-accent/30 text-xs text-ink flex items-center gap-2">
        <AlertTriangle className="w-4 h-4" /> {error}
      </div>
    );
  }

  return (
    <div className="bg-surface border border-line rounded-2xl p-4 space-y-3">
      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-2">
        <div>
          <h3 className="text-xs font-bold text-ink flex items-center gap-2">
            <MapPin className="w-4 h-4 text-ink" /> Area proximity used by match scores
          </h3>
          <p className="text-[11px] text-ink/70 max-w-2xl mt-1">
            Tell the matching engine which areas are neighbours. This is a staff judgement, not a measured distance:
            a listing in an area with no recorded relationship earns no proximity points, and the tenant sees that in
            the score breakdown.
          </p>
        </div>
        <button
          onClick={() => void load()}
          disabled={isLoading}
          className="px-3 py-1.5 rounded-lg bg-page hover:bg-line text-ink text-[11px] font-bold flex items-center gap-1.5 shrink-0 disabled:opacity-50"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} /> Refresh
        </button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-4 gap-2">
        <input
          list="adjacency-areas-a"
          value={areaA}
          onChange={(event) => setAreaA(event.target.value)}
          placeholder="Area A (e.g. East Legon)"
          aria-label="First area"
          className="bg-page border border-line rounded-xl px-3 py-2 text-[11px] text-ink"
        />
        <datalist id="adjacency-areas-a">
          {areas.map((area) => (
            <option key={`a-${area}`} value={area} />
          ))}
        </datalist>
        <input
          list="adjacency-areas-b"
          value={areaB}
          onChange={(event) => setAreaB(event.target.value)}
          placeholder="Area B (e.g. Cantonments)"
          aria-label="Second area"
          className="bg-page border border-line rounded-xl px-3 py-2 text-[11px] text-ink"
        />
        <datalist id="adjacency-areas-b">
          {areas.map((area) => (
            <option key={`b-${area}`} value={area} />
          ))}
        </datalist>
        <select
          value={band}
          onChange={(event) => setBand(Number(event.target.value))}
          aria-label="How close"
          className="bg-page border border-line rounded-xl px-3 py-2 text-[11px] text-ink"
        >
          <option value={1}>Next to (walking distance)</option>
          <option value={2}>Near (short drive)</option>
        </select>
        <button
          onClick={() => void add()}
          disabled={saving}
          className="bg-interactive text-ink rounded-xl px-3 py-2 text-[11px] font-extrabold flex items-center justify-center gap-1.5 disabled:opacity-50"
        >
          <Plus className="w-3.5 h-3.5" /> Add proximity
        </button>
      </div>

      <input
        value={note}
        onChange={(event) => setNote(event.target.value)}
        placeholder="Optional note (why these areas are neighbours)"
        className="w-full bg-page border border-line rounded-xl px-3 py-2 text-[11px] text-ink"
      />

      {adjacencies.length === 0 ? (
        <p className="text-[11px] text-ink/70 flex items-start gap-1.5">
          <Info className="w-3.5 h-3.5 shrink-0 mt-0.5" />
          No proximity is recorded yet, so the proximity component scores zero for every request. Match scores still
          use budget, area, type, bedrooms and bathrooms.
        </p>
      ) : (
        <ul className="divide-y divide-line">
          {adjacencies.map((row) => (
            <li key={row.id} className="py-2 flex items-center justify-between gap-2">
              <div>
                <p className="text-xs font-bold text-ink capitalize">
                  {row.areaA} · {row.areaB}
                </p>
                <p className="text-[10px] text-ink/70">
                  {row.bandLabel}
                  {row.note ? ` · ${row.note}` : ''}
                </p>
              </div>
              <button
                onClick={() => void remove(row)}
                aria-label={`Remove proximity between ${row.areaA} and ${row.areaB}`}
                className="px-2.5 py-1 rounded-md bg-page hover:bg-accent/15 text-ink text-[11px] flex items-center gap-1"
              >
                <Trash2 className="w-3 h-3" /> Remove
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};

export default AdminAreaAdjacency;
