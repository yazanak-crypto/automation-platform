import { SignUp } from "@clerk/nextjs";
import { Wordmark } from "@/components/wordmark";

export default function SignUpPage() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-6 p-6">
      <div className="flex flex-col items-center gap-2 text-center">
        <Wordmark size="lg" href="/" />
        <p className="text-sm text-ink-2">Start your 7-day free trial — no card required.</p>
      </div>
      <SignUp appearance={{ elements: { headerTitle: "hidden", headerSubtitle: "hidden" } }} />
    </main>
  );
}
