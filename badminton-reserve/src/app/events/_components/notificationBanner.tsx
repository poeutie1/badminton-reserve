// 例: src/app/events/_components/NotificationsBanner.tsx
"use client";
import { useState } from "react";
import NotificationCard from "./NotificationCard";

type Item = { id: string; title: string; eventId?: string };

export default function NotificationsBanner({ items }: { items: Item[] }) {
  const [list, setList] = useState(items);
  if (!list.length) return null;

  return (
    <div className="space-y-3">
      {list.map((n) => (
        <NotificationCard
          key={n.id}
          {...n}
          onRead={(id) => setList((v) => v.filter((x) => x.id !== id))}
        />
      ))}
    </div>
  );
}
