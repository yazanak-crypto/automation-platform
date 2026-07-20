"use client";

import { createContext, useCallback, useContext, useEffect, useState } from "react";

export interface DashboardData {
  metrics: {
    conversations: number;
    resolved: number;
    awaitingApproval: number;
    avgConfidence: number | null;
    escalated: number;
    timeSavedMinutes: number;
  };
  attention: {
    drafts: {
      conversationId: string;
      draftBody: string;
      createdAt: string;
      visitorMessage: string | null;
      contactEmail: string | null;
      reasoning: string | null;
    }[];
    needsHuman: {
      conversationId: string | null;
      startedAt: string;
      reason: string | null;
      visitorMessage: string | null;
    }[];
  };
  activity: { id: string; at: string; title: string; tone: string }[];
  recentConversations: {
    id: string;
    status: string;
    channelName: string;
    contactEmail: string | null;
    contactName: string | null;
    lastMessage: string | null;
    pendingDraft: boolean;
  }[];
  activations: {
    id: string;
    automationSlug: string;
    status: string;
    mode: "supervised" | "smart";
    channelIds: string[];
    activatedAt: string;
  }[];
  connectedTypes: string[];
  nudge: { activationId: string; approvals: number; wouldHaveAutoHandled: number } | null;
}

const Ctx = createContext<{ data: DashboardData | null; refresh: () => void } | null>(null);

/** One fetch + one poll for the whole dashboard (replaces 6 widget fetches). */
export function DashboardProvider({ children }: { children: React.ReactNode }) {
  const [data, setData] = useState<DashboardData | null>(null);

  const refresh = useCallback(async () => {
    const res = await fetch("/api/dashboard").catch(() => null);
    if (res?.ok) setData(await res.json());
  }, []);

  useEffect(() => {
    void refresh();
    const t = setInterval(refresh, 15000);
    const onVis = () => document.visibilityState === "visible" && refresh();
    document.addEventListener("visibilitychange", onVis);
    return () => {
      clearInterval(t);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, [refresh]);

  return <Ctx.Provider value={{ data, refresh }}>{children}</Ctx.Provider>;
}

export function useDashboard() {
  const c = useContext(Ctx);
  if (!c) throw new Error("useDashboard outside provider");
  return c;
}
