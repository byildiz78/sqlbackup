import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/db"
import { encrypt } from "@/lib/crypto"
import { testConnection, createConnection, getDatabases } from "@/lib/mssql"

export async function GET() {
  const session = await auth()
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const servers = await prisma.sqlServer.findMany({
    include: {
      _count: {
        select: { databases: true }
      }
    },
    orderBy: { name: "asc" }
  })

  // Don't send encrypted passwords to client
  const sanitized = servers.map(({ passwordEncrypted, ...server }) => ({
    ...server,
    hasPassword: !!passwordEncrypted
  }))

  return NextResponse.json(sanitized)
}

export async function POST(request: NextRequest) {
  const session = await auth()
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const body = await request.json()
  const { name, host, port, username, password } = body

  if (!name || !host || !username || !password) {
    return NextResponse.json({ error: "Missing required fields" }, { status: 400 })
  }

  // Test connection first
  const testResult = await testConnection({
    host,
    port: port || 1433,
    username,
    password
  })

  if (!testResult.success) {
    return NextResponse.json({ error: testResult.message }, { status: 400 })
  }

  // Create server
  const server = await prisma.sqlServer.create({
    data: {
      name,
      host,
      port: port || 1433,
      username,
      passwordEncrypted: encrypt(password),
      isActive: true
    }
  })

  // Discover databases
  try {
    const pool = await createConnection({ host, port: port || 1433, username, password })
    const databases = await getDatabases(pool)
    await pool.close()

    // Create database records
    for (const db of databases) {
      await prisma.database.create({
        data: {
          serverId: server.id,
          name: db.name,
          sizeMb: db.sizeMb,
          lastBackupFull: db.lastFullBackup,
          lastBackupDiff: db.lastDiffBackup,
          status: db.state.toLowerCase()
        }
      })
    }
  } catch (error) {
    console.error("Error discovering databases:", error)
  }

  return NextResponse.json({
    id: server.id,
    name: server.name,
    host: server.host,
    port: server.port,
    message: "Server added successfully"
  })
}
