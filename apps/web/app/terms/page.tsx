import Link from "next/link"
import { ArrowLeft } from "lucide-react"

export const metadata = {
  title: "Terms of Service — CueBall",
  description: "The terms for using CueBall.",
}

export default function TermsOfServicePage() {
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
          <h1 className="text-2xl font-bold tracking-tight">Terms of Service</h1>
          <p className="mt-1 text-xs text-muted">Last updated: July 24, 2026</p>
        </header>

        <p>
          These terms cover your use of CueBall, a small, personal
          watch-party app for queuing YouTube videos with friends and voting
          on what plays next. By using CueBall, you agree to these terms.
        </p>

        <section className="flex flex-col gap-2">
          <h2 className="text-base font-bold">The service</h2>
          <p>
            CueBall lets a group create a &ldquo;room&rdquo; with a shared
            video queue. Anyone with the room code can join, add YouTube
            videos, and vote on play order. A room&apos;s host can optionally
            connect a YouTube account so CueBall keeps a real YouTube
            playlist in sync with the room&apos;s queue. CueBall is a hobby
            project, run on a best-effort basis, with no guaranteed uptime or
            support.
          </p>
        </section>

        <section className="flex flex-col gap-2">
          <h2 className="text-base font-bold">Accounts &amp; rooms</h2>
          <ul className="ml-5 list-disc space-y-2">
            <li>You can use CueBall as a guest in a room, or create an account for a persistent identity and room history.</li>
            <li>You&apos;re responsible for keeping your account credentials to yourself.</li>
            <li>Rooms are automatically deleted after 24 hours of inactivity.</li>
            <li>A room&apos;s host may remove other participants from that room at their discretion.</li>
          </ul>
        </section>

        <section className="flex flex-col gap-2">
          <h2 className="text-base font-bold">Acceptable use</h2>
          <p>You agree not to use CueBall to:</p>
          <ul className="ml-5 list-disc space-y-2">
            <li>Queue or share content that&apos;s illegal, infringing, or violates YouTube&apos;s own Terms of Service or Community Guidelines.</li>
            <li>Attempt to disrupt, abuse, or gain unauthorized access to CueBall or other users&apos; rooms or accounts.</li>
            <li>Use CueBall in a way that could get the app&apos;s YouTube API access restricted or revoked for everyone.</li>
          </ul>
        </section>

        <section className="flex flex-col gap-2">
          <h2 className="text-base font-bold">YouTube integration</h2>
          <p>
            CueBall&apos;s playlist-sync feature uses the YouTube Data API.
            When you connect YouTube as a host, you&apos;re authorizing
            CueBall to manage one playlist on your behalf (adding, removing,
            and reordering videos to match your room&apos;s queue). Your use
            of YouTube itself, including the videos you queue, remains
            subject to{" "}
            <a
              href="https://www.youtube.com/t/terms"
              target="_blank"
              rel="noopener noreferrer"
              className="font-semibold text-primary hover:underline"
            >
              YouTube&apos;s Terms of Service
            </a>
            . You can revoke CueBall&apos;s access at any time from{" "}
            <a
              href="https://myaccount.google.com/permissions"
              target="_blank"
              rel="noopener noreferrer"
              className="font-semibold text-primary hover:underline"
            >
              Google Account permissions
            </a>
            . See our{" "}
            <Link href="/privacy" className="font-semibold text-primary hover:underline">
              Privacy Policy
            </Link>{" "}
            for details on what we store and why.
          </p>
        </section>

        <section className="flex flex-col gap-2">
          <h2 className="text-base font-bold">Termination</h2>
          <p>
            We may suspend or remove access to CueBall, for any account or
            room, at any time — for example to address abuse or a violation
            of these terms. You can stop using CueBall, or delete your
            account, at any time.
          </p>
        </section>

        <section className="flex flex-col gap-2">
          <h2 className="text-base font-bold">No warranty</h2>
          <p>
            CueBall is provided &ldquo;as is,&rdquo; without warranties of
            any kind. As a small personal project, we don&apos;t guarantee
            it will be available, error-free, or fit for any particular
            purpose. To the extent permitted by law, we&apos;re not liable
            for any damages arising from your use of CueBall.
          </p>
        </section>

        <section className="flex flex-col gap-2">
          <h2 className="text-base font-bold">Changes to these terms</h2>
          <p>
            If these terms change, we&apos;ll update the date at the top of
            this page. Continued use of CueBall after a change means you
            accept the updated terms.
          </p>
        </section>

        <section className="flex flex-col gap-2">
          <h2 className="text-base font-bold">Contact</h2>
          <p>
            Questions about these terms? Email{" "}
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
