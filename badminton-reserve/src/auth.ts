import NextAuth from "next-auth";
import Line from "next-auth/providers/line";

/** ---------- type augmentations (no any) ---------- */
declare module "next-auth" {
  interface Session {
    user: {
      id?: string; // "line:xxxxxxxx"
      uid?: string; // 互換（必要なら）
      lineUserId?: string | null; // raw LINE id
      name?: string | null;
      email?: string | null;
      image?: string | null;
    };
  }
}
declare module "next-auth" {
  interface JWT {
    uid?: string; // "line:xxxxxxxx"
    lineUserId?: string; // raw LINE id
    name?: string;
    picture?: string;
  }
}
/** ------------------------------------------------- */

type LineProfile = {
  sub?: string;
  userId?: string;
  name?: string;
  picture?: string;
};

const isString = (v: unknown): v is string => typeof v === "string";
const pickStr = (obj: unknown, key: keyof LineProfile): string | undefined => {
  if (obj && typeof obj === "object") {
    const v = (obj as Record<string, unknown>)[key as string];
    return isString(v) ? v : undefined;
  }
  return undefined;
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
  /** v5 では AUTH_* 推奨。両対応にしておく */
  secret: process.env.AUTH_SECRET ?? process.env.NEXTAUTH_SECRET,
  trustHost: true,
  callbacks: {
    async jwt({ token, profile, account }) {
      // 初回サインイン時に一意IDを確定
      const lineSub =
        pickStr(profile, "sub") ??
        pickStr(profile, "userId") ??
        (isString(account?.providerAccountId)
          ? account?.providerAccountId
          : undefined) ??
        (isString(token.sub) ? token.sub : undefined);

      if (lineSub) {
        if (!token.uid) token.uid = `line:${lineSub}`;
        if (!token.lineUserId) token.lineUserId = lineSub;
      }

      const name = pickStr(profile, "name");
      const picture = pickStr(profile, "picture");
      if (name) token.name = name;
      if (picture) token.picture = picture;

      return token;
    },

    async session({ session, token }) {
      if (!session.user) return session;

      const uid = isString(token.uid) ? token.uid : undefined;
      const rawLineId =
        (isString(token.lineUserId) ? token.lineUserId : undefined) ??
        (uid && uid.startsWith("line:") ? uid.slice(5) : undefined);

      if (uid) session.user.id = uid;
      session.user.uid = isString(token.sub) ? token.sub : "";
      session.user.lineUserId = rawLineId ?? null;

      if (isString(token.picture)) session.user.image = token.picture;
      if (isString(token.name)) session.user.name = token.name;

      return session;
    },
  },
});
