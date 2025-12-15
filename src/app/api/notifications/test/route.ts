import { NextResponse } from 'next/server'
import { testEmailConnection, sendEmail, getSupportEmails } from '@/lib/notifications'

// POST: Test email connection and send test email
export async function POST() {
  try {
    // First test the connection
    const connectionTest = await testEmailConnection()

    if (!connectionTest.success) {
      return NextResponse.json({
        success: false,
        error: `Connection failed: ${connectionTest.error}`
      })
    }

    // Get email recipients
    const emails = await getSupportEmails()
    if (emails.length === 0) {
      return NextResponse.json({
        success: false,
        error: 'No email recipients configured'
      })
    }

    // Send test email
    const sent = await sendEmail({
      to: emails,
      subject: '[RobotPOS] Test Email - Connection Successful',
      html: `
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="utf-8">
        </head>
        <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; margin: 0; padding: 20px; background-color: #f5f5f5;">
          <div style="max-width: 500px; margin: 0 auto; background: white; border-radius: 8px; padding: 24px; box-shadow: 0 2px 8px rgba(0,0,0,0.1);">
            <div style="text-align: center; margin-bottom: 20px;">
              <div style="width: 60px; height: 60px; background: linear-gradient(135deg, #22c55e 0%, #16a34a 100%); border-radius: 50%; margin: 0 auto; display: flex; align-items: center; justify-content: center;">
                <span style="color: white; font-size: 30px;">✓</span>
              </div>
            </div>
            <h2 style="text-align: center; color: #333; margin: 0 0 12px 0;">Email Connection Test</h2>
            <p style="text-align: center; color: #22c55e; font-weight: 600; font-size: 18px; margin: 0 0 20px 0;">Successful!</p>
            <p style="color: #666; text-align: center; font-size: 14px; margin: 0;">
              Your email notification system is configured correctly. You will receive daily summaries and failure alerts at this address.
            </p>
            <div style="margin-top: 24px; padding-top: 16px; border-top: 1px solid #eee; text-align: center;">
              <p style="color: #999; font-size: 12px; margin: 0;">RobotPOS SQL Tool</p>
            </div>
          </div>
        </body>
        </html>
      `
    })

    return NextResponse.json({
      success: sent,
      message: sent ? 'Test email sent successfully' : 'Failed to send test email'
    })
  } catch (error) {
    console.error('Test email failed:', error)
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    })
  }
}
