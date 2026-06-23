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
  societyId: string
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

const getEmailErrorMeta = (error: unknown) => {
  const value = error as {
    code?: unknown
    command?: unknown
    message?: unknown
    response?: unknown
    responseCode?: unknown
  }

  return {
    code: typeof value.code === 'string' ? value.code : null,
    command: typeof value.command === 'string' ? value.command : null,
    message: error instanceof Error ? error.message : typeof value.message === 'string' ? value.message : null,
    response: typeof value.response === 'string' ? value.response : null,
    responseCode: typeof value.responseCode === 'number' ? value.responseCode : null,
  }
}

const describeInviteEmailError = (error: unknown) => {
  const meta = getEmailErrorMeta(error)
  const message = meta.message ?? meta.response ?? INVITE_EMAIL_FAILED_REASON
  const normalized = `${message} ${meta.response ?? ''}`.toLowerCase()

  if (meta.responseCode === 553 || normalized.includes('sender is not allowed to relay')) {
    return 'Invite was created, but SMTP rejected the saved From email. Approve that sender/domain for the SMTP account, or update the From email in notification settings, then resend the invite.'
  }

  if (meta.responseCode === 535 || normalized.includes('authentication failed') || normalized.includes('invalid login')) {
    return 'Invite was created, but SMTP authentication failed. Check the saved SMTP user in notification settings and SMTP_PASS in the environment, then resend the invite.'
  }

  if (meta.code === 'ECONNECTION' || meta.code === 'ETIMEDOUT' || meta.code === 'ESOCKET') {
    return 'Invite was created, but the SMTP server could not be reached. Check the saved SMTP host and port in notification settings, plus network access, then resend the invite.'
  }

  return message
}

const serializeEmailError = (error: unknown) => {
  const meta = getEmailErrorMeta(error)

  if (error instanceof Error) {
    return {
      name: error.name,
      message: meta.message,
      stack: error.stack,
      code: meta.code,
      command: meta.command,
      response: meta.response,
      responseCode: meta.responseCode,
    }
  }

  return meta
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
      societyId: invite.societyId,
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
      reason: describeInviteEmailError(error),
    }
  }
}
