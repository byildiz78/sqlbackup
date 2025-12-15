import { NextResponse } from 'next/server'
import { pruneArchives, compactRepository } from '@/lib/borg-backup'

// POST: Prune old archives
export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}))
    const keepDaily = body.keepDaily || 7
    const keepWeekly = body.keepWeekly || 4
    const keepMonthly = body.keepMonthly || 6

    console.log(`[Borg API] Pruning archives (keep: ${keepDaily}d, ${keepWeekly}w, ${keepMonthly}m)`)

    const pruneResult = await pruneArchives(keepDaily, keepWeekly, keepMonthly)

    if (!pruneResult.success) {
      return NextResponse.json(
        { success: false, error: pruneResult.error },
        { status: 400 }
      )
    }

    // Compact after prune
    const compactResult = await compactRepository()

    return NextResponse.json({
      success: true,
      message: 'Archives pruned and repository compacted',
      compacted: compactResult.success
    })
  } catch (error) {
    console.error('Borg prune error:', error)
    return NextResponse.json(
      { success: false, error: 'Prune failed' },
      { status: 500 }
    )
  }
}
