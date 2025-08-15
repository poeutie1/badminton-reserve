// src/app/events/_components/ParticipantsLine.tsx
"use client";

export default function ParticipantsLine({
  people,
  me,
}: {
  people: Array<{ id: string; name: string; avatarUrl?: string | null }>;
  me?: string;
}) {
  const maxShow = 5;
  const show = people.slice(0, maxShow);
  const rest = people.length - show.length;

  return (
    <div className="mt-2 flex flex-wrap items-center gap-2 text-sm">
      <span className="text-gray-500">参加者:</span>
      {show.map((p) => (
        <span
          key={p.id}
          className="inline-flex items-center gap-1 rounded-full border px-2 py-0.5"
          title={p.id}
        >
          {/* アバターがあれば */}
          {p.avatarUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={p.avatarUrl} alt="" className="h-4 w-4 rounded-full" />
          ) : (
            <span className="h-4 w-4 rounded-full bg-gray-200 inline-block" />
          )}
          <span>
            {p.name}
            {me && p.id === me ? "（あなた）" : ""}
          </span>
        </span>
      ))}
      {rest > 0 && <span className="text-gray-500">+{rest}</span>}
    </div>
  );
}
