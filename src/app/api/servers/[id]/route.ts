import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/db"
import { encrypt } from "@/lib/crypto"

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth()
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const { id } = await params

  const server = await prisma.sqlServer.findUnique({
    where: { id },
    include: {
      databases: {
        orderBy: { name: "asc" }
      }
    }
  })

  if (!server) {
    return NextResponse.json({ error: "Server not found" }, { status: 404 })
  }

  const { passwordEncrypted, ...sanitized } = server

  return NextResponse.json({ ...sanitized, hasPassword: !!passwordEncrypted })
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth()
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const { id } = await params
  const body = await request.json()
  const { name, host, port, username, password, isActive } = body

  const updateData: Record<string, unknown> = {}
  if (name !== undefined) updateData.name = name
  if (host !== undefined) updateData.host = host
  if (port !== undefined) updateData.port = port
  if (username !== undefined) updateData.username = username
  if (password) updateData.passwordEncrypted = encrypt(password)
  if (isActive !== undefined) updateData.isActive = isActive

  const server = await prisma.sqlServer.update({
    where: { id },
    data: updateData
  })

  return NextResponse.json({
    id: server.id,
    name: server.name,
    message: "Server updated successfully"
  })
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth()
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const { id } = await params

  await prisma.sqlServer.delete({
    where: { id }
  })

  return NextResponse.json({ message: "Server deleted successfully" })
}
