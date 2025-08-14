import type { DefaultSession } from "next-auth";

declare module "next-auth" {
  interface Session {
    user: DefaultSession["user"] & {
      uid: string; // LINE の sub
      lineUserId?: string | null; // 通知用
    };
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    lineUserId?: string | null;
  }
}
