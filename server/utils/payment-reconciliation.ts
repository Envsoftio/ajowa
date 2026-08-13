import process from 'node:process'
import { randomUUID } from 'node:crypto'
import { getDatabasePool } from './database'
import { getValidatedRuntimeConfig } from './env'
import { retrieveAndApplyOnlinePayment } from './online-payments'
import {
  enqueueReceiptReadyNotification,
  uploadReceiptPdfForPayment,
} from './payments'

export const PAYMENT_RECONCILIATION_WORKER_PATH =
  '/api/background/payment-reconciliation'
export const PAYMENT_RECONCILIATION_WORKER_SECRET_HEADER =
  'x-ajowa-payment-worker-secret'
export const PAYMENT_RECONCILIATION_BATCH_SIZE = 20

export const getPaymentReconciliationWorkerSecret = () => {
  try {
    return getValidatedRuntimeConfig().paymentReconciliationWorkerSecret
  } catch {
    return process.env.PAYMENT_RECONCILIATION_WORKER_SECRET ?? ''
  }
}

const errorMessage = (error: unknown) =>
  (error instanceof Error
    ? error.message
    : 'Unknown payment worker error.'
  ).slice(0, 1000)

const claimReconciliationAttempts = async (workerId: string) => {
  const result = await getDatabasePool().query<{ id: string }>(
    `with claimable as (
       select id
       from payment_gateway_attempts
       where provider = 'EASEBUZZ'
         and status in (
           'INITIATING', 'INITIATED', 'PENDING_VERIFICATION',
           'GATEWAY_SUCCESS', 'MANUAL_REVIEW'
         )
         and coalesce(next_reconciliation_at, updated_at) <= now()
         and (locked_at is null or locked_at < now() - interval '10 minutes')
       order by coalesce(next_reconciliation_at, updated_at), created_at
       for update skip locked
       limit $1
     )
     update payment_gateway_attempts attempt
     set locked_at = now(), locked_by = $2
     from claimable
     where attempt.id = claimable.id
     returning attempt.id`,
    [PAYMENT_RECONCILIATION_BATCH_SIZE, workerId],
  )
  return result.rows.map((row) => row.id)
}

const reconcileAttempt = async (attemptId: string, workerId: string) => {
  try {
    await retrieveAndApplyOnlinePayment(attemptId)
    await getDatabasePool().query(
      `update payment_gateway_attempts
       set locked_at = null, locked_by = null,
           next_reconciliation_at = case when status = 'VERIFIED' then null else now() + interval '5 minutes' end,
           access_key_ciphertext = case
             when access_key_expires_at <= now() then null else access_key_ciphertext end,
           access_key_expires_at = case
             when access_key_expires_at <= now() then null else access_key_expires_at end
       where id = $1 and locked_by = $2`,
      [attemptId, workerId],
    )
    return true
  } catch (error) {
    await getDatabasePool().query(
      `update payment_gateway_attempts
       set locked_at = null, locked_by = null,
           next_reconciliation_at = now() + interval '5 minutes',
           last_error_code = 'RECONCILIATION_FAILED',
           last_error_message = $3
       where id = $1 and locked_by = $2 and status <> 'VERIFIED'`,
      [attemptId, workerId, errorMessage(error)],
    )
    return false
  }
}

type EffectJob = { id: string; payment_id: string; job_type: string }

const claimEffectJobs = async (workerId: string) => {
  const result = await getDatabasePool().query<EffectJob>(
    `with claimable as (
       select id
       from payment_effect_jobs
       where status in ('QUEUED', 'RETRYING', 'PROCESSING')
         and coalesce(next_attempt_at, created_at) <= now()
         and (locked_at is null or locked_at < now() - interval '10 minutes')
       order by coalesce(next_attempt_at, created_at), created_at
       for update skip locked
       limit $1
     )
     update payment_effect_jobs job
     set status = 'PROCESSING', locked_at = now(), locked_by = $2,
         attempt_count = attempt_count + 1
     from claimable
     where job.id = claimable.id
     returning job.id, job.payment_id, job.job_type`,
    [PAYMENT_RECONCILIATION_BATCH_SIZE, workerId],
  )
  return result.rows
}

const processEffectJob = async (job: EffectJob, workerId: string) => {
  try {
    if (job.job_type === 'RECEIPT_PDF') {
      await uploadReceiptPdfForPayment(job.payment_id)
    } else if (job.job_type === 'RECEIPT_NOTIFICATION') {
      await enqueueReceiptReadyNotification(job.payment_id)
    } else {
      throw new Error(`Unsupported payment effect job: ${job.job_type}`)
    }
    await getDatabasePool().query(
      `update payment_effect_jobs
       set status = 'COMPLETED', completed_at = now(),
           locked_at = null, locked_by = null,
           next_attempt_at = null, last_error_code = null,
           last_error_message = null
       where id = $1 and locked_by = $2`,
      [job.id, workerId],
    )
    return true
  } catch (error) {
    await getDatabasePool().query(
      `update payment_effect_jobs
       set status = case when attempt_count >= 8 then 'FAILED' else 'RETRYING' end,
           next_attempt_at = case when attempt_count >= 8 then null else now() + interval '5 minutes' end,
           locked_at = null, locked_by = null,
           last_error_code = 'PAYMENT_EFFECT_FAILED', last_error_message = $3
       where id = $1 and locked_by = $2`,
      [job.id, workerId, errorMessage(error)],
    )
    return false
  }
}

export const runPaymentReconciliationBatch = async () => {
  const workerId = randomUUID()
  const attempts = await claimReconciliationAttempts(workerId)
  const reconciliationResults = await Promise.all(
    attempts.map((id) => reconcileAttempt(id, workerId)),
  )
  const jobs = await claimEffectJobs(workerId)
  const jobResults = await Promise.all(
    jobs.map((job) => processEffectJob(job, workerId)),
  )

  return {
    attemptsClaimed: attempts.length,
    attemptsCompleted: reconciliationResults.filter(Boolean).length,
    jobsClaimed: jobs.length,
    jobsCompleted: jobResults.filter(Boolean).length,
  }
}
