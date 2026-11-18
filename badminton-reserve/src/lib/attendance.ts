import type { GuestParticipant } from "./types";

export type Attendance = {
  participants: string[];
  waitlist: string[];
  guests: GuestParticipant[];
  guestWaitlist: GuestParticipant[];
};
export type Promotion = {
  id: string;
  notifyUserId: string;
  guestName?: string;
};

export function isMemberId(id: string) {
  return /^[a-z]+:/.test(id) && !/^dummy/i.test(id);
}
function strings(value: unknown): string[] {
  return Array.isArray(value)
    ? [...new Set(value.filter((id): id is string => typeof id === "string").map(id => id.trim()).filter(Boolean))]
    : [];
}
function guestList(value: unknown): GuestParticipant[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  return value.filter((guest): guest is GuestParticipant => {
    if (!guest || typeof guest !== "object" || typeof guest.id !== "string" ||
        !guest.id.startsWith("guest-") || typeof guest.name !== "string" || seen.has(guest.id)) return false;
    seen.add(guest.id);
    return true;
  });
}

/** waitlistの受付順は会員・ゲストで共通。既存の会員のみのデータにも対応する。 */
export function readAttendance(data: Record<string, unknown>): Attendance {
  const participants = strings(data.participants).filter(isMemberId);
  const guests = guestList(data.guests);
  const attendingIds = new Set([...participants, ...guests.map(guest => guest.id)]);
  const guestWaitlist = guestList(data.guestWaitlist).filter(guest => !attendingIds.has(guest.id));
  const guestIds = new Set(guestWaitlist.map(guest => guest.id));
  const waitlist = strings(data.waitlist).filter(id =>
    !attendingIds.has(id) && (isMemberId(id) || guestIds.has(id)));
  return { participants, guests, waitlist, guestWaitlist: guestWaitlist.filter(guest => waitlist.includes(guest.id)) };
}

export function participantCount(state: Attendance) {
  return state.participants.length + state.guests.length;
}
export function promoteWaitlist(state: Attendance, capacity: number): Promotion[] {
  const promoted: Promotion[] = [];
  while (participantCount(state) < capacity && state.waitlist.length) {
    const id = state.waitlist.shift()!;
    const guest = state.guestWaitlist.find(guest => guest.id === id);
    if (guest) {
      state.guestWaitlist = state.guestWaitlist.filter(guest => guest.id !== id);
      state.guests.push(guest);
      promoted.push({ id, notifyUserId: guest.addedBy, guestName: guest.name });
    } else if (isMemberId(id) && !state.participants.includes(id)) {
      state.participants.push(id);
      promoted.push({ id, notifyUserId: id });
    }
  }
  return promoted;
}
export function joinMember(state: Attendance, userId: string, capacity: number) {
  if (state.participants.includes(userId) || state.waitlist.includes(userId)) {
    return { status: state.participants.includes(userId) ? "in" : "waiting", promoted: [] as Promotion[] };
  }
  const promoted = promoteWaitlist(state, capacity);
  const status = participantCount(state) < capacity ? "in" : "waiting";
  state[status === "in" ? "participants" : "waitlist"].push(userId);
  return { status, promoted };
}
export function addGuest(state: Attendance, guest: GuestParticipant, capacity: number) {
  const promoted = promoteWaitlist(state, capacity);
  const status = participantCount(state) < capacity ? "in" : "waiting";
  if (status === "in") state.guests.push(guest);
  else { state.guestWaitlist.push(guest); state.waitlist.push(guest.id); }
  return { status, promoted };
}
export function cancelMember(state: Attendance, id: string, capacity: number, promote = true) {
  const attended = state.participants.includes(id);
  state.participants = state.participants.filter(user => user !== id);
  state.waitlist = state.waitlist.filter(user => user !== id);
  return attended && promote ? promoteWaitlist(state, capacity) : [];
}
export function removeGuest(state: Attendance, id: string, capacity: number) {
  const attended = state.guests.some(guest => guest.id === id);
  state.guests = state.guests.filter(guest => guest.id !== id);
  state.guestWaitlist = state.guestWaitlist.filter(guest => guest.id !== id);
  state.waitlist = state.waitlist.filter(user => user !== id);
  return attended ? promoteWaitlist(state, capacity) : [];
}
