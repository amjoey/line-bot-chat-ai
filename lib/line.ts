import { messagingApi, validateSignature, type WebhookEvent } from "@line/bot-sdk";

const client = new messagingApi.MessagingApiClient({
  channelAccessToken: process.env.LINE_CHANNEL_ACCESS_TOKEN!,
});

export function verifySignature(body: string, signature: string | null): boolean {
  if (!signature) return false;
  return validateSignature(body, process.env.LINE_CHANNEL_SECRET!, signature);
}

export async function replyMessage(replyToken: string, text: string): Promise<void> {
  await client.replyMessage({
    replyToken,
    messages: [{ type: "text", text }],
  });
}

export function isTextMessageEvent(
  event: WebhookEvent
): event is WebhookEvent & { type: "message"; message: { type: "text"; text: string }; replyToken: string } {
  return event.type === "message" && event.message.type === "text";
}
