import NextAuth from "next-auth";
import { timingSafeEqual } from "node:crypto";
import Credentials from "next-auth/providers/credentials";

function passwordMatches(candidate: string, configured: string): boolean {
  const candidateBytes = Buffer.from(candidate, "utf8");
  const configuredBytes = Buffer.from(configured, "utf8");
  return candidateBytes.length === configuredBytes.length && timingSafeEqual(candidateBytes, configuredBytes);
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  providers: [Credentials({
    id: "credentials",
    name: "Staff",
    credentials: {
      username: { label: "User", type: "text" },
      password: { label: "Password", type: "password" },
    },
    async authorize(credentials) {
      const username = typeof credentials?.username === "string" ? credentials.username : "";
      const password = typeof credentials?.password === "string" ? credentials.password : "";
      const configuredPassword = process.env.STAFF_LOGIN_PASSWORD;
      if (username !== "Staff" || !password || !configuredPassword || !passwordMatches(password, configuredPassword)) return null;
      return { id: "lacc-staff", name: "IT Staff", email: "it.staff@thelatincenter.org" };
    },
  })],
  session: { strategy: "jwt", maxAge: 8 * 60 * 60 },
  trustHost: true,
  pages: { signIn: "/auth/signin", error: "/access-denied" },
  cookies: {
    sessionToken: {
      name: process.env.NODE_ENV === "production" ? "__Secure-lacc.session" : "lacc.session",
      options: { httpOnly: true, sameSite: "lax", path: "/", secure: process.env.NODE_ENV === "production" },
    },
  },
});
