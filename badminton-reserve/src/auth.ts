import NextAuth from "next-auth";
import Line from "next-auth/providers/line";
import type { JWT } from "next-auth/jwt";

export const {
  auth,
  handlers: { GET, POST },
} = NextAuth({
  providers: [
    Line({
      clientId: process.env.LINE_CLIENT_ID!,
      clientSecret: process.env.LINE_CLIENT_SECRET!,
    }),
  ],
  session: { strategy: "jwt" },
  secret: process.env.NEXTAUTH_SECRET,
  callbacks: {
    async jwt({ token, profile, account }) {
      if (
        account?.provider === "line" &&
        profile &&
        typeof profile === "object"
      ) {
        // LINEの一意ID（sub）を保存
        const p = profile as { sub?: string; userId?: string };
        const sub = p.sub ?? p.userId;
        if (sub) token.lineUserId = sub;
      }
      return token as JWT;
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.uid = (token.sub ?? "") as string;
        session.user.lineUserId = token.lineUserId ?? null;
      }
      return session;
    },
  },
});
