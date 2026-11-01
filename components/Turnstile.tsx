'use client'

import Script from 'next/script'
import { useEffect, useRef } from 'react'

// Cloudflare Turnstile widget. It only shows up when
// NEXT_PUBLIC_TURNSTILE_SITE_KEY is set; without the key the pages work as before.
const SITE_KEY = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY ?? ''
export const TURNSTILE_ENABLED = SITE_KEY.length > 0

type TurnstileApi = {
  render: (el: HTMLElement, options: Record<string, unknown>) => string
  reset: (widgetId?: string) => void
  remove: (widgetId?: string) => void
}

function getApi(): TurnstileApi | undefined {
  return (window as unknown as { turnstile?: TurnstileApi }).turnstile
}

export default function Turnstile({
  onToken,
  resetKey = 0,
}: {
  onToken: (token: string) => void
  /** Change this number to get a fresh challenge (a token can be used only once) */
  resetKey?: number
}) {
  const boxRef = useRef<HTMLDivElement>(null)
  const widgetRef = useRef<string | null>(null)
  const onTokenRef = useRef(onToken)

  useEffect(() => {
    onTokenRef.current = onToken
  }, [onToken])

  const mount = () => {
    const api = getApi()
    if (!api || !boxRef.current || widgetRef.current) return
    widgetRef.current = api.render(boxRef.current, {
      sitekey: SITE_KEY,
      theme: 'dark',
      callback: (token: string) => onTokenRef.current(token),
      'expired-callback': () => onTokenRef.current(''),
      'error-callback': () => onTokenRef.current(''),
    })
  }

  // Script may already be loaded (client-side navigation)
  useEffect(() => {
    mount()
    return () => {
      const api = getApi()
      if (api && widgetRef.current) api.remove(widgetRef.current)
      widgetRef.current = null
    }
  }, [])

  // New challenge after a failed attempt
  useEffect(() => {
    if (resetKey === 0) return
    const api = getApi()
    if (api && widgetRef.current) api.reset(widgetRef.current)
    onTokenRef.current('')
  }, [resetKey])

  if (!TURNSTILE_ENABLED) return null

  return (
    <>
      <Script
        src="https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit"
        strategy="afterInteractive"
        onReady={mount}
      />
      <div ref={boxRef} className="flex justify-center" />
    </>
  )
}