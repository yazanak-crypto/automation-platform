"use client";

import { useAuth } from "@clerk/nextjs";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import styles from "./logo-reveal.module.css";

/**
 * The opening reveal: the mark assembling itself, once, over ~3s.
 *
 * Purely decorative and deliberately non-blocking — it is an overlay painted on
 * top while the app boots underneath, never a gate in front of it. It fetches
 * nothing, and it renders the same inline SVG the rest of the site uses rather
 * than loading an asset, so there is no request to wait on.
 *
 * It stays out of the way in four situations:
 *   • already played this tab (sessionStorage, so a reload inside the session
 *     does not replay it and a new tab does)
 *   • prefers-reduced-motion — the assembled mark, no movement (handled in CSS
 *     so it is correct even before hydration)
 *   • a signed-in user landing on an in-app route from somewhere else — that
 *     is someone following a link to their work, and a 3s title card in front
 *     of it is an obstacle, not a welcome
 *   • any click, tap or keypress, which dismisses it immediately
 */

/** Routes that are "the app", as opposed to marketing/legal/auth surfaces. */
const APP_ROUTES = [
  "/dashboard",
  "/conversations",
  "/orders",
  "/contacts",
  "/brain",
  "/channels",
  "/marketplace",
  "/automations",
  "/analytics",
  "/settings",
  "/billing",
  "/help",
  "/checkout",
  "/onboarding",
  "/admin",
];

const SEEN_KEY = "ovanth:reveal-seen";
const TOTAL_MS = 3000;
const EXIT_MS = 560;

function isAppRoute(pathname: string): boolean {
  return APP_ROUTES.some((r) => pathname === r || pathname.startsWith(`${r}/`));
}

/**
 * True when the visit did not originate from our own pages — an external link,
 * a bookmark, or a pasted URL. An empty referrer counts: that is the shape of a
 * direct hit, which is exactly the "arriving from outside" case.
 */
export function arrivedFromOutside(referrer: string, origin: string): boolean {
  if (!referrer) return true;
  try {
    return new URL(referrer).origin !== origin;
  } catch {
    return true;
  }
}

/**
 * Whether the reveal should play for this visit. Pure and exported so the
 * frequency rules are covered by tests rather than by reading the component:
 * "plays once per session" is the kind of claim that is easy to believe and
 * easy to get wrong.
 *
 * `seen` is the sessionStorage flag; everything else describes the visit.
 */
export function shouldPlayReveal(v: {
  seen: boolean;
  signedIn: boolean;
  pathname: string;
  referrer: string;
  origin: string;
}): boolean {
  if (v.seen) return false;
  // A signed-in person following a link straight to their work. A 3s title
  // card in front of that is an obstacle, not a welcome.
  if (v.signedIn && isAppRoute(v.pathname) && arrivedFromOutside(v.referrer, v.origin)) {
    return false;
  }
  return true;
}

export function LogoReveal() {
  // Starts false so the server and the first client paint agree; the effect
  // decides. A reveal that flashed in and then vanished on hydration would be
  // worse than not showing it at all.
  const [state, setState] = useState<"idle" | "playing" | "exiting">("idle");
  const pathname = usePathname();
  // Read on the CLIENT, not passed down from the layout: a server auth() call
  // in the root layout makes every route dynamic and cost the site its static
  // pages. Waiting for isLoaded is free here — the decision already happens in
  // an effect after hydration.
  const { isLoaded, isSignedIn } = useAuth();
  const decided = useRef(false);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);

  const dismiss = useCallback(() => {
    setState((s) => (s === "playing" ? "exiting" : s));
  }, []);

  useEffect(() => {
    if (!isLoaded || decided.current) return;
    decided.current = true;
    let seen = true;
    try {
      seen = sessionStorage.getItem(SEEN_KEY) === "1";
    } catch {
      // Private mode or blocked storage: treat as seen rather than replaying
      // the reveal on every navigation, which is the worse failure.
    }
    const play = shouldPlayReveal({
      seen,
      signedIn: !!isSignedIn,
      pathname,
      referrer: document.referrer,
      origin: window.location.origin,
    });

    // Written even when we are NOT playing (unless storage is unavailable):
    // this visit "uses up" the reveal either way. Otherwise a deep-linked user
    // who later clicks through to the marketing page would get it at a random
    // moment, which reads as a glitch rather than an opening.
    if (!seen) {
      try {
        sessionStorage.setItem(SEEN_KEY, "1");
      } catch {}
    }
    if (!play) return;
    setState("playing");
    // Runs once, guarded by decided.current: the reveal belongs to the session,
    // not to the route, so re-running it on navigation is the bug this guards
    // against. isLoaded is the only reason it is not a bare mount effect.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isLoaded]);

  useEffect(() => {
    if (state !== "playing") return;
    timers.current.push(setTimeout(() => setState("exiting"), TOTAL_MS - EXIT_MS));
    const onKey = () => dismiss();
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      timers.current.forEach(clearTimeout);
      timers.current = [];
    };
  }, [state, dismiss]);

  useEffect(() => {
    if (state !== "exiting") return;
    const t = setTimeout(() => setState("idle"), EXIT_MS);
    return () => clearTimeout(t);
  }, [state]);

  if (state === "idle") return null;

  return (
    <div
      className={`${styles.overlay} ${state === "exiting" ? styles.exit : ""}`}
      onClick={dismiss}
      onPointerDown={dismiss}
      // Decoration: announced to nobody, and never a focus trap.
      aria-hidden="true"
    >
      <svg
        viewBox="0 0 48 48"
        className={styles.mark}
        fill="none"
        stroke="currentColor"
        strokeWidth={3.55}
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        {/* No junction flare. It was built and cut after watching it: a soft
            brass circle behind the apex reads as a grey SMUDGE over the strokes
            rather than a glow, because the bloom and the mark are the same hue
            and the mark is the brighter of the two. */}
        <path className={styles.horizontal} d="M24.7 24 H43" />
        <path className={styles.outerUpper} d="M24.7 24 L5 8.3" />
        <path className={styles.innerUpper} d="M24.7 24 L5 16.2" />
        <path className={styles.innerLower} d="M24.7 24 L5 31.8" />
        <path className={styles.outerLower} d="M24.7 24 L5 39.7" />
      </svg>
    </div>
  );
}
