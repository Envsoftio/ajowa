export default defineNitroPlugin(() => {
  if (process.env.NOTIFICATION_WORKER_ENABLED === 'true') {
    console.warn(
      JSON.stringify({
        level: 'warn',
        message:
          'Automatic notification processing is disabled. Use /api/admin/notifications/process to send queued notifications.',
      }),
    )
  }
})
