import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/db"
import { decrypt } from "@/lib/crypto"
import { testConnection } from "@/lib/mssql"

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth()
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const { id } = await params

  const server = await prisma.sqlServer.findUnique({
    where: { id }
  })

  if (!server) {
    return NextResponse.json({ error: "Server not found" }, { status: 404 })
  }

  const result = await testConnection({
    host: server.host,
    port: server.port,
    username: server.username,
    password: decrypt(server.passwordEncrypted)
  })

  return NextResponse.json(result)
}
