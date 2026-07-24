import Link from "next/link";
import { Wordmark } from "@/components/wordmark";

export default function NotFound() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-6 p-8 text-center">
      <Wordmark size="lg" href="/" />
      <div>
        <p className="text-2xl font-semibold tracking-[-0.01em]">This page took a wrong turn</p>
        <p className="mt-2 text-sm text-ink-2">
          The page you&apos;re looking for doesn&apos;t exist or has moved.
        </p>
      </div>
      <Link
        href="/"
        className="press-glow rounded-lg bg-white px-5 py-2.5 text-sm font-medium text-black transition-transform active:scale-[0.97]"
      >
        Back to home
      </Link>
    </main>
  );
}
