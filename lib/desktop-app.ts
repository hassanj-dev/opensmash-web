// Everything about the desktop installers in one place.
// Set these in Vercel > Project > Settings > Environment Variables, then redeploy:
//
// Windows
//   NEXT_PUBLIC_DESKTOP_DOWNLOAD_URL       direct link to the Windows installer (https://...)
//                                          e.g. a GitHub Release asset:
//                                          https://github.com/<you>/<repo>/releases/download/v1.0.0/OpenSmash-Setup-1.0.0.exe
//   NEXT_PUBLIC_DESKTOP_WINDOWS_VERSION    e.g. 1.0.0                               (optional)
//   NEXT_PUBLIC_DESKTOP_SHA256             SHA-256 checksum of the Windows file     (optional)
//   NEXT_PUBLIC_DESKTOP_SIZE               e.g. "92 MB"                             (optional)
//
// macOS
//   NEXT_PUBLIC_DESKTOP_MAC_DOWNLOAD_URL   direct link to the Mac installer (https://...)
//                                          e.g. .../releases/download/v1.0.0/OpenSmash-1.0.0.dmg
//   NEXT_PUBLIC_DESKTOP_MAC_VERSION        e.g. 1.0.0                               (optional)
//   NEXT_PUBLIC_DESKTOP_MAC_SHA256         SHA-256 checksum of the Mac file         (optional)
//   NEXT_PUBLIC_DESKTOP_MAC_SIZE           e.g. "118 MB"                            (optional)
//
// Shared fallback
//   NEXT_PUBLIC_DESKTOP_VERSION            used for a platform whose own version
//                                          variable above is not set                (optional)
//
// A platform is only shown on the download page when its download URL is set,
// so you can ship Windows first and add Mac later (or the other way round).
// Each platform shows only its own version, checksum and size.
// NEXT_PUBLIC_ values are baked in at build time, so after changing one you must redeploy
// (locally: restart `npm run dev`).

// Windows (these names are unchanged so existing imports keep working)
export const desktopApp = {
  name: 'OpenSmash Desktop',
  platform: 'Windows 10 or 11 (64-bit)',
  downloadUrl: (process.env.NEXT_PUBLIC_DESKTOP_DOWNLOAD_URL ?? '').trim(),
  version: (
    process.env.NEXT_PUBLIC_DESKTOP_WINDOWS_VERSION ??
    process.env.NEXT_PUBLIC_DESKTOP_VERSION ??
    ''
  ).trim(),
  sha256: (process.env.NEXT_PUBLIC_DESKTOP_SHA256 ?? '').trim(),
  size: (process.env.NEXT_PUBLIC_DESKTOP_SIZE ?? '').trim(),
}

// Only a real https link counts as "ready"; anything else hides that platform.
export const desktopDownloadReady = desktopApp.downloadUrl.startsWith('https://')

// macOS
export const desktopAppMac = {
  platform: 'macOS (Apple Silicon and Intel)',
  downloadUrl: (process.env.NEXT_PUBLIC_DESKTOP_MAC_DOWNLOAD_URL ?? '').trim(),
  version: (
    process.env.NEXT_PUBLIC_DESKTOP_MAC_VERSION ??
    process.env.NEXT_PUBLIC_DESKTOP_VERSION ??
    ''
  ).trim(),
  sha256: (process.env.NEXT_PUBLIC_DESKTOP_MAC_SHA256 ?? '').trim(),
  size: (process.env.NEXT_PUBLIC_DESKTOP_MAC_SIZE ?? '').trim(),
}

export const desktopMacDownloadReady = desktopAppMac.downloadUrl.startsWith('https://')