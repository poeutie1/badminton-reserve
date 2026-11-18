import type { GuestParticipant } from "./types";

export type Attendance = {
  participants: string[];
  waitlist: string[];
  guests: GuestParticipant[];
  guestWaitlist: GuestParticipant[];
};

export type Promotion =
  | { kind: "member"; id: string; notifyUserId: string }
  | { kind: "guest"; id: string; name: string; notifyUserId: string };

export function isMemberId(id: string): boolean {
  return /^[a-z]+:/.test(id) && !/^dummy/i.test(id);
}

function strings(value: unknown): string[] {
  return Array.isArray(value)
    ? [...new Set(value.filter((id): id is string => typeof id === "string").map(id => id.trim()).filter(Boolean))]
    : [];
}

function guests(value: unknown): GuestParticipant[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  return value.flatMap((item: unknown) => {
    if (!item || typeof item !== "object") return [];
    const guest = item as Record<string, unknown>;
    if (typeof guest.id !== "string" || !guest.id.startsWith("guest-") ||
        typeof guest.name !== "string" || !guest.name.trim() || seen.has(guest.id)) return [];
    seen.add(guest.id);
    return [{
      id: guest.id,
      name: guest.name.trim(),
      ...(guest.gender === "男性" || guest.gender === "女性" || guest.gender === "未回答"
        ? { gender: guest.gender } : {}),
      ...(typeof guest.years === "number" && Number.isFinite(guest.years) ? { years: guest.years } : {}),
      addedBy: typeof guest.addedBy === "string" ? guest.addedBy : "",
      addedAt: typeof guest.addedAt === "string" ? guest.addedAt : "",
    } satisfies GuestParticipant];
  });
}

/** Existing member-only events need no migration. Guest IDs refer to guestWaitlist. */
export function readAttendance(data: Record<string, unknown>): Attendance {
  const participants = strings(data.participants).filter(isMemberId);
  const attendingGuests = guests(data.guests);
  const attendingIds = new Set([...participants, ...attendingGuests.map(guest => guest.id)]);
  const waitingGuests = guests(data.guestWaitlist).filter(guest => !attendingIds.has(guest.id));
  const waitingIds = new Set(waitingGuests.map(guest => guest.id));
  const waitlist = strings(data.waitlist).filter(id =>
    !attendingIds.has(id) && (isMemberId(id) || waitingIds.has(id)));
  return {
    participants,
    guests: attendingGuests,
    waitlist,
    guestWaitlist: waitingGuests.filter(guest => waitlist.includes(guest.id)),
  };
}

export function participantCount(state: Attendance): number {
  return state.participants.length + state.guests.length;
}

/** Mutates a transaction-local state, preserving a single FIFO for members and guests. */
export function promoteWaitlist(state: Attendance, capacity: number): Promotion[] {
  const promoted: Promotion[] = [];
  while (participantCount(state) < capacity && state.waitlist.length) {
    const id = state.waitlist.shift()!;
    const guest = state.guestWaitlist.find(guest => guest.id === id);
    if (guest) {
      state.guestWaitlist = state.guestWaitlist.filter(item => item.id !== id);
      state.guests.push(guest);
      promoted.push({ kind: "guest", id, name: guest.name, notifyUserId: guest.addedBy });
    } else if (isMemberId(id) && !state.participants.includes(id)) {
      state.participants.push(id);
      promoted.push({ kind: "member", id, notifyUserId: id });
    }
  }
  return promoted;
}

export function joinMember(state: Attendance, userId: string, capacity: number) {
  if (state.participants.includes(userId) || state.waitlist.includes(userId)) {
    return { status: state.participants.includes(userId) ? "in" : "waiting", promoted: [] as Promotion[] };
  }
  const promoted = promoteWaitlist(state, capacity);
  if (participantCount(state) < capacity) {
    state.participants.push(userId);
    return { status: "in", promoted };
  }
  state.waitlist.push(userId);
  return { status: "waiting", promoted };
}

export function addGuest(state: Attendance, guest: GuestParticipant, capacity: number) {
  const promoted = promoteWaitlist(state, capacity);
  if (participantCount(state) < capacity) {
    state.guests.push(guest);
    return { status: "in", promoted };
  }
  state.guestWaitlist.push(guest);
  state.waitlist.push(guest.id);
  return { status: "waiting", promoted };
}

export function cancelMember(state: Attendance, userId: string, capacity: number, promote = true) {
  const wasParticipant = state.participants.includes(userId);
  state.participants = state.participants.filter(id => id !== userId);
  state.waitlist = state.waitlist.filter(id => id !== userId);
  return wasParticipant && promote ? promoteWaitlist(state, capacity) : [];
}

export function removeGuest(state: Attendance, guestId: string, capacity: number) {
  const wasParticipant = state.guests.some(guest => guest.id === guestId);
  state.guests = state.guests.filter(guest => guest.id !== guestId);
  state.guestWaitlist = state.guestWaitlist.filter(guest => guest.id !== guestId);
  state.waitlist = state.waitlist.filter(id => id !== guestId);
  return wasParticipant ? promoteWaitlist(state, capacity) : [];
}
