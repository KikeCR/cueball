import { ImageResponse } from "next/og"

export const size = { width: 180, height: 180 }
export const contentType = "image/png"

export default function AppleIcon() {
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
        }}
      >
        <div
          style={{
            width: 108,
            height: 108,
            borderRadius: "50%",
            background: "#f8fafc",
            boxShadow: "0 6px 16px rgba(20, 20, 60, 0.35)",
            display: "flex",
            position: "relative",
          }}
        >
          <div
            style={{
              position: "absolute",
              top: 16,
              left: 22,
              width: 32,
              height: 20,
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
