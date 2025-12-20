// SQL Health Module - Main Entry
import { createConnectionFromServer } from '../mssql'
import { prisma } from '../db'
import * as Types from './types'
import * as Queries from './queries'
import * as QueriesExt from './queries-extended'
import sql from 'mssql'

export * from './types'

// Get connection pool for a server
async function getPool(serverId: string): Promise<sql.ConnectionPool> {
  const server = await prisma.server.findUnique({
    where: { id: serverId }
  })
  if (!server) {
    throw new Error('Server not found')
  }
  return createConnectionFromServer(server)
}

// Get server information
export async function getServerInfo(serverId: string): Promise<Types.ServerInfo | null> {
  let pool: sql.ConnectionPool | null = null
  try {
    pool = await getPool(serverId)
    const result = await pool.request().query(Queries.SERVER_INFO_QUERY)
    const row = result.recordset[0]
    if (!row) return null

    const lastStart = new Date(row.lastStartTime)
    const now = new Date()
    const uptimeMs = now.getTime() - lastStart.getTime()

    return {
      serverName: row.serverName,
      instanceName: row.instanceName,
      version: row.version?.split('\n')[0] || '',
      edition: row.edition,
      productLevel: row.productLevel,
      collation: row.collation,
      isClustered: row.isClustered === 1,
      cpuCount: row.cpuCount,
      physicalMemoryMB: row.physicalMemoryMB,
      maxMemoryMB: row.maxMemoryMB,
      uptimeDays: Math.floor(uptimeMs / (1000 * 60 * 60 * 24)),
      uptimeHours: Math.floor((uptimeMs % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60)),
      uptimeMinutes: Math.floor((uptimeMs % (1000 * 60 * 60)) / (1000 * 60)),
      lastStartTime: lastStart
    }
  } catch (error) {
    console.error('[SQL Health] getServerInfo error:', error)
    return null
  }
}

// Get performance metrics
export async function getPerformanceMetrics(serverId: string): Promise<Types.PerformanceMetrics | null> {
  try {
    const pool = await getPool(serverId)
    const result = await pool.request().query(Queries.PERFORMANCE_METRICS_QUERY)
    const row = result.recordset[0]
    if (!row) return null

    return {
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
  } catch (error) {
    console.error('[SQL Health] getPerformanceMetrics error:', error)
    return null
  }
}

// Get active processes
export async function getActiveProcesses(serverId: string): Promise<Types.ActiveProcess[]> {
  try {
    const pool = await getPool(serverId)
    const result = await pool.request().query(Queries.ACTIVE_PROCESSES_QUERY)
    return result.recordset.map(row => ({
      spid: row.spid,
      status: row.status,
      loginName: row.loginName,
      hostName: row.hostName,
      databaseName: row.databaseName,
      command: row.command,
      cpuTime: row.cpuTime,
      logicalReads: row.logicalReads,
      writes: row.writes,
      elapsedTimeMs: row.elapsedTimeMs,
      waitType: row.waitType,
      waitTimeMs: row.waitTimeMs,
      blockingSpid: row.blockingSpid,
      queryText: row.queryText?.substring(0, 500) || null,
      programName: row.programName,
      isSystem: row.isSystem === 1
    }))
  } catch (error) {
    console.error('[SQL Health] getActiveProcesses error:', error)
    return []
  }
}

// Get wait statistics
export async function getWaitStats(serverId: string): Promise<Types.WaitStatistic[]> {
  try {
    const pool = await getPool(serverId)
    const result = await pool.request().query(Queries.WAIT_STATS_QUERY)
    return result.recordset.map(row => ({
      waitType: row.waitType,
      category: row.category,
      waitTimeMs: row.waitTimeMs,
      waitCount: row.waitCount,
      avgWaitMs: row.avgWaitMs,
      percentTotal: row.percentTotal
    }))
  } catch (error) {
    console.error('[SQL Health] getWaitStats error:', error)
    return []
  }
}

// Get database statuses
export async function getDatabaseStatuses(serverId: string): Promise<Types.DatabaseStatus[]> {
  try {
    const pool = await getPool(serverId)
    const result = await pool.request().query(Queries.DATABASE_STATUS_QUERY)
    return result.recordset.map(row => ({
      name: row.name,
      databaseId: row.databaseId,
      status: row.status,
      recoveryModel: row.recoveryModel,
      dataSizeMB: row.dataSizeMB || 0,
      logSizeMB: row.logSizeMB || 0,
      logUsedPercent: row.logUsedPercent || 0,
      lastFullBackup: row.lastFullBackup,
      lastDiffBackup: row.lastDiffBackup,
      lastLogBackup: row.lastLogBackup,
      compatibilityLevel: row.compatibilityLevel
    }))
  } catch (error) {
    console.error('[SQL Health] getDatabaseStatuses error:', error)
    return []
  }
}

// Get disk I/O stats
export async function getDiskIOStats(serverId: string): Promise<Types.DiskIOStats[]> {
  try {
    const pool = await getPool(serverId)
    const result = await pool.request().query(Queries.DISK_IO_QUERY)
    return result.recordset.map(row => ({
      databaseName: row.databaseName,
      fileName: row.fileName,
      fileType: row.fileType,
      driveLetter: row.driveLetter,
      readLatencyMs: row.readLatencyMs,
      writeLatencyMs: row.writeLatencyMs,
      pendingIO: row.pendingIO,
      readMBps: row.readMBps,
      writeMBps: row.writeMBps
    }))
  } catch (error) {
    console.error('[SQL Health] getDiskIOStats error:', error)
    return []
  }
}

// Get blocking chains
export async function getBlockingChains(serverId: string): Promise<Types.BlockingChain[]> {
  try {
    const pool = await getPool(serverId)
    const result = await pool.request().query(Queries.BLOCKING_CHAINS_QUERY)
    return result.recordset.map(row => ({
      spid: row.spid,
      loginName: row.loginName,
      databaseName: row.databaseName,
      queryText: row.queryText?.substring(0, 500) || null,
      waitTimeMs: row.waitTimeMs,
      blockedBy: row.blockedBy,
      blockingCount: row.blockingCount,
      children: []
    }))
  } catch (error) {
    console.error('[SQL Health] getBlockingChains error:', error)
    return []
  }
}

// Kill a process
export async function killProcess(serverId: string, spid: number): Promise<boolean> {
  try {
    const pool = await getPool(serverId)
    await pool.request().query(QueriesExt.KILL_PROCESS_QUERY(spid))
    return true
  } catch (error) {
    console.error('[SQL Health] killProcess error:', error)
    return false
  }
}
