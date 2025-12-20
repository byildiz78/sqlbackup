'use client'

import { useState, useEffect, useCallback } from 'react'
import { RefreshCw, Activity, Cpu, MemoryStick, Users, AlertTriangle, Timer } from 'lucide-react'
import {
  MetricCard,
  ServerInfoCard,
  AlertsPanel,
  ProcessesTable,
  WaitStatsChart,
  DatabasesTable,
  MemoryChart,
  ConnectionsChart
} from '@/components/sql-health'
import type { SqlHealthData } from '@/lib/sql-health/types'

type TabType = 'overview' | 'processes' | 'databases' | 'performance'

export default function SqlHealthPage() {
  const [data, setData] = useState<SqlHealthData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [activeTab, setActiveTab] = useState<TabType>('overview')
  const [autoRefresh, setAutoRefresh] = useState(5)
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null)

  const fetchData = useCallback(async () => {
    try {
      const res = await fetch('/api/sql-health')
      const json = await res.json()

      if (json.success) {
        setData(json.data)
        setError(null)
        setLastUpdate(new Date())
      } else {
        setError(json.error || 'Failed to fetch data')
      }
    } catch (err) {
      setError('Failed to connect to server')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  useEffect(() => {
    if (autoRefresh === 0) return
    const interval = setInterval(fetchData, autoRefresh * 1000)
    return () => clearInterval(interval)
  }, [autoRefresh, fetchData])

  const handleKillProcess = async (spid: number) => {
    try {
      const res = await fetch('/api/sql-health/kill', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ spid })
      })
      const json = await res.json()
      if (json.success) {
        fetchData()
      } else {
        alert(json.error || 'Failed to kill process')
      }
    } catch {
      alert('Failed to kill process')
    }
  }

  const tabs = [
    { id: 'overview', label: 'Overview' },
    { id: 'processes', label: 'Processes' },
    { id: 'databases', label: 'Databases' },
    { id: 'performance', label: 'Performance' }
  ]

  if (loading) {
    return (
      <div className="flex items-center justify-center h-96">
        <RefreshCw className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center h-96 gap-4">
        <AlertTriangle className="h-12 w-12 text-red-500" />
        <p className="text-lg">{error}</p>
        <button
          onClick={fetchData}
          className="px-4 py-2 bg-primary text-primary-foreground rounded-lg"
        >
          Retry
        </button>
      </div>
    )
  }

  if (!data) return null

  const perf = data.performance

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Activity className="h-6 w-6" />
            SQL Server Health
          </h1>
          {lastUpdate && (
            <p className="text-sm text-muted-foreground">
              Last updated: {lastUpdate.toLocaleTimeString()}
            </p>
          )}
        </div>
        <div className="flex items-center gap-4">
          <select
            value={autoRefresh}
            onChange={(e) => setAutoRefresh(Number(e.target.value))}
            className="bg-background border rounded px-3 py-2"
          >
            <option value={0}>Manual</option>
            <option value={5}>5 seconds</option>
            <option value={10}>10 seconds</option>
            <option value={30}>30 seconds</option>
          </select>
          <button
            onClick={fetchData}
            className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-lg hover:opacity-90"
          >
            <RefreshCw className="h-4 w-4" />
            Refresh
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="border-b">
        <div className="flex gap-4">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as TabType)}
              className={`pb-2 px-1 border-b-2 transition-colors ${
                activeTab === tab.id
                  ? 'border-primary text-foreground'
                  : 'border-transparent text-muted-foreground hover:text-foreground'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* Overview Tab */}
      {activeTab === 'overview' && (
        <div className="space-y-6">
          {/* Metric Cards */}
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
            <MetricCard
              title="CPU"
              value={`${perf?.cpuPercent || 0}%`}
              icon={<Cpu className="h-4 w-4" />}
              status={(perf?.cpuPercent ?? 0) > 90 ? 'critical' : (perf?.cpuPercent ?? 0) > 80 ? 'warning' : 'normal'}
              progress={perf?.cpuPercent ?? 0}
            />
            <MetricCard
              title="Memory"
              value={`${((Number(perf?.memoryUsedMB) || 0) / 1024).toFixed(1)} GB`}
              icon={<MemoryStick className="h-4 w-4" />}
              subtitle={`of ${((Number(perf?.memoryTargetMB) || 0) / 1024).toFixed(1)} GB`}
              progress={perf?.memoryTargetMB ? (Number(perf.memoryUsedMB) / Number(perf.memoryTargetMB)) * 100 : 0}
            />
            <MetricCard
              title="Sessions"
              value={perf?.totalConnections || 0}
              icon={<Users className="h-4 w-4" />}
              subtitle={`${perf?.activeConnections || 0} active`}
            />
            <MetricCard
              title="Blocked"
              value={perf?.blockedProcesses || 0}
              icon={<AlertTriangle className="h-4 w-4" />}
              status={(perf?.blockedProcesses ?? 0) > 0 ? 'critical' : 'normal'}
            />
            <MetricCard
              title="Batch/sec"
              value={(Number(perf?.batchRequestsPerSec) || 0).toLocaleString()}
            />
            <MetricCard
              title="PLE"
              value={perf?.pageLifeExpectancy || 0}
              icon={<Timer className="h-4 w-4" />}
              subtitle="seconds"
              status={(perf?.pageLifeExpectancy ?? 0) < 300 ? 'warning' : 'normal'}
            />
          </div>

          {/* Alerts */}
          <AlertsPanel alerts={data.alerts} />

          {/* Two Column Layout */}
          <div className="grid lg:grid-cols-2 gap-6">
            {data.serverInfo && <ServerInfoCard info={data.serverInfo} />}
            {data.memory && <MemoryChart memory={data.memory} />}
          </div>

          <div className="grid lg:grid-cols-2 gap-6">
            <WaitStatsChart waitStats={data.waitStats} />
            {data.connections && <ConnectionsChart connections={data.connections} />}
          </div>
        </div>
      )}

      {/* Processes Tab */}
      {activeTab === 'processes' && (
        <ProcessesTable processes={data.processes} onKillProcess={handleKillProcess} />
      )}

      {/* Databases Tab */}
      {activeTab === 'databases' && (
        <DatabasesTable databases={data.databases} />
      )}

      {/* Performance Tab */}
      {activeTab === 'performance' && (
        <div className="space-y-6">
          <div className="grid lg:grid-cols-2 gap-6">
            {data.memory && <MemoryChart memory={data.memory} />}
            <WaitStatsChart waitStats={data.waitStats} />
          </div>

          {/* Disk I/O */}
          <div className="space-y-3">
            <h3 className="font-semibold">Disk I/O Performance</h3>
            <div className="rounded-lg border overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-muted/50">
                  <tr>
                    <th className="text-left p-2">Database</th>
                    <th className="text-left p-2">File</th>
                    <th className="text-left p-2">Type</th>
                    <th className="text-right p-2">Read Latency</th>
                    <th className="text-right p-2">Write Latency</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {data.diskIO.slice(0, 10).map((io, i) => (
                    <tr key={i} className="hover:bg-muted/50">
                      <td className="p-2">{io.databaseName}</td>
                      <td className="p-2 font-mono text-xs">{io.fileName}</td>
                      <td className="p-2">{io.fileType}</td>
                      <td className={`p-2 text-right font-mono ${
                        (Number(io.readLatencyMs) || 0) > 20 ? 'text-red-500' :
                        (Number(io.readLatencyMs) || 0) > 10 ? 'text-yellow-500' : ''
                      }`}>
                        {(Number(io.readLatencyMs) || 0).toFixed(1)} ms
                      </td>
                      <td className={`p-2 text-right font-mono ${
                        (Number(io.writeLatencyMs) || 0) > 20 ? 'text-red-500' :
                        (Number(io.writeLatencyMs) || 0) > 10 ? 'text-yellow-500' : ''
                      }`}>
                        {(Number(io.writeLatencyMs) || 0).toFixed(1)} ms
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
