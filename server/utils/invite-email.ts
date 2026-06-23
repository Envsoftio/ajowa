import type { H3Event } from 'h3'
import { sendTemplatedEmail } from './email'
import { getRequestLogger } from './logging'

type InviteEmailContext = {
  title: string
  name: string
  actionUrl: string
  expiresLabel: string
  inviterName?: string
  roleLabel?: string
  details?: string
}

export type PendingInviteEmail = {
  to: string
  subject: string
  template: 'invite-onboarding'
  context: InviteEmailContext
  inviteUrl: string
  expiresAt: string
}

export type InviteEmailDelivery =
  | { delivered: true }
  | { delivered: false; reason: string }

const INVITE_EMAIL_FAILED_REASON =
  'Invite was created, but email delivery failed. Check SMTP settings and resend the invite.'

const serializeEmailError = (error: unknown) => {
  if (error instanceof Error) {
    const details = error as Error & {
      code?: unknown
      command?: unknown
      responseCode?: unknown
    }

    return {
      name: error.name,
      message: error.message,
      stack: error.stack,
      code: details.code,
      command: details.command,
      responseCode: details.responseCode,
    }
  }

  return { message: String(error) }
}

export const sendInviteEmailSafely = async (
  event: H3Event,
  invite: PendingInviteEmail,
): Promise<InviteEmailDelivery> => {
  const logger = getRequestLogger(event)

  try {
    const result = await sendTemplatedEmail({
      to: invite.to,
      subject: invite.subject,
      template: invite.template,
      context: invite.context,
    })

    if (result.delivered) {
      return { delivered: true }
    }

    const reason =
      'reason' in result && typeof result.reason === 'string'
        ? result.reason
        : INVITE_EMAIL_FAILED_REASON

    if (!result.delivered) {
      logger.info('Invite email was not sent.', {
        email: invite.to,
        reason,
      })
    }

    return { delivered: false, reason }
  } catch (error) {
    logger.error('Invite email delivery failed.', {
      email: invite.to,
      error: serializeEmailError(error),
    })

    return {
      delivered: false,
      reason: INVITE_EMAIL_FAILED_REASON,
    }
  }
}
