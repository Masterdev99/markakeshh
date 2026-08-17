/**
 * CalendarView — renders a week grid + event list from Microsoft Graph calendarView.
 *
 * Ported from loadCalendar() / renderCalendarGrid() / formatEventTime()
 * at lines 13360–13650 of mailbox.html.
 *
 * Two sub-views:
 *   week   — 7-column grid, scroll-based, hour rows
 *   month  — 5-row month grid (future Phase enhancement)
 * Default: week view.
 */

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useAccountsStore } from '../../store/accounts';
import { calendarView } from '../../services/graph/calendar';
import './calendar.css';

type CalView = 'week' | 'month';

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December'];

function startOfWeek(d: Date): Date {
  const clone = new Date(d);
  clone.setDate(d.getDate() - d.getDay());
  clone.setHours(0, 0, 0, 0);
  return clone;
}

function formatEventTime(isoStr: string, isAllDay: boolean): string {
  if (isAllDay) return 'All day';
  const d = new Date(isoStr);
  return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
}

function toLocalDateKey(isoStr: string): string {
  // Returns YYYY-MM-DD in local time
  const d = new Date(isoStr);
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}

export function CalendarView() {
  const { accounts, currentAccountIdx } = useAccountsStore();
  const account = currentAccountIdx >= 0 ? accounts[currentAccountIdx] : null;
  const [view, setView] = useState<CalView>('week');
  const [currentDate, setCurrentDate] = useState(new Date());

  // Compute week range
  const weekStart = startOfWeek(currentDate);
  const weekEnd = new Date(weekStart);
  weekEnd.setDate(weekStart.getDate() + 7);
  weekEnd.setHours(23, 59, 59, 999);

  // Compute month range for month view
  const monthStart = new Date(currentDate.getFullYear(), currentDate.getMonth(), 1);
  const monthEnd = new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 0, 23, 59, 59);

  const startDt = view === 'week' ? weekStart : monthStart;
  const endDt = view === 'week' ? weekEnd : monthEnd;

  const { data: events = [], isLoading, error } = useQuery({
    queryKey: ['calendar', account?.id, startDt.toISOString(), endDt.toISOString()],
    queryFn: () => calendarView(startDt.toISOString(), endDt.toISOString(), account!.accessToken, currentAccountIdx),
    enabled: !!account,
    staleTime: 5 * 60_000,
  });

  function navigate(delta: number) {
    const d = new Date(currentDate);
    if (view === 'week') d.setDate(d.getDate() + delta * 7);
    else d.setMonth(d.getMonth() + delta);
    setCurrentDate(d);
  }

  const today = new Date();
  const todayKey = toLocalDateKey(today.toISOString());

  // Build week days
  const weekDays = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(weekStart);
    d.setDate(weekStart.getDate() + i);
    return d;
  });

  // Map events by date key
  const byDay = new Map<string, typeof events>();
  for (const ev of events) {
    const key = toLocalDateKey(ev.start?.dateTime || ev.start?.date || '');
    if (!byDay.has(key)) byDay.set(key, []);
    byDay.get(key)!.push(ev);
  }

  // weekEnd is exclusive (the following Sunday) — display the actual last visible day (weekEnd - 1).
  const weekLastDay = new Date(weekStart);
  weekLastDay.setDate(weekStart.getDate() + 6);

  const headerTitle = view === 'week'
    ? weekStart.getMonth() === weekLastDay.getMonth()
      ? `${MONTHS[weekStart.getMonth()]} ${weekStart.getDate()} – ${weekLastDay.getDate()}, ${weekStart.getFullYear()}`
      : `${MONTHS[weekStart.getMonth()]} ${weekStart.getDate()} – ${MONTHS[weekLastDay.getMonth()]} ${weekLastDay.getDate()}, ${weekLastDay.getFullYear()}`
    : `${MONTHS[currentDate.getMonth()]} ${currentDate.getFullYear()}`;

  return (
    <div className="calendar-view" id="calendarView">
      {/* Toolbar */}
      <div className="calendar-toolbar">
        <button className="toolbar-btn" onClick={() => navigate(-1)}>‹</button>
        <button className="toolbar-btn" onClick={() => { setCurrentDate(new Date()); }}>Today</button>
        <button className="toolbar-btn" onClick={() => navigate(1)}>›</button>
        <h3 style={{ margin: '0 12px', fontSize: 15, fontWeight: 600 }}>{headerTitle}</h3>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 4 }}>
          <button className={`filter-chip${view === 'week' ? ' active' : ''}`} onClick={() => setView('week')}>Week</button>
          <button className={`filter-chip${view === 'month' ? ' active' : ''}`} onClick={() => setView('month')}>Month</button>
        </div>
      </div>

      {isLoading && <div className="message-list-loading">Loading calendar…</div>}
      {error && <div className="message-list-empty" style={{ color: 'var(--error)' }}>Failed to load calendar</div>}
      {!account && <div className="message-list-empty">No account selected</div>}

      {account && !isLoading && (
        <div className="calendar-grid-wrap">
          {/* Day headers */}
          <div className="cal-week-header">
            {weekDays.map((d) => {
              const key = toLocalDateKey(d.toISOString());
              const isToday = key === todayKey;
              return (
                <div key={key} className={`cal-day-header${isToday ? ' today' : ''}`}>
                  <div className="cal-day-name">{DAYS[d.getDay()]}</div>
                  <div className={`cal-day-num${isToday ? ' today-circle' : ''}`}>{d.getDate()}</div>
                </div>
              );
            })}
          </div>

          {/* Event rows per day */}
          <div className="cal-week-body">
            {weekDays.map((d) => {
              const key = toLocalDateKey(d.toISOString());
              const dayEvents = byDay.get(key) ?? [];
              return (
                <div key={key} className={`cal-day-col${key === todayKey ? ' today-col' : ''}`}>
                  {dayEvents.length === 0 ? (
                    <div className="cal-no-events" />
                  ) : dayEvents.map((ev, i) => (
                    <div
                      key={ev.id ?? i}
                      className="cal-event"
                      style={{
                        background: ev.isAllDay ? 'var(--primary-light)' : 'var(--primary)',
                        color: ev.isAllDay ? 'var(--primary)' : '#fff',
                      }}
                      title={`${ev.subject}\n${formatEventTime(ev.start?.dateTime ?? '', !!ev.isAllDay)} – ${formatEventTime(ev.end?.dateTime ?? '', !!ev.isAllDay)}`}
                    >
                      <div className="cal-event-time">
                        {ev.isAllDay ? 'All day' : formatEventTime(ev.start?.dateTime ?? '', false)}
                      </div>
                      <div className="cal-event-title">{ev.subject}</div>
                      {ev.location?.displayName && (
                        <div className="cal-event-loc">📍 {ev.location.displayName}</div>
                      )}
                    </div>
                  ))}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Event count summary */}
      {!isLoading && events.length > 0 && (
        <div style={{ padding: '8px 16px', fontSize: 12, color: 'var(--text-muted)', borderTop: '1px solid var(--border-light)' }}>
          {events.length} event{events.length !== 1 ? 's' : ''} this {view}
        </div>
      )}
    </div>
  );
}
