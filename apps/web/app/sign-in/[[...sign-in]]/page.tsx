import { SignIn } from "@clerk/nextjs";
import { Wordmark } from "@/components/wordmark";
import { BRAND } from "@/lib/brand";

export default function SignInPage() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-6 p-6">
      <div className="flex flex-col items-center gap-2 text-center">
        <Wordmark size="lg" href="/" />
        <p className="text-sm text-ink-2">Welcome back to {BRAND}.</p>
      </div>
      <SignIn appearance={{ elements: { headerTitle: "hidden", headerSubtitle: "hidden" } }} />
    </main>
  );
}
