import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/db"
import { createConnectionFromServer, checkOlaHallengrenInstalled, installOlaHallengren, getOlaHallengrenVersion } from "@/lib/mssql"

// GET - Check Ola Hallengren status
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
    where: { id }
  })

  if (!server) {
    return NextResponse.json({ error: "Server not found" }, { status: 404 })
  }

  try {
    const pool = await createConnectionFromServer(server)
    const isInstalled = await checkOlaHallengrenInstalled(pool)
    const version = isInstalled ? await getOlaHallengrenVersion(pool) : null
    await pool.close()

    return NextResponse.json({
      installed: isInstalled,
      version
    })
  } catch (error) {
    return NextResponse.json({
      error: error instanceof Error ? error.message : "Failed to check status"
    }, { status: 500 })
  }
}

// POST - Install Ola Hallengren
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

  try {
    const pool = await createConnectionFromServer(server)

    // Check if already installed
    const alreadyInstalled = await checkOlaHallengrenInstalled(pool)
    if (alreadyInstalled) {
      const version = await getOlaHallengrenVersion(pool)
      await pool.close()
      return NextResponse.json({
        success: true,
        message: "Ola Hallengren is already installed",
        version,
        alreadyInstalled: true
      })
    }

    // Install
    const result = await installOlaHallengren(pool)
    await pool.close()

    return NextResponse.json(result)
  } catch (error) {
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : "Installation failed"
    }, { status: 500 })
  }
}
