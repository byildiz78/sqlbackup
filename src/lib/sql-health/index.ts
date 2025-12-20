// SQL Health Module - Main Entry
import { createConnectionFromServer } from '@/lib/mssql'
import { prisma } from '@/lib/db'
import * as Types from './types'
import * as Queries from './queries'
import sql from 'mssql'

export * from './types'

// Get all health data in a single connection
export async function getAllHealthData(serverId: string): Promise<{
  serverInfo: Types.ServerInfo | null
  performance: Types.PerformanceMetrics | null
  processes: Types.ActiveProcess[]
  waitStats: Types.WaitStatistic[]
  databases: Types.DatabaseStatus[]
  diskIO: Types.DiskIOStats[]
  blockingChains: Types.BlockingChain[]
}> {
  const server = await prisma.server.findUnique({
    where: { id: serverId }
  })

  if (!server) {
    throw new Error('Server not found')
  }

  let pool: sql.ConnectionPool | null = null

  try {
    pool = await createConnectionFromServer(server)

    // Get all data using the same connection
    const [
      serverInfoResult,
      performanceResult,
      processesResult,
      waitStatsResult,
      databasesResult,
      diskIOResult,
      blockingResult
    ] = await Promise.all([
      pool.request().query(Queries.SERVER_INFO_QUERY).catch(() => ({ recordset: [] })),
      pool.request().query(Queries.PERFORMANCE_METRICS_QUERY).catch(() => ({ recordset: [] })),
      pool.request().query(Queries.ACTIVE_PROCESSES_QUERY).catch(() => ({ recordset: [] })),
      pool.request().query(Queries.WAIT_STATS_QUERY).catch(() => ({ recordset: [] })),
      pool.request().query(Queries.DATABASE_STATUS_QUERY).catch(() => ({ recordset: [] })),
      pool.request().query(Queries.DISK_IO_QUERY).catch(() => ({ recordset: [] })),
      pool.request().query(Queries.BLOCKING_CHAINS_QUERY).catch(() => ({ recordset: [] }))
    ])

    // Parse server info
    let serverInfo: Types.ServerInfo | null = null
    if (serverInfoResult.recordset[0]) {
      const row = serverInfoResult.recordset[0]
      const lastStart = new Date(row.lastStartTime)
      const uptimeMs = Date.now() - lastStart.getTime()

      serverInfo = {
        serverName: row.serverName || '',
        instanceName: row.instanceName || '',
        version: row.version?.split('\n')[0] || '',
        edition: row.edition || '',
        productLevel: row.productLevel || '',
        collation: row.collation || '',
        isClustered: row.isClustered === 1,
        cpuCount: row.cpuCount || 0,
        physicalMemoryMB: row.physicalMemoryMB || 0,
        maxMemoryMB: row.maxMemoryMB || 0,
        uptimeDays: Math.floor(uptimeMs / (1000 * 60 * 60 * 24)),
        uptimeHours: Math.floor((uptimeMs % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60)),
        uptimeMinutes: Math.floor((uptimeMs % (1000 * 60 * 60)) / (1000 * 60)),
        lastStartTime: lastStart
      }
    }

    // Parse performance metrics
    let performance: Types.PerformanceMetrics | null = null
    if (performanceResult.recordset[0]) {
      const row = performanceResult.recordset[0]
      performance = {
        cpuPercent: row.cpuPercent || 0,
        memoryUsedMB: row.memoryUsedMB || 0,
        memoryTargetMB: row.memoryTargetMB || 0,
        bufferCacheHitRatio: row.bufferCacheHitRatio || 0,
        pageLifeExpectancy: row.pageLifeExpectancy || 0,
        batchRequestsPerSec: row.batchRequestsPerSec || 0,
        transactionsPerSec: row.transactionsPerSec || 0,
        deadlockCount: row.deadlockCount || 0,
        totalConnections: row.totalConnections || 0,
        activeConnections: row.activeConnections || 0,
        blockedProcesses: row.blockedProcesses || 0
      }
    }

    // Parse processes
    const processes: Types.ActiveProcess[] = processesResult.recordset.map(row => ({
      spid: row.spid,
      status: row.status || '',
      loginName: row.loginName || '',
      hostName: row.hostName || '',
      databaseName: row.databaseName || '',
      command: row.command || '',
      cpuTime: row.cpuTime || 0,
      logicalReads: row.logicalReads || 0,
      writes: row.writes || 0,
      elapsedTimeMs: row.elapsedTimeMs || 0,
      waitType: row.waitType,
      waitTimeMs: row.waitTimeMs || 0,
      blockingSpid: row.blockingSpid,
      queryText: row.queryText?.substring(0, 500) || null,
      programName: row.programName || '',
      isSystem: row.isSystem === 1
    }))

    // Parse wait stats
    const waitStats: Types.WaitStatistic[] = waitStatsResult.recordset.map(row => ({
      waitType: row.waitType,
      category: row.category || 'Other',
      waitTimeMs: row.waitTimeMs || 0,
      waitCount: row.waitCount || 0,
      avgWaitMs: row.avgWaitMs || 0,
      percentTotal: row.percentTotal || 0
    }))

    // Parse databases
    const databases: Types.DatabaseStatus[] = databasesResult.recordset.map(row => ({
      name: row.name,
      databaseId: row.databaseId,
      status: row.status || 'UNKNOWN',
      recoveryModel: row.recoveryModel || '',
      dataSizeMB: row.dataSizeMB || 0,
      logSizeMB: row.logSizeMB || 0,
      logUsedPercent: row.logUsedPercent || 0,
      lastFullBackup: row.lastFullBackup,
      lastDiffBackup: row.lastDiffBackup,
      lastLogBackup: row.lastLogBackup,
      compatibilityLevel: row.compatibilityLevel || 0
    }))

    // Parse disk I/O
    const diskIO: Types.DiskIOStats[] = diskIOResult.recordset.map(row => ({
      databaseName: row.databaseName || '',
      fileName: row.fileName || '',
      fileType: row.fileType || '',
      driveLetter: row.driveLetter || '',
      readLatencyMs: row.readLatencyMs || 0,
      writeLatencyMs: row.writeLatencyMs || 0,
      pendingIO: row.pendingIO || 0,
      readMBps: row.readMBps || 0,
      writeMBps: row.writeMBps || 0
    }))

    // Parse blocking chains
    const blockingChains: Types.BlockingChain[] = blockingResult.recordset.map(row => ({
      spid: row.spid,
      loginName: row.loginName || '',
      databaseName: row.databaseName || '',
      queryText: row.queryText?.substring(0, 500) || null,
      waitTimeMs: row.waitTimeMs || 0,
      blockedBy: row.blockedBy,
      blockingCount: row.blockingCount || 0,
      children: []
    }))

    return {
      serverInfo,
      performance,
      processes,
      waitStats,
      databases,
      diskIO,
      blockingChains
    }
  } finally {
    if (pool) {
      try {
        await pool.close()
      } catch {
        // Ignore close errors
      }
    }
  }
}

// Kill a process
export async function killProcess(serverId: string, spid: number): Promise<boolean> {
  const server = await prisma.server.findUnique({
    where: { id: serverId }
  })

  if (!server) return false

  let pool: sql.ConnectionPool | null = null
  try {
    pool = await createConnectionFromServer(server)
    await pool.request().query(`KILL ${spid}`)
    return true
  } catch (error) {
    console.error('[SQL Health] killProcess error:', error)
    return false
  } finally {
    if (pool) {
      try { await pool.close() } catch {}
    }
  }
}
