import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { getAllHealthData } from '@/lib/sql-health'
import { getExtendedHealthData, generateAlerts } from '@/lib/sql-health/extended'

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const serverId = searchParams.get('serverId')

    // If no serverId, get the first server
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

    // Fetch core health data
    const coreData = await getAllHealthData(targetServerId)

    if (!coreData.serverInfo) {
      return NextResponse.json(
        { success: false, error: 'Failed to connect to SQL Server' },
        { status: 500 }
      )
    }

    // Fetch extended data (separate connection)
    let extendedData = {
      topQueries: [] as any[],
      jobs: [] as any[],
      memory: null as any,
      connections: null as any
    }

    try {
      extendedData = await getExtendedHealthData(targetServerId)
    } catch (err) {
      console.error('Failed to get extended health data:', err)
      // Continue with core data only
    }

    // Generate alerts based on collected data
    const alerts = generateAlerts(
      coreData.performance,
      coreData.databases,
      coreData.blockingChains
    )

    return NextResponse.json({
      success: true,
      data: {
        serverInfo: coreData.serverInfo,
        performance: coreData.performance,
        processes: coreData.processes,
        blockingChains: coreData.blockingChains,
        waitStats: coreData.waitStats,
        databases: coreData.databases,
        diskIO: coreData.diskIO,
        topQueries: extendedData.topQueries,
        jobs: extendedData.jobs,
        memory: extendedData.memory,
        connections: extendedData.connections,
        alerts,
        timestamp: new Date()
      }
    })
  } catch (error) {
    console.error('SQL Health API error:', error)
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Failed to fetch SQL health data' },
      { status: 500 }
    )
  }
}
