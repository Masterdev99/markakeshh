/**
 * Calendar Graph API service.
 * Ported from lines 13632–13707.
 */

import { graphApi } from './client';
import type { CalendarEvent } from '../../types';

interface CalendarViewResponse {
  value: CalendarEvent[];
  '@odata.nextLink'?: string;
}

export async function fetchCalendarView(
  startDateTime: string,
  endDateTime: string,
  token: string,
  accountIdx: number
): Promise<CalendarEvent[]> {
  const endpoint =
    `/me/calendarView?startDateTime=${encodeURIComponent(startDateTime)}&endDateTime=${encodeURIComponent(endDateTime)}&$top=100&$select=id,subject,start,end,location,isOnlineMeeting,organizer,bodyPreview&$orderby=start/dateTime`;
  const resp = await graphApi(endpoint, token, 'GET', null, 3, accountIdx) as CalendarViewResponse;
  return resp.value ?? [];
}

export async function createCalendarEvent(
  event: Partial<CalendarEvent>,
  token: string,
  accountIdx: number
): Promise<CalendarEvent> {
  return graphApi('/me/events', token, 'POST', event, 3, accountIdx) as Promise<CalendarEvent>;
}

export async function deleteCalendarEvent(
  eventId: string,
  token: string,
  accountIdx: number
): Promise<void> {
  await graphApi(`/me/events/${eventId}`, token, 'DELETE', null, 3, accountIdx);
}

// Alias used by CalendarView component
export const calendarView = fetchCalendarView;
