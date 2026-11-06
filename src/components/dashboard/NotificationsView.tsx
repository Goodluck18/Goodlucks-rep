import React, { useMemo, useState } from 'react';
import {
  Bell,
  BellOff,
  CalendarCheck,
  Check,
  CheckCheck,
  Info,
  ShieldCheck,
  TriangleAlert,
  type LucideIcon,
} from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { EmptyState, SectionHeader } from './DashboardShell';
import type { DashboardRole } from './DashboardShell';

/**
 * Formats a timestamp for the notification list.
 *
 * Uses a fixed locale so the suite's snapshots/labels stay stable.
 */
function formatWhen(value?: string | null): string {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

const TYPE_ICON: Record<string, LucideIcon> = {
  success: Check,
  warning: TriangleAlert,
  error: TriangleAlert,
  info: Info,
  viewing: CalendarCheck,
  verification: ShieldCheck,
};

/**
 * The signed-in account's notifications.
 *
 * Opening this page changes nothing: notifications stay unread until the member
 * marks one (or all) read. The list itself comes from the server, scoped to the
 * session account, so no other member's notifications can appear here.
 */
export const NotificationsView: React.FC<{ role: DashboardRole }> = ({ role }) => {
  const { notifications, markNotificationRead, markAllNotificationsRead, navigate } = useApp();
  const [pending, setPending] = useState<string | null>(null);
  const [markingAll, setMarkingAll] = useState(false);

  const unread = useMemo(() => notifications.filter((item) => !item.read).length, [notifications]);

  const handleMarkRead = async (id: string) => {
    setPending(id);
    try {
      await markNotificationRead(id);
    } finally {
      setPending(null);
    }
  };

  const handleMarkAll = async () => {
    setMarkingAll(true);
    try {
      await markAllNotificationsRead();
    } finally {
      setMarkingAll(false);
    }
  };

  return (
    <div className="space-y-5">
      <SectionHeader
        title="Notifications"
        description={
          unread > 0
            ? `${unread} unread ${unread === 1 ? 'notification' : 'notifications'}. Nothing is marked read until you choose to.`
            : 'Updates about your viewings, listings and account appear here.'
        }
        actions={
          <button
            type="button"
            onClick={() => void handleMarkAll()}
            disabled={unread === 0 || markingAll}
            className="inline-flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-bold bg-page border border-line text-ink hover:text-ink hover:bg-page disabled:opacity-40 disabled:cursor-not-allowed transition-colors min-h-[40px]"
          >
            <CheckCheck className="w-4 h-4" />
            {markingAll ? 'Marking…' : 'Mark all as read'}
          </button>
        }
      />

      {notifications.length === 0 ? (
        <EmptyState
          icon={BellOff}
          title="No notifications yet"
          description="When a viewing is scheduled, a listing is reviewed or your account changes, the update will be listed here."
          action={
            <button
              type="button"
              onClick={() => navigate(`/${role}/dashboard`)}
              className="text-xs font-bold text-ink hover:underline"
            >
              Back to overview
            </button>
          }
        />
      ) : (
        <ul className="space-y-2.5">
          {notifications.map((item) => {
            const Icon = TYPE_ICON[item.type] ?? Bell;
            const isPending = pending === item.id;
            const showViewingsLink = item.type === 'viewing';
            return (
              <li
                key={item.id}
                data-testid="notification-item"
                data-read={item.read ? 'true' : 'false'}
                className={`rounded-2xl border p-4 transition-colors ${
                  item.read ? 'bg-page border-line' : 'bg-surface border-interactive'
                }`}
              >
                <div className="flex items-start gap-3">
                  <div
                    className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${
                      item.read ? 'bg-surface text-ink/70 border border-line' : 'bg-interactive text-ink'
                    }`}
                  >
                    <Icon className="w-4 h-4" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-start justify-between gap-3">
                      <p className={`text-sm leading-snug ${item.read ? 'font-semibold text-ink/70' : 'font-bold text-ink'}`}>
                        {!item.read && (
                          <span className="inline-block w-1.5 h-1.5 rounded-full bg-accent mr-2 align-middle" aria-hidden="true" />
                        )}
                        {item.title}
                      </p>
                      <span className="text-[10px] text-ink/70 whitespace-nowrap shrink-0">{formatWhen(item.createdAt)}</span>
                    </div>
                    {item.message && (
                      <p className="text-xs text-ink/70 mt-1 leading-relaxed break-words">{item.message}</p>
                    )}
                    <div className="flex items-center gap-3 mt-2 flex-wrap">
                      {showViewingsLink && (
                        <button
                          type="button"
                          onClick={() => navigate(`/${role}/viewings`)}
                          className="text-[11px] font-bold text-ink hover:underline"
                        >
                          Open viewing
                        </button>
                      )}
                      {!item.read && (
                        <button
                          type="button"
                          onClick={() => void handleMarkRead(item.id)}
                          disabled={isPending}
                          className="text-[11px] font-bold text-ink/70 hover:text-ink disabled:opacity-50"
                        >
                          {isPending ? 'Marking…' : 'Mark as read'}
                        </button>
                      )}
                      {item.read && <span className="text-[11px] text-ink/70">Read</span>}
                    </div>
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
};
