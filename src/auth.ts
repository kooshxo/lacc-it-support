import NextAuth from "next-auth";
import Google from "next-auth/providers/google";

const allowedStaff = new Set(
  (process.env.IT_STAFF_EMAILS ?? "")
    .split(",")
    .map((email) => email.trim().toLowerCase())
    .filter(Boolean),
);

export const { handlers, auth, signIn, signOut } = NextAuth({
  providers: [Google],
  session: { strategy: "jwt", maxAge: 8 * 60 * 60 },
  trustHost: true,
  callbacks: {
    async signIn({ profile }) {
      const email = String(profile?.email ?? profile?.preferred_username ?? "").toLowerCase();
      return allowedStaff.has(email);
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
