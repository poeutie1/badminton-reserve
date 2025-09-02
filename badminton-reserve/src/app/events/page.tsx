// src/app/events/page.tsx
import YearMonthChooser from "./_components/YearMonthPicker";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default function EventsIndex() {
  // JSTで現在の年月を初期値に
  const now = Date.now();
  const jst = new Date(now + 9 * 60 * 60 * 1000);
  const defaultYear = jst.getUTCFullYear();
  const defaultMonth = jst.getUTCMonth() + 1;

  return (
    <div className="mx-auto max-w-md p-6">
      <h1 className="text-xl font-semibold mb-4">月を選んで表示</h1>
      <YearMonthChooser defaultYear={defaultYear} defaultMonth={defaultMonth} />
    </div>
  );
}
