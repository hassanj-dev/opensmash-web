'use client'

import { useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import {
  Check,
  ChevronDown,
  Download,
  Info,
  KeyRound,
  Laptop,
  ListOrdered,
  Monitor,
  Plus,
  ShieldCheck,
  Smartphone,
  Wifi,
  WifiOff,
  RefreshCw,
  Globe,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { PageHeader, EmptyState } from '@/components/app/kit'
import {
  desktopApp,
  desktopDownloadReady,
  desktopAppMac,
  desktopMacDownloadReady,
} from '@/lib/desktop-app'

// This page lives under /dashboard, so proxy.ts already sends visitors who are
// not logged in to /auth/login. Every role (owner, manager, receptionist) may open it.
//
// It is a Client Component ('use client') because it passes icon components as props
// and uses browser events (beforeinstallprompt / appinstalled) for the Android install button.

// Anchor ids for the installation steps. PHONE_STEPS_ID is the original id and is kept
// so existing links to it keep working; the two below let each phone button jump to its
// own instructions.
const PHONE_STEPS_ID = 'install-phone'
const ANDROID_STEPS_ID = 'install-android'
const IOS_STEPS_ID = 'install-ios'

// Smooth-scrolls to an element (instant when the person prefers reduced motion) and
// moves keyboard / screen-reader focus there.
function scrollToId(id: string) {
  const el = document.getElementById(id)
  if (!el) return
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
  el.scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth', block: 'start' })
  el.focus({ preventScroll: true })
}

const focusRing =
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2'

const buttonBase = `inline-flex h-11 w-full items-center justify-center gap-2 rounded-xl px-5 text-sm font-semibold transition-all active:scale-[0.98] ${focusRing}`
const primaryButtonClass = `${buttonBase} cs-primary text-white shadow-sm hover:brightness-110 hover:shadow-md`
const secondaryButtonClass = `${buttonBase} border border-slate-200 bg-white text-slate-700 shadow-sm hover:border-slate-300 hover:bg-slate-50`

const cardClass =
  'group/card flex h-full flex-col overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-[0_1px_2px_rgba(15,23,42,0.04)] transition-all hover:-translate-y-0.5 hover:border-slate-300 hover:shadow-[0_8px_24px_-8px_rgba(15,23,42,0.12)] motion-reduce:transition-none motion-reduce:hover:translate-y-0'

const iconTileClass =
  'flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-brand-soft text-brand ring-1 ring-inset ring-black/[0.04]'

const chipClass =
  'inline-flex items-center gap-1 rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs font-medium text-slate-600'

interface PlatformInfo {
  key: string
  label: string
  icon: LucideIcon
  platform: string
  fileType: string
  version: string
  size: string
  downloadUrl: string
  sha256: string
  ready: boolean
  verifyShell: string
  verifyCommand: string
  // First sentence of the security guidance shown in "How to get started"
  warning: string
}

const platforms: PlatformInfo[] = [
  {
    key: 'windows',
    label: 'Windows',
    icon: Monitor,
    platform: desktopApp.platform,
    fileType: 'Installer (.exe)',
    version: desktopApp.version,
    size: desktopApp.size,
    downloadUrl: desktopApp.downloadUrl,
    sha256: desktopApp.sha256,
    ready: desktopDownloadReady,
    verifyShell: 'Command Prompt or PowerShell',
    verifyCommand: 'certutil -hashfile <downloaded-file> SHA256',
    warning:
      'Windows may show “Windows protected your PC” when an installer is new or not yet signed.',
  },
  {
    key: 'mac',
    label: 'Mac',
    icon: Laptop,
    platform: desktopAppMac.platform,
    fileType: 'Disk image (.dmg)',
    version: desktopAppMac.version,
    size: desktopAppMac.size,
    downloadUrl: desktopAppMac.downloadUrl,
    sha256: desktopAppMac.sha256,
    ready: desktopMacDownloadReady,
    verifyShell: 'Terminal',
    verifyCommand: 'shasum -a 256 <downloaded-file>',
    warning: 'macOS may say the app can’t be opened because the developer can’t be verified.',
  },
]

// Chrome's install prompt event (not part of the standard TypeScript DOM types)
interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>
}

// ---------------------------------------------------------------------------
// Desktop
// ---------------------------------------------------------------------------

function DesktopCard({ p }: { p: PlatformInfo }) {
  const meta = [
    { label: 'Format', value: p.fileType },
    ...(p.version ? [{ label: 'Version', value: `v${p.version}` }] : []),
    ...(p.size ? [{ label: 'Size', value: p.size }] : []),
  ]

  return (
    <article className={cardClass}>
      <div className="flex flex-1 flex-col p-5">
        <header className="flex items-center gap-4">
          <span className={iconTileClass}>
            <p.icon className="h-6 w-6" aria-hidden="true" />
          </span>
          <div className="min-w-0">
            <h3 className="text-lg font-semibold tracking-tight text-slate-900">{p.label}</h3>
            <p className="text-sm text-slate-500">{p.platform}</p>
          </div>
        </header>

        <dl className="mt-5 grid grid-cols-[repeat(auto-fit,minmax(5.5rem,1fr))] divide-x divide-slate-200 overflow-hidden rounded-xl border border-slate-200 bg-slate-50/70 text-xs">
          {meta.map((m) => (
            <div key={m.label} className="px-3 py-2.5">
              <dt className="text-slate-500">{m.label}</dt>
              <dd className="mt-0.5 font-semibold text-slate-900">{m.value}</dd>
            </div>
          ))}
        </dl>

        <div className="mt-auto pt-5">
          {/* No `download` attribute: the file lives on another origin (e.g. GitHub Releases),
              where browsers ignore it. The server's own headers start the download. */}
          <a
            href={p.downloadUrl}
            target="_blank"
            rel="noopener noreferrer"
            className={primaryButtonClass}
          >
            <Download className="h-4 w-4" aria-hidden="true" />
            Download for {p.label}
            <span className="sr-only"> (opens in a new tab)</span>
          </a>
        </div>
      </div>

      {p.sha256 && (
        <details className="group border-t border-slate-200 bg-slate-50/60">
          <summary
            className={`flex min-h-11 cursor-pointer list-none items-center justify-between gap-2 px-5 text-sm font-medium text-slate-700 hover:bg-slate-100/70 [&::-webkit-details-marker]:hidden ${focusRing}`}
          >
            <span className="flex items-center gap-2">
              <ShieldCheck className="h-4 w-4 text-emerald-600" aria-hidden="true" />
              Verify download
            </span>
            <ChevronDown
              className="h-4 w-4 text-slate-400 transition-transform group-open:rotate-180"
              aria-hidden="true"
            />
          </summary>
          <div className="space-y-3 border-t border-slate-200 bg-white p-5 text-xs text-slate-500">
            <div>
              <p className="font-medium text-slate-700">SHA-256 checksum</p>
              <p className="mt-1.5 break-all rounded-lg border border-slate-200 bg-slate-50 p-2.5 font-mono text-slate-700">
                {p.sha256}
              </p>
            </div>
            <div>
              <p>
                After downloading, run this in {p.verifyShell}. The result must match the checksum
                above.
              </p>
              <code className="mt-1.5 block overflow-x-auto whitespace-nowrap rounded-lg bg-slate-900 px-3 py-2.5 font-mono text-slate-100">
                {p.verifyCommand}
              </code>
            </div>
          </div>
        </details>
      )}
    </article>
  )
}

// Shown instead of DesktopCard when a platform has no download link yet.
function ComingSoonCard({ p }: { p: PlatformInfo }) {
  return (
    <article className={cardClass}>
      <div className="flex flex-1 flex-col p-5">
        <header className="flex items-center gap-4">
          <span className={iconTileClass}>
            <p.icon className="h-6 w-6" aria-hidden="true" />
          </span>
          <div className="min-w-0">
            <h3 className="text-lg font-semibold tracking-tight text-slate-900">{p.label}</h3>
            <p className="text-sm text-slate-500">{p.platform}</p>
          </div>
        </header>

        <p className="mt-5 text-sm leading-relaxed text-slate-500">
          The {p.label} app is coming soon. The download will appear here when it is ready.
        </p>

        <div className="mt-auto pt-5">
          <button
            type="button"
            disabled
            aria-disabled="true"
            className={`${buttonBase} cursor-not-allowed border border-slate-200 bg-slate-100 text-slate-400`}
          >
            Coming soon
          </button>
        </div>
      </div>
    </article>
  )
}

// ---------------------------------------------------------------------------
// Mobile (web app installs, nothing is downloaded)
// ---------------------------------------------------------------------------

function MobileCard({
  title,
  subtitle,
  description,
  children,
}: {
  title: string
  subtitle: string
  // Optional: when omitted, no description paragraph is rendered.
  description?: string
  children: ReactNode
}) {
  return (
    <article className={`${cardClass} p-5`}>
      <header className="flex items-center gap-4">
        <span className={iconTileClass}>
          <Smartphone className="h-6 w-6" aria-hidden="true" />
        </span>
        <div className="min-w-0">
          <h3 className="text-lg font-semibold tracking-tight text-slate-900">{title}</h3>
          <p className="text-sm text-slate-500">{subtitle}</p>
        </div>
      </header>

      {description && (
        <p className="mt-4 text-sm leading-relaxed text-slate-500">{description}</p>
      )}
      {/* Chips and button sit in one group pinned to the bottom, so both cards line up. */}
      <div className="mt-auto pt-5">
        <ul className="flex flex-wrap gap-2">
          <li className={chipClass}>
            <Globe className="h-3 w-3" aria-hidden="true" />
            Web app
          </li>
          <li className={chipClass}>
            <Wifi className="h-3 w-3" aria-hidden="true" />
            Needs internet
          </li>
        </ul>
        <div className="mt-5">{children}</div>
      </div>
    </article>
  )
}

// Android: Chrome can install the dashboard as an app (PWA). On an Android phone the
// button opens Chrome's install prompt. Anywhere else (e.g. on a computer) there is no
// prompt, so the button takes the person to the written steps instead.
function AndroidCard() {
  const [installEvent, setInstallEvent] = useState<BeforeInstallPromptEvent | null>(null)
  const [installed, setInstalled] = useState(false)

  useEffect(() => {
    const onPrompt = (e: Event) => {
      // Only take over the prompt on Android; desktop Chrome keeps its own behaviour.
      if (!/android/i.test(navigator.userAgent)) return
      e.preventDefault()
      setInstallEvent(e as BeforeInstallPromptEvent)
    }
    const onInstalled = () => {
      setInstalled(true)
      setInstallEvent(null)
    }
    window.addEventListener('beforeinstallprompt', onPrompt)
    window.addEventListener('appinstalled', onInstalled)
    return () => {
      window.removeEventListener('beforeinstallprompt', onPrompt)
      window.removeEventListener('appinstalled', onInstalled)
    }
  }, [])

  const install = async () => {
    if (!installEvent) return
    await installEvent.prompt()
    await installEvent.userChoice
    // The browser only allows one prompt per event
    setInstallEvent(null)
  }

  return (
    <MobileCard title="Android" subtitle="Phone or tablet, using Chrome">
      {installed ? (
        <p
          role="status"
          className="flex h-11 items-center justify-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 text-sm font-semibold text-emerald-700"
        >
          <Check className="h-4 w-4" aria-hidden="true" /> Installed
        </p>
      ) : installEvent ? (
        <button type="button" onClick={install} className={primaryButtonClass}>
          <Plus className="h-4 w-4" aria-hidden="true" />
          Install app
        </button>
      ) : (
        <button
          type="button"
          onClick={() => scrollToId(ANDROID_STEPS_ID)}
          className={secondaryButtonClass}
        >
          <ListOrdered className="h-4 w-4" aria-hidden="true" />
          View installation steps
        </button>
      )}
    </MobileCard>
  )
}

// iPhone / iPad: Safari has no install prompt, so the button takes the person to the
// "Add to Home Screen" steps.
function IosCard() {
  return (
    <MobileCard title="iPhone & iPad" subtitle="Using Safari">
      <button
        type="button"
        onClick={() => scrollToId(IOS_STEPS_ID)}
        className={secondaryButtonClass}
      >
        <ListOrdered className="h-4 w-4" aria-hidden="true" />
        View installation steps
      </button>
    </MobileCard>
  )
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

interface Step {
  key: string
  anchor?: string
  icon: LucideIcon
  title: string
  content: ReactNode
  // Visual only: highlights the security-warning step
  tone?: 'warning'
}

const stepBoxClass =
  'scroll-mt-24 rounded-xl border border-slate-200 bg-slate-50 p-4 text-xs leading-relaxed text-slate-600 outline-none transition-shadow focus-visible:ring-2 focus-visible:ring-brand'

function SectionHeading({
  id,
  icon: Icon,
  title,
  description,
}: {
  id: string
  icon: LucideIcon
  title: string
  description: string
}) {
  return (
    <div className="flex items-start gap-3">
      <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-slate-600">
        <Icon className="h-4 w-4" aria-hidden="true" />
      </span>
      <div>
        <h2 id={id} className="text-base font-semibold tracking-tight text-slate-900">
          {title}
        </h2>
        <p className="mt-0.5 text-sm text-slate-500">{description}</p>
      </div>
    </div>
  )
}

export default function DownloadPage() {
  // A desktop platform only appears once its download link has been set.
  const availablePlatforms = platforms.filter((p) => p.ready)

  const steps: Step[] = [
    {
      key: 'download',
      icon: Download,
      title: 'Download and install on your computer',
      content:
        'Download the installer for your computer, open it and follow the steps. On Windows it installs like any other program. On Mac, open the .dmg file and drag the app into the Applications folder.',
    },
    // Only shown for the desktop platforms that actually have a download
    ...(availablePlatforms.length > 0
      ? [
          {
            key: 'warning',
            tone: 'warning' as const,
            icon: Info,
            title: 'If your computer shows a security warning',
            content: (
              <ul className="mt-2 space-y-2.5 rounded-xl border border-amber-200 bg-amber-50/70 p-3.5 text-xs leading-relaxed text-amber-900">
                {availablePlatforms.map((p) => (
                  <li key={p.key} className="flex items-start gap-2">
                    <p.icon className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-600" aria-hidden="true" />
                    <span>
                      <b className="font-semibold">{p.label}:</b> {p.warning} Don’t
                      continue unless you downloaded the file from this page
                      {p.sha256 ? ' and its checksum under “Verify download” matches' : ''}. If it
                      doesn’t match, or you’re unsure, delete the file and contact support.
                    </span>
                  </li>
                ))}
              </ul>
            ),
          },
        ]
      : []),
    {
      key: 'phone',
      anchor: PHONE_STEPS_ID,
      icon: Smartphone,
      title: 'Add it to your phone or tablet',
      content: (
        <>
          <p>
            There is no file to download. The app installs from your browser and opens like any other
            app. It needs an internet connection.
          </p>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <div id={ANDROID_STEPS_ID} tabIndex={-1} className={stepBoxClass}>
              <p className="text-sm font-semibold text-slate-800">Android (Chrome)</p>
              <ol className="mt-2 list-decimal space-y-1.5 pl-4 marker:font-semibold marker:text-slate-400">
                <li>Open this page in Chrome on your phone.</li>
                <li>
                  Tap the <b>&#8942;</b> menu.
                </li>
                <li>
                  Tap <b>Install app</b> (or <b>Add to Home screen</b>).
                </li>
              </ol>
            </div>
            <div id={IOS_STEPS_ID} tabIndex={-1} className={stepBoxClass}>
              <p className="text-sm font-semibold text-slate-800">iPhone &amp; iPad (Safari)</p>
              <ol className="mt-2 list-decimal space-y-1.5 pl-4 marker:font-semibold marker:text-slate-400">
                <li>
                  Open this page in <b>Safari</b>.
                </li>
                <li>
                  Tap the <b>Share</b> button (the square with an arrow).
                </li>
                <li>
                  Tap <b>Add to Home Screen</b>, then <b>Add</b>.
                </li>
              </ol>
            </div>
          </div>
        </>
      ),
    },
    {
      key: 'signin',
      icon: KeyRound,
      title: 'Sign in with your web account',
      content:
        'Use the same email and password you use on this website. Sign in once while the internet is connected.',
    },
    {
      key: 'offline',
      icon: Wifi,
      title: 'Keep working, even offline',
      content:
        'If the internet drops, the desktop app keeps working. Your data syncs with this dashboard when the connection is back. The phone apps (Android, iPhone and iPad) need an internet connection.',
    },
  ]

  return (
    <>
      <PageHeader
        title="Download OpenSmash"
        description="Install the desktop app on your reception computer, or add OpenSmash to your phone or tablet from your browser."
      />

      <div className="max-w-5xl space-y-12">
        {/* Summary strip: what each option gives you, at a glance */}
        <ul className="grid gap-3 sm:grid-cols-3" aria-label="Highlights">
          {[
            { icon: WifiOff, title: 'Works offline', text: 'On the desktop app' },
            { icon: RefreshCw, title: 'Syncs automatically', text: 'When you’re back online' },
            { icon: Smartphone, title: 'Phone and tablet', text: 'Installs from your browser' },
          ].map((h) => (
            <li
              key={h.title}
              className="flex items-center gap-3 rounded-xl border border-slate-200/80 bg-white px-4 py-3 shadow-[0_1px_2px_rgba(15,23,42,0.04)]"
            >
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-brand-soft text-brand">
                <h.icon className="h-4 w-4" aria-hidden="true" />
              </span>
              <div className="min-w-0">
                <p className="text-sm font-semibold text-slate-900">{h.title}</p>
                <p className="truncate text-xs text-slate-500">{h.text}</p>
              </div>
            </li>
          ))}
        </ul>

        <section aria-labelledby="desktop-heading" className="space-y-5">
          <SectionHeading
            id="desktop-heading"
            icon={Monitor}
            title="Desktop applications"
            description="For Windows and Mac. Works offline and syncs with this dashboard."
          />

          {availablePlatforms.length === 0 ? (
            <EmptyState
              icon={Monitor}
              title="Windows and Mac downloads coming soon"
              description="The download link has not been added yet. Please check back shortly or contact support."
            />
          ) : (
            <div className="grid gap-5 sm:grid-cols-2">
              {platforms.map((p) =>
                p.ready ? (
                  <DesktopCard key={p.key} p={p} />
                ) : (
                  <ComingSoonCard key={p.key} p={p} />
                ),
              )}
            </div>
          )}
        </section>

        <section aria-labelledby="mobile-heading" className="space-y-5">
          <SectionHeading
            id="mobile-heading"
            icon={Smartphone}
            title="Install on mobile"
            description="These are web apps. They install from your browser and need an internet connection."
          />

          <div className="grid gap-5 sm:grid-cols-2">
            <AndroidCard />
            <IosCard />
          </div>
        </section>

        <section aria-label="How to get started">
          <Card className="overflow-hidden rounded-2xl border-slate-200/80 shadow-[0_1px_2px_rgba(15,23,42,0.04)]">
            <CardHeader className="border-b border-slate-100 bg-slate-50/60 pb-4">
              <CardTitle className="text-base tracking-tight">How to get started</CardTitle>
            </CardHeader>
            <CardContent className="pt-6">
              <ol>
                {steps.map((step, i) => {
                  const isLast = i === steps.length - 1
                  return (
                    <li
                      key={step.key}
                      id={step.anchor}
                      className={`relative flex scroll-mt-24 items-start gap-4 ${isLast ? '' : 'pb-6'}`}
                    >
                      {/* Timeline connector */}
                      {!isLast && (
                        <span
                          className="absolute left-4 top-9 -ml-px h-[calc(100%-2.25rem)] w-px bg-slate-200"
                          aria-hidden="true"
                        />
                      )}
                      <span
                        className={`relative z-10 flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-sm font-semibold ring-4 ring-white ${
                          step.tone === 'warning'
                            ? 'bg-amber-100 text-amber-800'
                            : 'bg-brand-soft text-brand'
                        }`}
                      >
                        {i + 1}
                      </span>
                      <div className="min-w-0 flex-1 pt-0.5">
                        <p className="flex items-center gap-1.5 text-sm font-semibold text-slate-900">
                          <step.icon
                            className={`h-4 w-4 ${step.tone === 'warning' ? 'text-amber-600' : 'text-brand'}`}
                            aria-hidden="true"
                          />{' '}
                          {step.title}
                        </p>
                        <div className="mt-1 text-sm leading-relaxed text-slate-500">{step.content}</div>
                      </div>
                    </li>
                  )
                })}
              </ol>
            </CardContent>
          </Card>
        </section>
      </div>
    </>
  )
}