// SQL Health Extended Functions
import { createConnectionFromServer } from '@/lib/mssql'
import { prisma } from '@/lib/db'
import * as Types from './types'
import * as QueriesExt from './queries-extended'
import sql from 'mssql'

// Get extended health data (jobs, memory, connections, top queries)
export async function getExtendedHealthData(serverId: string): Promise<{
  topQueries: Types.TopQuery[]
  jobs: Types.JobStatus[]
  memory: Types.MemoryBreakdown | null
  connections: Types.ConnectionSummary | null
}> {
  const server = await prisma.sqlServer.findUnique({
    where: { id: serverId }
  })

  if (!server) {
    throw new Error('Server not found')
  }

  let pool: sql.ConnectionPool | null = null

  try {
    pool = await createConnectionFromServer(server)

    const [
      topQueriesResult,
      jobsResult,
      memoryResult,
      connSummaryResult,
      connByAppResult,
      connByLoginResult,
      connByDbResult
    ] = await Promise.all([
      pool.request().query(QueriesExt.TOP_QUERIES_QUERY).catch(() => ({ recordset: [] })),
      pool.request().query(QueriesExt.JOB_STATUS_QUERY).catch(() => ({ recordset: [] })),
      pool.request().query(QueriesExt.MEMORY_BREAKDOWN_QUERY).catch(() => ({ recordset: [] })),
      pool.request().query(QueriesExt.CONNECTION_SUMMARY_QUERY).catch(() => ({ recordset: [] })),
      pool.request().query(QueriesExt.CONNECTIONS_BY_APP_QUERY).catch(() => ({ recordset: [] })),
      pool.request().query(QueriesExt.CONNECTIONS_BY_LOGIN_QUERY).catch(() => ({ recordset: [] })),
      pool.request().query(QueriesExt.CONNECTIONS_BY_DATABASE_QUERY).catch(() => ({ recordset: [] }))
    ])

    // Parse top queries
    const topQueries: Types.TopQuery[] = topQueriesResult.recordset.map(row => ({
      queryHash: row.queryHash || '',
      queryText: row.queryText?.substring(0, 500) || '',
      executionCount: row.executionCount || 0,
      avgCpuMs: row.avgCpuMs || 0,
      avgDurationMs: row.avgDurationMs || 0,
      avgLogicalReads: row.avgLogicalReads || 0,
      avgWrites: row.avgWrites || 0,
      lastExecutionTime: row.lastExecutionTime
    }))

    // Parse jobs
    const jobs: Types.JobStatus[] = jobsResult.recordset.map(row => ({
      jobId: row.jobId || '',
      jobName: row.jobName || '',
      enabled: row.enabled === 1,
      lastRunDate: row.lastRunDate,
      lastRunStatus: row.lastRunStatus || 'Never Run',
      lastRunDurationSeconds: row.lastRunDurationSeconds || 0,
      nextRunDate: row.nextRunDate,
      description: row.description || ''
    }))

    // Parse memory
    let memory: Types.MemoryBreakdown | null = null
    if (memoryResult.recordset[0]) {
      const row = memoryResult.recordset[0]
      memory = {
        bufferPoolMB: row.bufferPoolMB || 0,
        planCacheMB: row.planCacheMB || 0,
        stolenMemoryMB: row.stolenMemoryMB || 0,
        freeMemoryMB: row.freeMemoryMB || 0,
        totalServerMemoryMB: row.totalServerMemoryMB || 0,
        targetServerMemoryMB: row.targetServerMemoryMB || 0
      }
    }

    // Parse connections
    let connections: Types.ConnectionSummary | null = null
    if (connSummaryResult.recordset[0]) {
      const summary = connSummaryResult.recordset[0]
      connections = {
        totalConnections: summary.totalConnections || 0,
        activeQueries: summary.activeQueries || 0,
        sleepingConnections: summary.sleepingConnections || 0,
        byApplication: connByAppResult.recordset.map(r => ({ name: r.name || 'Unknown', count: r.count || 0 })),
        byLogin: connByLoginResult.recordset.map(r => ({ name: r.name || '', count: r.count || 0 })),
        byDatabase: connByDbResult.recordset.map(r => ({ name: r.name || '', count: r.count || 0 }))
      }
    }

    return { topQueries, jobs, memory, connections }
  } finally {
    if (pool) {
      try { await pool.close() } catch {}
    }
  }
}

// Generate alerts based on health data
export function generateAlerts(
  performance: Types.PerformanceMetrics | null,
  databases: Types.DatabaseStatus[],
  blockingChains: Types.BlockingChain[]
): Types.Alert[] {
  const alerts: Types.Alert[] = []

  if (performance) {
    if (performance.cpuPercent > 90) {
      alerts.push({
        severity: 'critical',
        category: 'CPU',
        message: `CPU usage is critically high: ${performance.cpuPercent}%`
      })
    } else if (performance.cpuPercent > 80) {
      alerts.push({
        severity: 'warning',
        category: 'CPU',
        message: `CPU usage is high: ${performance.cpuPercent}%`
      })
    }

    if (performance.blockedProcesses > 0) {
      alerts.push({
        severity: 'critical',
        category: 'Blocking',
        message: `${performance.blockedProcesses} blocked process(es) detected`
      })
    }

    if (performance.pageLifeExpectancy > 0 && performance.pageLifeExpectancy < 300) {
      alerts.push({
        severity: 'warning',
        category: 'Memory',
        message: `Low Page Life Expectancy: ${performance.pageLifeExpectancy}s`
      })
    }
  }

  for (const db of databases) {
    const logPercent = Number(db.logUsedPercent) || 0
    if (logPercent > 90) {
      alerts.push({
        severity: 'critical',
        category: 'Database',
        message: `${db.name}: Log file is ${logPercent.toFixed(0)}% full`
      })
    } else if (logPercent > 80) {
      alerts.push({
        severity: 'warning',
        category: 'Database',
        message: `${db.name}: Log file is ${logPercent.toFixed(0)}% full`
      })
    }

    if (db.status !== 'ONLINE') {
      alerts.push({
        severity: 'critical',
        category: 'Database',
        message: `${db.name}: Database is ${db.status}`
      })
    }
  }

  return alerts.sort((a, b) => {
    const order = { critical: 0, warning: 1, info: 2 }
    return order[a.severity] - order[b.severity]
  })
}
