declare module 'web-push' {
  export type PushSubscription = {
    endpoint: string
    keys: {
      p256dh: string
      auth: string
    }
  }

  export type SendResult = {
    statusCode: number
    body?: string
    headers?: Record<string, string>
  }

  const webpush: {
    setVapidDetails(subject: string, publicKey: string, privateKey: string): void
    sendNotification(subscription: PushSubscription, payload?: string | Buffer): Promise<SendResult>
  }

  export default webpush
}
