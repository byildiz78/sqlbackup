import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import {
  getServerInfo,
  getPerformanceMetrics,
  getActiveProcesses,
  getWaitStats,
  getDatabaseStatuses,
  getDiskIOStats,
  getBlockingChains
} from '@/lib/sql-health'
import {
  getTopQueries,
  getJobStatuses,
  getMemoryBreakdown,
  getConnectionSummary,
  generateAlerts
} from '@/lib/sql-health/extended'

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

    // Fetch all data in parallel
    const [
      serverInfo,
      performance,
      processes,
      waitStats,
      databases,
      diskIO,
      blockingChains,
      topQueries,
      jobs,
      memory,
      connections
    ] = await Promise.all([
      getServerInfo(targetServerId),
      getPerformanceMetrics(targetServerId),
      getActiveProcesses(targetServerId),
      getWaitStats(targetServerId),
      getDatabaseStatuses(targetServerId),
      getDiskIOStats(targetServerId),
      getBlockingChains(targetServerId),
      getTopQueries(targetServerId),
      getJobStatuses(targetServerId),
      getMemoryBreakdown(targetServerId),
      getConnectionSummary(targetServerId)
    ])

    if (!serverInfo) {
      return NextResponse.json(
        { success: false, error: 'Failed to connect to SQL Server' },
        { status: 500 }
      )
    }

    // Generate alerts based on collected data
    const alerts = generateAlerts(performance, databases, blockingChains)

    return NextResponse.json({
      success: true,
      data: {
        serverInfo,
        performance,
        processes,
        blockingChains,
        waitStats,
        databases,
        diskIO,
        topQueries,
        jobs,
        memory,
        connections,
        alerts,
        timestamp: new Date()
      }
    })
  } catch (error) {
    console.error('SQL Health API error:', error)
    return NextResponse.json(
      { success: false, error: 'Failed to fetch SQL health data' },
      { status: 500 }
    )
  }
}
