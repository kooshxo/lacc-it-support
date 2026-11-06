import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { scrypt as scryptCallback, timingSafeEqual } from "node:crypto";
import { consumeSharedLoginAttempt, clearSharedLoginAttempts } from "@/lib/sql/auth-rate-limit";

async function verifyPassword(password: string, storedHash: string): Promise<boolean> {
  const match = /^scrypt\$16384\$8\$1\$([a-f0-9]{32})\$([a-f0-9]{128})$/.exec(storedHash);
  if (!match) return false;
  const salt = Buffer.from(match[1], "hex");
  const expected = Buffer.from(match[2], "hex");
  const actual = await new Promise<Buffer>((resolve, reject) => {
    scryptCallback(password, salt, 64, { N: 16384, r: 8, p: 1, maxmem: 32 * 1024 * 1024 }, (error, key) => {
      if (error) reject(error);
      else resolve(key as Buffer);
    });
  });
  return timingSafeEqual(actual, expected);
}

const sharedStaffLogin = Credentials({
  id: "credentials",
  name: "IT Staff",
  credentials: {
    username: { label: "Username", type: "text" },
    password: { label: "Password", type: "password" },
  },
  async authorize(credentials, request) {
    if (process.env.DATA_BACKEND !== "sql") return null;
    const username = typeof credentials?.username === "string" ? credentials.username.trim().slice(0, 80) : "";
    const password = typeof credentials?.password === "string" ? credentials.password.slice(0, 1024) : "";
    const expectedUsername = process.env.IT_SHARED_USERNAME?.trim();
    const storedHash = process.env.IT_SHARED_PASSWORD_HASH;
    const address = request.headers.get("x-real-ip")?.trim()
      || request.headers.get("x-forwarded-for")?.split(",")[0]?.trim()
      || "unknown-client";

    if (!expectedUsername || !storedHash || !username || !password) return null;
    if (!(await consumeSharedLoginAttempt(address))) return null;

    const suppliedName = Buffer.from(username.toLowerCase());
    const configuredName = Buffer.from(expectedUsername.toLowerCase());
    const usernameMatches = suppliedName.length === configuredName.length
      && timingSafeEqual(suppliedName, configuredName);
    const passwordMatches = await verifyPassword(password, storedHash).catch(() => false);
    if (!usernameMatches || !passwordMatches) return null;

    await clearSharedLoginAttempts(address);
    return { id: "shared-it", name: "IT Staff", email: "it-staff@shared.invalid" };
  },
});

export const { handlers, auth, signIn, signOut } = NextAuth({
  providers: [sharedStaffLogin],
  session: { strategy: "jwt", maxAge: 8 * 60 * 60 },
  trustHost: true,
  callbacks: {
    async jwt({ token, user, account }) {
      if (user && account?.provider === "credentials" && user.id === "shared-it") {
        token.laccProvider = "credentials";
        token.laccIdentity = "shared-it";
        token.email = "it-staff@shared.invalid";
        token.name = "IT Staff";
      }
      return token;
    },
    async session({ session, token }) {
      session.user.id = String(token.laccIdentity ?? "");
      return session;
    },
  },
  pages: { signIn: "/auth/signin", error: "/access-denied" },
  cookies: {
    sessionToken: {
      name: process.env.NODE_ENV === "production" ? "__Secure-lacc.session" : "lacc.session",
      options: { httpOnly: true, sameSite: "lax", path: "/", secure: process.env.NODE_ENV === "production" },
    },
  },
});
