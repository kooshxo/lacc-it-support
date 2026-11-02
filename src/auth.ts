import NextAuth from "next-auth";
import Google from "next-auth/providers/google";
import MicrosoftEntraID from "next-auth/providers/microsoft-entra-id";
import { isLaccEmail } from "@/lib/identity";

const allowedStaff = new Set(
  (process.env.IT_STAFF_EMAILS ?? "")
    .split(",")
    .map((email) => email.trim().toLowerCase())
    .filter(Boolean),
);

export const { handlers, auth, signIn, signOut } = NextAuth({
  providers: [Google, ...(process.env.AUTH_MICROSOFT_ENTRA_ID_TENANT_ID ? [MicrosoftEntraID({
    clientId: process.env.AUTH_MICROSOFT_ENTRA_ID_ID,
    clientSecret: process.env.AUTH_MICROSOFT_ENTRA_ID_SECRET,
    issuer: `https://login.microsoftonline.com/${process.env.AUTH_MICROSOFT_ENTRA_ID_TENANT_ID}/v2.0`,
    authorization: { params: { scope: "openid profile email User.Read" } },
  })] : [])],
  session: { strategy: "jwt", maxAge: 8 * 60 * 60 },
  trustHost: true,
  callbacks: {
    async signIn({ account, profile }) {
      const email = String(profile?.email ?? profile?.preferred_username ?? "").toLowerCase();
      if (account?.provider === "google") return allowedStaff.has(email);
      if (account?.provider !== "microsoft-entra-id" || process.env.DATA_BACKEND !== "sql") return false;
      if (!profile?.oid || profile.tid !== process.env.AUTH_MICROSOFT_ENTRA_ID_TENANT_ID || !isLaccEmail(email)) return false;
      try {
        const response = await fetch("https://graph.microsoft.com/v1.0/me?$select=id,userType", {
          headers: { Authorization: `Bearer ${account.access_token}` }, cache: "no-store", signal: AbortSignal.timeout(10000),
        });
        if (!response.ok) return false;
        const member = await response.json();
        return member.userType === "Member" && member.id === profile.oid;
      } catch { return false; }
    },
    async jwt({ token, account, profile }) {
      if (account && profile) {
        token.laccProvider = account.provider;
        token.laccIdentity = account.provider === "microsoft-entra-id" ? `${profile.tid}:${profile.oid}` : String(profile.email).toLowerCase();
        token.email = String(profile.email ?? profile.preferred_username ?? "").toLowerCase();
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
