import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/db"
import bcrypt from "bcryptjs"

export async function POST(request: NextRequest) {
  const session = await auth()
  if (!session?.user?.name) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const body = await request.json()
  const { newUsername, password } = body

  if (!newUsername || !password) {
    return NextResponse.json({ error: "Missing required fields" }, { status: 400 })
  }

  if (newUsername.length < 3) {
    return NextResponse.json({ error: "Username must be at least 3 characters" }, { status: 400 })
  }

  const user = await prisma.user.findUnique({
    where: { username: session.user.name }
  })

  if (!user) {
    return NextResponse.json({ error: "User not found" }, { status: 404 })
  }

  // Verify password
  const isValid = await bcrypt.compare(password, user.passwordHash)
  if (!isValid) {
    return NextResponse.json({ error: "Password is incorrect" }, { status: 400 })
  }

  // Check if username is already taken
  const existingUser = await prisma.user.findUnique({
    where: { username: newUsername }
  })

  if (existingUser && existingUser.id !== user.id) {
    return NextResponse.json({ error: "Username already taken" }, { status: 400 })
  }

  await prisma.user.update({
    where: { id: user.id },
    data: { username: newUsername }
  })

  return NextResponse.json({ message: "Username changed successfully" })
}
