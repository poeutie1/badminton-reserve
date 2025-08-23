// src/app/events/YearMonthChooser.tsx
"use client";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";

export default function YearMonthChooser({
  defaultYear,
  defaultMonth,
}: {
  defaultYear: number;
  defaultMonth: number;
}) {
  const router = useRouter();
  const [year, setYear] = useState(defaultYear);
  const [month, setMonth] = useState(defaultMonth);

  // 年の選択肢（前後3年）
  const years = useMemo(
    () => Array.from({ length: 7 }, (_, i) => defaultYear - 3 + i),
    [defaultYear]
  );

  const go = (y: number, m: number) => {
    // 月は 1-12 に丸め & 2桁にパディング
    if (m < 1) {
      y -= 1;
      m = 12;
    }
    if (m > 12) {
      y += 1;
      m = 1;
    }
    router.push(`/events/${y}/${String(m).padStart(2, "0")}`);
  };

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        go(year, month);
      }}
      className="flex flex-col gap-3"
    >
      <div className="flex items-center gap-2">
        <label className="text-sm text-gray-600">年</label>
        <select
          className="border rounded px-2 py-1"
          value={year}
          onChange={(e) => setYear(Number(e.target.value))}
        >
          {years.map((y) => (
            <option key={y} value={y}>
              {y}年
            </option>
          ))}
        </select>

        <label className="text-sm text-gray-600 ml-3">月</label>
        <select
          className="border rounded px-2 py-1"
          value={month}
          onChange={(e) => setMonth(Number(e.target.value))}
        >
          {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => (
            <option key={m} value={m}>
              {m}月
            </option>
          ))}
        </select>
      </div>

      <div className="flex items-center gap-2">
        <button
          type="button"
          className="px-3 py-1 border rounded"
          onClick={() => go(year, month - 1)}
        >
          ← 前月
        </button>
        <button type="submit" className="px-4 py-1 rounded bg-black text-white">
          表示する
        </button>
        <button
          type="button"
          className="px-3 py-1 border rounded"
          onClick={() => go(year, month + 1)}
        >
          次月 →
        </button>
      </div>
    </form>
  );
}
