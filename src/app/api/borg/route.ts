import { NextResponse } from 'next/server'
import {
  getStatus,
  checkBorgInstalled,
  checkSshpassInstalled,
  testConnection,
  formatBytes,
  getStorageQuota
} from '@/lib/borg-backup'

// GET: Get borg status and repository info
export async function GET() {
  try {
    // Check prerequisites
    const borgInstalled = await checkBorgInstalled()
    const sshpassInstalled = await checkSshpassInstalled()

    if (!borgInstalled || !sshpassInstalled) {
      return NextResponse.json({
        ready: false,
        borgInstalled,
        sshpassInstalled,
        message: !borgInstalled
          ? 'BorgBackup is not installed. Run: apt install borgbackup'
          : 'sshpass is not installed. Run: apt install sshpass',
        status: null
      })
    }

    // Get full status
    const status = await getStatus()

    // Get storage quota from Hetzner StorageBox
    let storageQuota = null
    if (status.connected) {
      const quota = await getStorageQuota()
      if (quota) {
        storageQuota = {
          ...quota,
          totalFormatted: formatBytes(quota.totalBytes),
          usedFormatted: formatBytes(quota.usedBytes),
          freeFormatted: formatBytes(quota.freeBytes)
        }
      }
    }

    return NextResponse.json({
      ready: true,
      borgInstalled,
      sshpassInstalled,
      storageQuota,
      status: {
        ...status,
        repoInfo: status.repoInfo ? {
          ...status.repoInfo,
          totalSizeFormatted: formatBytes(status.repoInfo.totalSize),
          uniqueSizeFormatted: formatBytes(status.repoInfo.uniqueSize),
          totalCsizeFormatted: formatBytes(status.repoInfo.totalCsize),
          uniqueCsizeFormatted: formatBytes(status.repoInfo.uniqueCsize),
        } : null
      }
    })
  } catch (error) {
    console.error('Borg status error:', error)
    return NextResponse.json(
      { error: 'Failed to get borg status' },
      { status: 500 }
    )
  }
}
