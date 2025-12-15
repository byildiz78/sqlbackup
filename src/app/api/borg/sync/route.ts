import { NextResponse } from 'next/server'
import { syncBackupFolder, createArchive, getRepoUrl } from '@/lib/borg-backup'
import { prisma } from '@/lib/db'

// POST: Sync backup folder to Hetzner
export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}))
    let backupPath = body.backupPath

    // If no path provided, get default backup path from settings or use default
    if (!backupPath) {
      try {
        const setting = await prisma.setting.findFirst({
          where: { key: 'default_backup_path' }
        })
        backupPath = setting?.value || '/var/opt/mssql/backup'
      } catch {
        backupPath = '/var/opt/mssql/backup'
      }
    }

    console.log(`[Borg API] Starting sync for path: ${backupPath}`)

    const result = await syncBackupFolder(backupPath)

    if (result.success) {
      return NextResponse.json({
        success: true,
        message: 'Backup synced successfully to Hetzner StorageBox',
        repoUrl: getRepoUrl()
      })
    } else {
      return NextResponse.json(
        { success: false, error: result.error },
        { status: 400 }
      )
    }
  } catch (error) {
    console.error('Borg sync error:', error)
    return NextResponse.json(
      { success: false, error: 'Sync failed' },
      { status: 500 }
    )
  }
}
