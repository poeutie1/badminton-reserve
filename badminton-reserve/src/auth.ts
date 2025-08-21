// src/auth.ts
import NextAuth from "next-auth";
import Line from "next-auth/providers/line";

type LineProfile = {
  sub?: string;
  userId?: string;
  name?: string;
  picture?: string;
};

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
        const p = profile as Partial<LineProfile>;

        // LINE の一意ID（sub or userId）
        const sub =
          p.sub ??
          p.userId ??
          account.providerAccountId ??
          token.sub ??
          undefined;

        if (sub) {
          // 統一ID（プレフィクス付き）
          token.uid = `line:${sub}`;
          // raw の LINE ユーザーIDも保持（session で使う）
          token.lineUserId = sub;
        }

        if (p.name) token.name = p.name;
        if (p.picture) token.picture = p.picture;
      }
      return token;
    },

    async session({ session, token }) {
      if (session.user) {
        // 互換用: 従来の uid（= token.sub を踏襲）
        session.user.uid = typeof token.sub === "string" ? token.sub : "";

        // raw の LINE ユーザーIDを優先して保存。無ければ uid から復元
        const rawLineId =
          (typeof token.lineUserId === "string"
            ? token.lineUserId
            : undefined) ??
          (typeof token.uid === "string" && token.uid.startsWith("line:")
            ? token.uid.slice(5)
            : undefined);

        session.user.lineUserId = rawLineId ?? null;

        // アプリ全体の主ID（ある時だけセット）→ id は optional
        const uid = typeof token.uid === "string" ? token.uid : undefined;
        const mainId = uid ?? (rawLineId ? `line:${rawLineId}` : undefined);
        if (mainId) session.user.id = mainId;

        if (typeof token.picture === "string")
          session.user.image = token.picture;
        if (typeof token.name === "string") session.user.name = token.name;
      }
      return session;
    },
  },
});
