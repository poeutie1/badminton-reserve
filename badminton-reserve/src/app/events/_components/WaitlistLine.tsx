// WaitlistLine も同様に（promote=false）:
"use client";
import AdminKickButton from "./AdminKickButton";
type Person = { id: string; name: string; avatarUrl?: string | null };

export default function WaitlistLine({
  people,
  me,
  adminEventId,
}: {
  people: Person[];
  me?: string;
  adminEventId?: string;
}) {
  return (
    <div className="flex flex-wrap gap-2">
      {people.map((p) => (
        <span
          key={p.id}
          className="inline-flex items-center gap-2 rounded-full border px-2 py-1 text-sm"
        >
          {p.avatarUrl && (
            <img
              src={p.avatarUrl}
              alt=""
              className="h-6 w-6 rounded-full object-cover shrink-0"
            />
          )}
          <span className="whitespace-nowrap">
            {p.name}
            {me === p.id ? "（自分）" : ""}
          </span>
          {adminEventId && (
            <AdminKickButton
              eventId={adminEventId}
              targetUserId={p.id}
              promote={false}
              title="待機から外します"
            />
          )}
        </span>
      ))}
    </div>
  );
}
