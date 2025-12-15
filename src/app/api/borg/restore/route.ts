import { NextResponse } from 'next/server'
import { listArchiveContents, extractArchive, getArchiveInfo, listArchives } from '@/lib/borg-backup'

// GET: List archives or get archive contents
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const archiveName = searchParams.get('archive')
  const action = searchParams.get('action') || 'list'

  try {
    // If no archive specified, list all archives
    if (!archiveName) {
      const archives = await listArchives()
      return NextResponse.json({
        success: true,
        archives: archives.reverse() // Most recent first
      })
    }

    // Get archive info
    if (action === 'info') {
      const result = await getArchiveInfo(archiveName)
      return NextResponse.json(result)
    }

    // List archive contents
    if (action === 'contents') {
      const result = await listArchiveContents(archiveName)
      return NextResponse.json(result)
    }

    return NextResponse.json({ success: false, error: 'Invalid action' }, { status: 400 })
  } catch (error) {
    console.error('Borg restore GET error:', error)
    return NextResponse.json(
      { success: false, error: 'Operation failed' },
      { status: 500 }
    )
  }
}

// POST: Extract/restore an archive
export async function POST(request: Request) {
  try {
    const body = await request.json()
    const { archiveName, destinationPath, specificPaths } = body

    if (!archiveName) {
      return NextResponse.json(
        { success: false, error: 'Archive name is required' },
        { status: 400 }
      )
    }

    if (!destinationPath) {
      return NextResponse.json(
        { success: false, error: 'Destination path is required' },
        { status: 400 }
      )
    }

    console.log(`[Borg API] Restoring archive ${archiveName} to ${destinationPath}`)

    const result = await extractArchive(archiveName, destinationPath, specificPaths)

    if (result.success) {
      return NextResponse.json({
        success: true,
        message: `Archive restored to ${result.extractedTo}`,
        extractedTo: result.extractedTo
      })
    } else {
      return NextResponse.json(
        { success: false, error: result.error },
        { status: 400 }
      )
    }
  } catch (error) {
    console.error('Borg restore POST error:', error)
    return NextResponse.json(
      { success: false, error: 'Restore failed' },
      { status: 500 }
    )
  }
}
