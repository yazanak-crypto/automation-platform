/** Deterministic half of the boundary post-check (plan §4.3). */
export function findBannedPhrase(reply: string, bannedPhrases: string[]): string | null {
  const lower = reply.toLowerCase();
  for (const p of bannedPhrases) {
    if (p && lower.includes(p.toLowerCase())) return p;
  }
  return null;
}
