import Image from 'next/image'
import Link from 'next/link'

/**
 * Brand logo. Put your logo file in  public/logo.png  (square, 128x128 or bigger,
 * transparent PNG/SVG works best). To use an SVG, change the src to '/logo.svg'.
 *
 * dark  : true = white text (for dark backgrounds), false = dark text
 * tile  : true = puts the logo on a dark rounded tile, so a logo made for dark
 *         backgrounds stays visible on a white sidebar
 * href  : where the logo links to (default '/', use '/dashboard' inside the app)
 */
export default function Logo({
  dark = true,
  tile = false,
  href = '/'
}: {
  dark?: boolean
  tile?: boolean
  href?: string
}) {
  const image = (
    <Image
      src="/logo.png"
      alt="OpenSmash"
      width={32}
      height={32}
      priority
      className={
        tile
          ? 'h-full w-full object-contain'
          : 'h-8 w-8 rounded-lg object-contain transition-transform group-hover:-rotate-6'
      }
    />
  )
  return (
    <Link href={href} className="group inline-flex items-center gap-2.5">
      {tile ? (
        <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#05070d] p-1.5 shadow-sm ring-1 ring-black/5 transition-transform group-hover:-rotate-6">
          {image}
        </span>
      ) : (
        image
      )}
      <span className={`text-[15px] font-semibold tracking-tight ${dark ? 'text-white' : 'text-gray-900'}`}>
        OpenSmash
      </span>
    </Link>
  )
}