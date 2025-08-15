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
        // LINE の一意ID（sub or userId）
        const p = profile as {
          sub?: string;
          userId?: string;
          name?: string;
          picture?: string;
        };
        const sub =
          p.sub ??
          p.userId ??
          account.providerAccountId ??
          token.sub ??
          undefined;

        // ここで “公式の uid = provider:subject” を作る
        if (sub) (token as any).uid = `line:${sub}`;

        // 表示名・アイコンも残しておく（あれば）
        if (p.name) token.name = p.name;
        if (p.picture) (token as any).picture = p.picture;
      }
      return token as JWT;
    },
    async session({ session, token }) {
      if (session.user) {
        // 互換のため従来フィールドも維持
        (session.user as any).uid = (token.sub ?? "") as string;
        (session.user as any).lineUserId = (token as any).lineUserId ?? null;

        // ★ここが肝：アプリ全体で使うIDを session.user.id に統一
        (session.user as any).id =
          (token as any).uid ??
          ((token as any).lineUserId
            ? `line:${(token as any).lineUserId}`
            : undefined);

        // 表示名・画像もセッションに載せておく（Profile同期で使う）
        if ((token as any).picture)
          (session.user as any).image = (token as any).picture;
        if (token.name) session.user.name = token.name;
      }
      return session;
    },
  },
});
