// SQL Health Extended Functions
import { getPool } from '../mssql'
import * as Types from './types'
import * as QueriesExt from './queries-extended'

// Get top queries
export async function getTopQueries(serverId: string): Promise<Types.TopQuery[]> {
  try {
    const pool = await getPool(serverId)
    const result = await pool.request().query(QueriesExt.TOP_QUERIES_QUERY)
    return result.recordset.map(row => ({
      queryHash: row.queryHash,
      queryText: row.queryText?.substring(0, 500) || '',
      executionCount: row.executionCount,
      avgCpuMs: row.avgCpuMs,
      avgDurationMs: row.avgDurationMs,
      avgLogicalReads: row.avgLogicalReads,
      avgWrites: row.avgWrites,
      lastExecutionTime: row.lastExecutionTime
    }))
  } catch (error) {
    console.error('[SQL Health] getTopQueries error:', error)
    return []
  }
}

// Get job statuses
export async function getJobStatuses(serverId: string): Promise<Types.JobStatus[]> {
  try {
    const pool = await getPool(serverId)
    const result = await pool.request().query(QueriesExt.JOB_STATUS_QUERY)
    return result.recordset.map(row => ({
      jobId: row.jobId,
      jobName: row.jobName,
      enabled: row.enabled === 1,
      lastRunDate: row.lastRunDate,
      lastRunStatus: row.lastRunStatus || 'Never Run',
      lastRunDurationSeconds: row.lastRunDurationSeconds,
      nextRunDate: row.nextRunDate,
      description: row.description
    }))
  } catch (error) {
    console.error('[SQL Health] getJobStatuses error:', error)
    return []
  }
}

// Get memory breakdown
export async function getMemoryBreakdown(serverId: string): Promise<Types.MemoryBreakdown | null> {
  try {
    const pool = await getPool(serverId)
    const result = await pool.request().query(QueriesExt.MEMORY_BREAKDOWN_QUERY)
    const row = result.recordset[0]
    if (!row) return null

    return {
      bufferPoolMB: row.bufferPoolMB || 0,
      planCacheMB: row.planCacheMB || 0,
      stolenMemoryMB: row.stolenMemoryMB || 0,
      freeMemoryMB: row.freeMemoryMB || 0,
      totalServerMemoryMB: row.totalServerMemoryMB || 0,
      targetServerMemoryMB: row.targetServerMemoryMB || 0
    }
  } catch (error) {
    console.error('[SQL Health] getMemoryBreakdown error:', error)
    return null
  }
}

// Get connection summary
export async function getConnectionSummary(serverId: string): Promise<Types.ConnectionSummary | null> {
  try {
    const pool = await getPool(serverId)

    const [summaryResult, byAppResult, byLoginResult, byDbResult] = await Promise.all([
      pool.request().query(QueriesExt.CONNECTION_SUMMARY_QUERY),
      pool.request().query(QueriesExt.CONNECTIONS_BY_APP_QUERY),
      pool.request().query(QueriesExt.CONNECTIONS_BY_LOGIN_QUERY),
      pool.request().query(QueriesExt.CONNECTIONS_BY_DATABASE_QUERY)
    ])

    const summary = summaryResult.recordset[0]
    if (!summary) return null

    return {
      totalConnections: summary.totalConnections,
      activeQueries: summary.activeQueries,
      sleepingConnections: summary.sleepingConnections,
      byApplication: byAppResult.recordset.map(r => ({ name: r.name, count: r.count })),
      byLogin: byLoginResult.recordset.map(r => ({ name: r.name, count: r.count })),
      byDatabase: byDbResult.recordset.map(r => ({ name: r.name, count: r.count }))
    }
  } catch (error) {
    console.error('[SQL Health] getConnectionSummary error:', error)
    return null
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
    // CPU Alert
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

    // Blocked Processes Alert
    if (performance.blockedProcesses > 0) {
      alerts.push({
        severity: 'critical',
        category: 'Blocking',
        message: `${performance.blockedProcesses} blocked process(es) detected`,
        details: 'Check blocking tree for details'
      })
    }

    // Page Life Expectancy Alert
    if (performance.pageLifeExpectancy < 300) {
      alerts.push({
        severity: 'warning',
        category: 'Memory',
        message: `Low Page Life Expectancy: ${performance.pageLifeExpectancy}s`,
        details: 'Memory pressure detected'
      })
    }
  }

  // Database Alerts
  for (const db of databases) {
    // Log file usage
    if (db.logUsedPercent > 90) {
      alerts.push({
        severity: 'critical',
        category: 'Database',
        message: `${db.name}: Log file is ${db.logUsedPercent}% full`
      })
    } else if (db.logUsedPercent > 80) {
      alerts.push({
        severity: 'warning',
        category: 'Database',
        message: `${db.name}: Log file is ${db.logUsedPercent}% full`
      })
    }

    // Backup alerts
    if (db.recoveryModel !== 'SIMPLE' && db.lastFullBackup) {
      const hoursSinceBackup = (Date.now() - new Date(db.lastFullBackup).getTime()) / (1000 * 60 * 60)
      if (hoursSinceBackup > 48) {
        alerts.push({
          severity: 'warning',
          category: 'Backup',
          message: `${db.name}: No full backup for ${Math.floor(hoursSinceBackup / 24)} days`
        })
      }
    }

    // Database status
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
