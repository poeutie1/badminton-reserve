// src/lib/adminAuth.ts
import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";

const COOKIE_NAME = "adminToken";
const MAX_AGE_SEC = 60 * 60 * 12; // 12時間

function getSecret() {
  const secret = process.env.NEXTAUTH_SECRET;
  if (!secret) throw new Error("NEXTAUTH_SECRET is not set");
  return new TextEncoder().encode(secret);
}

export async function issueAdminCookie() {
  const now = Math.floor(Date.now() / 1000);
  const jwt = await new SignJWT({ adm: true })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt(now)
    .setExpirationTime(now + MAX_AGE_SEC)
    .sign(getSecret());

  (await cookies()).set(COOKIE_NAME, jwt, {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    path: "/",
    maxAge: MAX_AGE_SEC,
  });
}

export async function clearAdminCookie() {
  (await cookies()).set(COOKIE_NAME, "", {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    path: "/",
    maxAge: 0,
  });
}

export async function verifyAdminFromCookie(): Promise<boolean> {
  const jar = await cookies();
  const token = jar.get(COOKIE_NAME)?.value;
  if (!token) return false;
  try {
    const { payload } = await jwtVerify(token, getSecret());
    return payload?.adm === true;
  } catch {
    return false;
  }
}
