"use client"

import { useEffect, useState } from "react"
import QRCode from "qrcode"
import { ExternalLink } from "lucide-react"

interface PlaylistShareProps {
  playlistId: string
}

export function PlaylistShare({ playlistId }: PlaylistShareProps) {
  const url = `https://www.youtube.com/playlist?list=${playlistId}`
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    QRCode.toDataURL(url, { width: 160, margin: 1 }).then((dataUrl) => {
      if (!cancelled) setQrDataUrl(dataUrl)
    })
    return () => {
      cancelled = true
    }
  }, [url])

  return (
    <div className="flex items-center gap-4">
      {qrDataUrl && (
        <img
          src={qrDataUrl}
          alt="QR code linking to the YouTube playlist"
          width={96}
          height={96}
          className="rounded-md border border-border"
        />
      )}
      <div className="flex flex-col gap-1">
        <p className="text-sm text-muted">
          Live on YouTube — anyone can open the playlist directly.
        </p>
        <a
          href={url}
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-1 text-sm font-semibold text-primary hover:underline"
        >
          Open playlist <ExternalLink className="size-3.5" />
        </a>
      </div>
    </div>
  )
}
