let audioContext: AudioContext | null = null

const getAudioContext = () => {
  if (!import.meta.client) return null

  const windowWithAudio = window as Window & {
    webkitAudioContext?: typeof AudioContext
  }
  const AudioContextConstructor = window.AudioContext ?? windowWithAudio.webkitAudioContext

  if (!AudioContextConstructor) return null

  audioContext ??= new AudioContextConstructor()
  return audioContext
}

export const useNotificationSound = () => {
  const unlock = async () => {
    const context = getAudioContext()
    if (!context) return false

    if (context.state === 'suspended') {
      await context.resume()
    }

    return true
  }

  const play = async (priority: string) => {
    const context = getAudioContext()
    if (!context) return

    if (context.state === 'suspended') {
      await context.resume()
    }

    const oscillator = context.createOscillator()
    const gain = context.createGain()
    const isUrgent = priority === 'EMERGENCY' || priority === 'HIGH'
    const now = context.currentTime

    oscillator.type = 'sine'
    oscillator.frequency.setValueAtTime(isUrgent ? 880 : 660, now)
    oscillator.frequency.exponentialRampToValueAtTime(isUrgent ? 660 : 520, now + 0.16)

    gain.gain.setValueAtTime(0.0001, now)
    gain.gain.exponentialRampToValueAtTime(isUrgent ? 0.18 : 0.08, now + 0.02)
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.22)

    oscillator.connect(gain)
    gain.connect(context.destination)
    oscillator.start(now)
    oscillator.stop(now + 0.24)
  }

  return { unlock, play }
}
