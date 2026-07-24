interface CastControlsCardProps {
  isHost: boolean
}

export function CastControlsCard({ isHost }: CastControlsCardProps) {
  return (
    <p className="text-sm text-muted">
      {isHost
        ? "Casting to a TV isn't wired up yet — build and vote on the queue below in the meantime."
        : "Waiting for casting to a TV to be set up for this room."}
    </p>
  )
}
