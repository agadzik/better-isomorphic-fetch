import { registerOTel } from '@vercel/otel'

export function register() {
  registerOTel({ serviceName: 'better-fetch-example' })
}
