import Link from "next/link"
import { ArrowLeft } from "lucide-react"

export const metadata = {
  title: "Privacy Policy — CueBall",
  description: "How CueBall collects, uses, and protects your data.",
}

export default function PrivacyPolicyPage() {
  return (
    <main className="mx-auto max-w-2xl px-4 py-12 sm:py-16">
      <Link
        href="/"
        className="mb-6 inline-flex items-center gap-1.5 text-sm font-semibold text-muted hover:text-text"
      >
        <ArrowLeft className="size-3.5" /> Back to home
      </Link>

      <article className="flex flex-col gap-6 text-sm leading-relaxed text-text">
        <header>
          <h1 className="text-2xl font-bold tracking-tight">Privacy Policy</h1>
          <p className="mt-1 text-xs text-muted">Last updated: July 24, 2026</p>
        </header>

        <p>
          CueBall (&ldquo;CueBall&rdquo;, &ldquo;we&rdquo;, &ldquo;us&rdquo;) is a
          small, personal watch-party app that lets a group of friends queue up
          YouTube videos, vote on what plays next, and optionally keep a real
          YouTube playlist in sync with that queue. This page explains what
          information CueBall collects and how it&apos;s used.
        </p>

        <section className="flex flex-col gap-2">
          <h2 className="text-base font-bold">Information we collect</h2>
          <ul className="ml-5 list-disc space-y-2">
            <li>
              <strong>Account information.</strong> If you create an account,
              we store your email address, a securely hashed password (we
              never store your password in plain text), and the display name
              you choose.
            </li>
            <li>
              <strong>Google sign-in.</strong> If you sign in with Google
              instead, we receive your name and email address from Google to
              create or match your CueBall account. We do not receive your
              Google password.
            </li>
            <li>
              <strong>Guest names.</strong> If you join a room without an
              account, we store the display name you enter for that room.
            </li>
            <li>
              <strong>Room and queue activity.</strong> Room codes, the videos
              added to a room&apos;s queue, and votes cast on those videos, so
              the shared queue can be kept in sync for everyone in the room.
            </li>
            <li>
              <strong>YouTube playlist access.</strong> If a room&apos;s host
              chooses to &ldquo;Connect YouTube,&rdquo; CueBall requests
              permission (via Google OAuth) to manage a single YouTube
              playlist on the host&apos;s behalf. We store the resulting
              access and refresh tokens so CueBall can add, remove, and
              reorder videos in that playlist to match the room&apos;s queue.
              These tokens are stored server-side and are never exposed to
              other participants or to the browser.
            </li>
          </ul>
        </section>

        <section className="flex flex-col gap-2">
          <h2 className="text-base font-bold">How we use this information</h2>
          <p>We use the information above only to operate CueBall itself:</p>
          <ul className="ml-5 list-disc space-y-2">
            <li>Authenticating you and remembering your account or guest identity.</li>
            <li>Running the shared room queue: adding videos, tallying votes, and determining play order.</li>
            <li>
              Keeping a connected YouTube playlist in sync with a room&apos;s
              queue, when a host has explicitly connected one.
            </li>
            <li>Showing your past rooms if you&apos;re signed in.</li>
          </ul>
          <p>We do not use your data for advertising, and we do not sell or rent it to anyone.</p>
        </section>

        <section className="flex flex-col gap-2">
          <h2 className="text-base font-bold">Google API Services User Data Policy</h2>
          <p>
            CueBall&apos;s use and transfer of information received from
            Google APIs to any other app will adhere to the{" "}
            <a
              href="https://developers.google.com/terms/api-services-user-data-policy"
              target="_blank"
              rel="noopener noreferrer"
              className="font-semibold text-primary hover:underline"
            >
              Google API Services User Data Policy
            </a>
            , including the Limited Use requirements. YouTube playlist access
            is used exclusively to keep a room&apos;s queue and its connected
            YouTube playlist in sync, and for no other purpose. For details
            on how Google itself handles data it processes on our behalf,
            see{" "}
            <a
              href="https://policies.google.com/privacy"
              target="_blank"
              rel="noopener noreferrer"
              className="font-semibold text-primary hover:underline"
            >
              Google&apos;s Privacy Policy
            </a>
            .
          </p>
        </section>

        <section className="flex flex-col gap-2">
          <h2 className="text-base font-bold">Sharing your information</h2>
          <p>
            We don&apos;t share your personal information with third
            parties, except with Google/YouTube&apos;s own APIs as strictly
            necessary to provide the playlist-sync feature you&apos;ve
            explicitly enabled. Other participants in a room can see your
            display name and the videos/votes you contribute to that room,
            since that&apos;s the whole point of a shared queue.
          </p>
        </section>

        <section className="flex flex-col gap-2">
          <h2 className="text-base font-bold">Data retention &amp; deletion</h2>
          <ul className="ml-5 list-disc space-y-2">
            <li>
              Rooms (and their queue, votes, and any connected playlist link)
              are automatically deleted after 24 hours of inactivity with no
              one connected.
            </li>
            <li>
              You can revoke CueBall&apos;s access to your YouTube account at
              any time from{" "}
              <a
                href="https://myaccount.google.com/permissions"
                target="_blank"
                rel="noopener noreferrer"
                className="font-semibold text-primary hover:underline"
              >
                Google Account permissions
              </a>
              . This immediately invalidates the stored tokens.
            </li>
            <li>
              To request deletion of your account or any data we hold about
              you, contact us at the email below and we&apos;ll take care of
              it promptly.
            </li>
          </ul>
        </section>

        <section className="flex flex-col gap-2">
          <h2 className="text-base font-bold">Security</h2>
          <p>
            Passwords are hashed with bcrypt and never stored in plain text.
            YouTube access/refresh tokens are stored server-side only and are
            never sent to the browser or to other participants.
          </p>
        </section>

        <section className="flex flex-col gap-2">
          <h2 className="text-base font-bold">Children&apos;s privacy</h2>
          <p>CueBall is not directed at children under 13, and we don&apos;t knowingly collect information from them.</p>
        </section>

        <section className="flex flex-col gap-2">
          <h2 className="text-base font-bold">Changes to this policy</h2>
          <p>
            If this policy changes, we&apos;ll update the date at the top of
            this page. Continued use of CueBall after a change means you
            accept the updated policy.
          </p>
        </section>

        <section className="flex flex-col gap-2">
          <h2 className="text-base font-bold">Contact</h2>
          <p>
            Questions, or want your data deleted? Email{" "}
            <a
              href="mailto:luis.barrantesv@gmail.com"
              className="font-semibold text-primary hover:underline"
            >
              luis.barrantesv@gmail.com
            </a>
            .
          </p>
        </section>
      </article>
    </main>
  )
}
