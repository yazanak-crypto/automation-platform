import { SignedIn, SignedOut, SignInButton, UserButton } from "@clerk/nextjs";
import Link from "next/link";

export default function Home() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-6">
      <h1 className="text-4xl font-semibold tracking-tight">Platform</h1>
      <p className="text-neutral-400">Scaffold — marketing site lands later.</p>
      <SignedOut>
        <SignInButton>
          <button className="rounded-lg bg-white px-5 py-2 font-medium text-black">
            Sign in
          </button>
        </SignInButton>
      </SignedOut>
      <SignedIn>
        <div className="flex items-center gap-4">
          <Link href="/dashboard" className="underline underline-offset-4">
            Dashboard
          </Link>
          <UserButton />
        </div>
      </SignedIn>
    </main>
  );
}
