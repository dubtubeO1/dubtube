import { Resend } from 'resend'

let _client: Resend | null = null

function getClient(): Resend {
  if (!_client) {
    const key = process.env.RESEND_API_KEY
    if (!key) throw new Error('RESEND_API_KEY is not configured')
    _client = new Resend(key)
  }
  return _client
}

const FROM_EMAIL = 'contact@dubtube.net'
const REACTIVATE_URL = 'https://dubtube.net/pricing'

const BUTTON_STYLE =
  'display:inline-block;padding:12px 24px;background:#334155;color:#ffffff;' +
  'border-radius:8px;text-decoration:none;font-weight:600;font-size:14px;'

function buildHtml(body: string): string {
  return `
    <!DOCTYPE html>
    <html>
      <body style="font-family:sans-serif;font-size:15px;color:#1e293b;line-height:1.6;max-width:560px;margin:0 auto;padding:32px 16px;">
        ${body}
        <p style="margin-top:32px;font-size:13px;color:#64748b;">
          Support: <a href="mailto:contact@dubtube.net" style="color:#334155;">contact@dubtube.net</a>
        </p>
      </body>
    </html>
  `
}

export interface WarningEmailParams {
  to: string
  deletionDate: Date
  warningDay: 1 | 7 | 15 | 29
}

export async function sendWarningEmail(params: WarningEmailParams): Promise<boolean> {
  const { to, deletionDate, warningDay } = params

  const dateStr = deletionDate.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  })

  const button = `<p style="margin-top:24px;"><a href="${REACTIVATE_URL}" style="${BUTTON_STYLE}">Reactivate Subscription</a></p>`

  let subject: string
  let bodyHtml: string

  if (warningDay === 1) {
    subject = 'Your Dubtube projects will be deleted in 30 days'
    bodyHtml = buildHtml(`
      <p>Hi there,</p>
      <p>Your Dubtube subscription has been cancelled. Your projects and files will be permanently deleted on <strong>${dateStr}</strong>. To keep your projects, reactivate your subscription before this date.</p>
      ${button}
    `)
  } else if (warningDay === 29) {
    subject = 'Final notice: Your Dubtube projects will be deleted tomorrow'
    bodyHtml = buildHtml(`
      <p>Hi there,</p>
      <p>Your projects will be permanently deleted tomorrow (<strong>${dateStr}</strong>). This is your last chance to reactivate your subscription and save your files.</p>
      ${button}
    `)
  } else {
    subject = `Action required: Your Dubtube projects will be deleted on ${dateStr}`
    bodyHtml = buildHtml(`
      <p>Hi there,</p>
      <p>This is a reminder that your projects will be permanently deleted on <strong>${dateStr}</strong>. Reactivate your subscription now to save your work.</p>
      ${button}
    `)
  }

  try {
    const { error } = await getClient().emails.send({ from: FROM_EMAIL, to, subject, html: bodyHtml })
    if (error) {
      console.error('[Resend] Failed to send warning email:', error)
      return false
    }
    return true
  } catch (err) {
    console.error('[Resend] Exception sending warning email:', err)
    return false
  }
}
