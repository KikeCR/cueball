import { ImageResponse } from "next/og"

export const size = { width: 32, height: 32 }
export const contentType = "image/png"

export default function Icon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "linear-gradient(135deg, #6467f2 0%, #5048e5 100%)",
          borderRadius: 7,
        }}
      >
        <div
          style={{
            width: 20,
            height: 20,
            borderRadius: "50%",
            background: "#f8fafc",
            display: "flex",
            position: "relative",
          }}
        >
          <div
            style={{
              position: "absolute",
              top: 3,
              left: 4,
              width: 6,
              height: 4,
              borderRadius: "50%",
              background: "rgba(255,255,255,0.9)",
            }}
          />
        </div>
      </div>
    ),
    { ...size }
  )
}
