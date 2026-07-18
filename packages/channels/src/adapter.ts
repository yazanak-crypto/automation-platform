// @platform/channels — Channel primitive (Decision 007).
// Adapters normalize every provider into these shapes. Implementations land with M1 step 4.

export type ChannelType = "email" | "web_chat" | "whatsapp" | "instagram" | "sms";

export interface NormalizedMessage {
  channelType: ChannelType;
  direction: "inbound" | "outbound";
  externalConversationRef: string;
  externalMessageRef: string;
  contact: { displayName?: string; identity: string };
  body: string;
  receivedAt: Date;
}

export interface ChannelAdapter {
  type: ChannelType;
  capabilities: { supportsRichText: boolean; replyWindowHours?: number };
  /** Verify + normalize an inbound webhook payload. */
  normalizeInbound(payload: unknown): Promise<NormalizedMessage[]>;
  /** Deliver an approved outbound message. */
  send(message: NormalizedMessage): Promise<{ externalMessageRef: string }>;
}
