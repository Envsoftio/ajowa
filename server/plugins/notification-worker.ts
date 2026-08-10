export default defineNitroPlugin(() => {
  if (process.env.NOTIFICATION_WORKER_ENABLED === 'true') {
    console.warn(
      JSON.stringify({
        level: 'warn',
        message:
          'Legacy in-process notification handling is disabled. Use /api/admin/notifications/process for generic queued notifications.',
      }),
    )
  }
})
