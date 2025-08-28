// src/app/login/page.tsx  (Server Component)
import { auth } from "@/auth";
import { redirect } from "next/navigation";
import LoginClient from "./LoginClient";

export const dynamic = "force-dynamic";

export default async function Page() {
  const session = await auth();
  if (session) redirect("/events");
  return <LoginClient />;
}
