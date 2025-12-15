import NextAuth from "next-auth"
import Credentials from "next-auth/providers/credentials"
import bcrypt from "bcryptjs"
import { prisma } from "./db"

export const { handlers, signIn, signOut, auth } = NextAuth({
  providers: [
    Credentials({
      name: "credentials",
      credentials: {
        username: { label: "Username", type: "text" },
        password: { label: "Password", type: "password" }
      },
      async authorize(credentials) {
        if (!credentials?.username || !credentials?.password) {
          return null
        }

        const username = credentials.username as string
        const password = credentials.password as string

        // Check for default admin on first run
        const userCount = await prisma.user.count()
        if (userCount === 0) {
          // Create default admin user
          const defaultUsername = process.env.ADMIN_USERNAME || "admin"
          const defaultPassword = process.env.ADMIN_PASSWORD || "admin123"

          if (username === defaultUsername && password === defaultPassword) {
            const hashedPassword = await bcrypt.hash(defaultPassword, 10)
            const newUser = await prisma.user.create({
              data: {
                username: defaultUsername,
                passwordHash: hashedPassword,
                role: "admin"
              }
            })
            return {
              id: newUser.id,
              name: newUser.username,
              role: newUser.role
            }
          }
        }

        // Normal authentication
        const user = await prisma.user.findUnique({
          where: { username }
        })

        if (!user) {
          return null
        }

        const isValid = await bcrypt.compare(password, user.passwordHash)
        if (!isValid) {
          return null
        }

        return {
          id: user.id,
          name: user.username,
          role: user.role
        }
      }
    })
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.id = user.id
        token.role = (user as { role?: string }).role
      }
      return token
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.id = token.id as string
        session.user.role = token.role as string
      }
      return session
    }
  },
  pages: {
    signIn: "/login"
  },
  session: {
    strategy: "jwt"
  },
  trustHost: true
})
