import React from 'react';
import { ShieldAlert } from 'lucide-react';
import type { User } from '../types';

/**
 * The provider's own view of a formal account suspension.
 *
 * A suspended Agent or Landlord keeps sign-in, the dashboard and its records —
 * that is deliberate, so nobody loses access to their account or their history.
 * What closes is publishing: creating, publishing and reactivating listings.
 * The notice says so in those words, and separates the suspension from identity
 * verification, which is a different fact.
 */
export const ProviderSuspensionNotice: React.FC<{ user: User | null }> = ({ user }) => {
  if (!user || user.accountStatus !== 'suspended') return null;

  return (
    <div className="rounded-2xl border border-accent/40 bg-accent/5 p-4 space-y-1">
      <p className="text-sm font-bold text-ink flex items-center gap-2">
        <ShieldAlert className="w-4 h-4 text-accent-text" /> Your account is suspended
      </p>
      {user.suspension?.reason && (
        <p className="text-xs text-ink/80">Reason recorded by Goodlucks: {user.suspension.reason}</p>
      )}
      <p className="text-xs text-ink/70 leading-relaxed">
        You can still sign in, see your listings and their history, and withdraw a listing. You cannot create, publish or
        reactivate listings while the suspension is in place. Your identity verification, records and photographs are
        kept. Contact Goodlucks Homes if you believe this is wrong.
      </p>
    </div>
  );
};

export default ProviderSuspensionNotice;
