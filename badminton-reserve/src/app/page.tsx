import { redirect } from "next/navigation";

export default function Home() {
  // JST の今月へ
  const now = Date.now();
  const jst = new Date(now + 9 * 60 * 60 * 1000);
  const y = jst.getUTCFullYear();
  const m = String(jst.getUTCMonth() + 1).padStart(2, "0");
  redirect(`/events/${y}/${m}`);
}
