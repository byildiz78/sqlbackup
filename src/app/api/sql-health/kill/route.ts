import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { killProcess } from '@/lib/sql-health'

export async function POST(request: NextRequest) {
  try {
    const { serverId, spid } = await request.json()

    if (!spid || typeof spid !== 'number') {
      return NextResponse.json(
        { success: false, error: 'Invalid SPID' },
        { status: 400 }
      )
    }

    // System processes cannot be killed
    if (spid <= 50) {
      return NextResponse.json(
        { success: false, error: 'Cannot kill system processes' },
        { status: 400 }
      )
    }

    // Get server ID if not provided
    let targetServerId = serverId
    if (!targetServerId) {
      const firstServer = await prisma.server.findFirst({
        orderBy: { createdAt: 'asc' }
      })
      if (!firstServer) {
        return NextResponse.json(
          { success: false, error: 'No SQL Server configured' },
          { status: 404 }
        )
      }
      targetServerId = firstServer.id
    }

    const success = await killProcess(targetServerId, spid)

    if (success) {
      return NextResponse.json({
        success: true,
        message: `Process ${spid} has been killed`
      })
    } else {
      return NextResponse.json(
        { success: false, error: 'Failed to kill process' },
        { status: 500 }
      )
    }
  } catch (error) {
    console.error('Kill process API error:', error)
    return NextResponse.json(
      { success: false, error: 'Failed to kill process' },
      { status: 500 }
    )
  }
}
