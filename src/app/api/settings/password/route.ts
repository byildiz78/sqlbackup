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
  const { currentPassword, newPassword } = body

  if (!currentPassword || !newPassword) {
    return NextResponse.json({ error: "Missing required fields" }, { status: 400 })
  }

  const user = await prisma.user.findUnique({
    where: { username: session.user.name }
  })

  if (!user) {
    return NextResponse.json({ error: "User not found" }, { status: 404 })
  }

  const isValid = await bcrypt.compare(currentPassword, user.passwordHash)
  if (!isValid) {
    return NextResponse.json({ error: "Current password is incorrect" }, { status: 400 })
  }

  const hashedPassword = await bcrypt.hash(newPassword, 10)

  await prisma.user.update({
    where: { id: user.id },
    data: { passwordHash: hashedPassword }
  })

  return NextResponse.json({ message: "Password changed successfully" })
}
