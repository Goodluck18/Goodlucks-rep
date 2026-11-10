import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { api, messageForError } from '../services/apiService';
import type { AdminAgentTiers as AdminAgentTiersResponse, AdminAgentTierRow } from '../types';
import { AlertTriangle, BadgeCheck, Loader2, RefreshCw, Search, ShieldQuestion } from 'lucide-react';

/**
 * Agent commission tiers (Upgrade 2 A9).
 *
 * A tier decides how a real commission is split, so it is derived from approved
 * verification and shown here — never chosen from a dropdown. There is no
 * endpoint that assigns a tier, and this panel does not pretend otherwise: it
 * names the verification decision that would change one.
 */

const tierStyles: Record<string, string> = {
  professional: 'bg-emerald-500/15 text-emerald-700 border-emerald-500/30',
  standard: 'bg-sky-500/10 text-sky-700 border-sky-500/30',
};

const AdminAgentTiers: React.FC = () => {
  const [data, setData] = useState<AdminAgentTiersResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState('');

  const load = useCallback(async () => {
    setIsLoading(true);
    try {
      const result = await api.adminAgentTiers();
      setData(result);
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

  const rows = useMemo<AdminAgentTierRow[]>(() => {
    const term = query.trim().toLowerCase();
    const agents = [...(data?.agents ?? [])].sort((a, b) => {
      // Agents who can currently earn a commission first, then by name.
      if (a.commissionEligible !== b.commissionEligible) return a.commissionEligible ? -1 : 1;
      if (a.tier !== b.tier) return a.tier === 'professional' ? -1 : 1;
      return a.name.localeCompare(b.name);
    });
    if (!term) return agents;
    return agents.filter(
      (agent) =>
        agent.name.toLowerCase().includes(term) ||
        agent.email.toLowerCase().includes(term) ||
        agent.agencyName.toLowerCase().includes(term)
    );
  }, [data, query]);

  if (isLoading && !data) {
    return (
      <div className="bg-surface p-6 rounded-2xl border border-line flex items-center gap-3 text-xs text-ink/70">
        <Loader2 className="w-4 h-4 animate-spin" /> Loading agent tiers…
      </div>
    );
  }

  if (error && !data) {
    return (
      <div className="bg-surface p-6 rounded-2xl border border-accent/30 text-xs text-ink flex items-center gap-2">
        <AlertTriangle className="w-4 h-4" /> {error}
      </div>
    );
  }

  if (!data) return null;

  const standard = data.rules.standard as { label: string; percent: number; requires: string };
  const professional = data.rules.professional as { label: string; percent: number; requires: string };

  return (
    <div className="bg-surface border border-line rounded-2xl p-4 space-y-3">
      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-2">
        <div>
          <h4 className="text-xs font-bold text-ink flex items-center gap-2">
            <BadgeCheck className="w-4 h-4 text-ink" /> Agent commission tiers
          </h4>
          <p className="text-[11px] text-ink/70 max-w-2xl mt-1">
            {standard.label}: agent {standard.percent}% of the agreed commission. {professional.label}: agent{' '}
            {professional.percent}%. A tier is earned by verification, not assigned here.
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

      <div className="flex flex-wrap items-center gap-2 text-[10px] text-ink/70">
        <span className="px-2 py-0.5 rounded-full border border-line bg-page font-bold text-ink">
          {data.counts.total} agent{data.counts.total === 1 ? '' : 's'}
        </span>
        <span className="px-2 py-0.5 rounded-full border bg-sky-500/10 text-sky-700 border-sky-500/30 font-bold">
          {data.counts.standard} standard
        </span>
        <span className="px-2 py-0.5 rounded-full border bg-emerald-500/15 text-emerald-700 border-emerald-500/30 font-bold">
          {data.counts.professional} professional
        </span>
        <span className="px-2 py-0.5 rounded-full border border-line bg-page font-bold">
          {data.counts.no_commission_tier} without a commission tier
        </span>
      </div>

      <label className="flex items-center gap-2 bg-page border border-line rounded-xl px-3 py-2">
        <Search className="w-3.5 h-3.5 text-ink/70" />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search agents by name, email or agency"
          className="w-full bg-transparent text-xs text-ink outline-none"
        />
      </label>

      {rows.length === 0 ? (
        <p className="text-[11px] text-ink/70">
          {data.counts.total === 0 ? 'No agent account exists yet.' : 'No agent matches that search.'}
        </p>
      ) : (
        <ul className="divide-y divide-line">
          {rows.map((agent) => (
            <li key={agent.userId} className="py-2 flex flex-col sm:flex-row sm:items-center justify-between gap-1.5">
              <div>
                <p className="text-xs font-bold text-ink">
                  {agent.name}
                  {!agent.canSubmitListings && (
                    <span className="ml-2 text-[10px] font-normal text-ink/70">cannot submit listings yet</span>
                  )}
                </p>
                <p className="text-[10px] text-ink/70">
                  {agent.email}
                  {agent.agencyName ? ` · ${agent.agencyName}` : ''} · identity {agent.identityStatus} ·
                  professional {agent.professionalStatus}
                </p>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <span
                  className={`px-2 py-0.5 rounded-full border text-[10px] font-bold ${
                    tierStyles[agent.tier] ?? 'bg-line/20 text-ink/70 border-line'
                  }`}
                >
                  {agent.tierLabel}
                </span>
                <span className="text-[10px] text-ink/70">
                  {agent.commissionEligible
                    ? `${agent.commissionPercent}% / Goodlucks ${agent.goodlucksPercent}%`
                    : 'no commission until identity is approved'}
                </span>
              </div>
            </li>
          ))}
        </ul>
      )}

      <p className="text-[10px] text-ink/70 flex items-start gap-1.5">
        <ShieldQuestion className="w-3.5 h-3.5 shrink-0 mt-0.5" />
        {data.note}
      </p>
    </div>
  );
};

export default AdminAgentTiers;
