import type { WebhookEvent } from "@line/bot-sdk";
import { isTextMessageEvent, replyMessage, verifySignature } from "@/lib/line";
import { getFaq } from "@/lib/sheet";
import { getBookings } from "@/lib/calendar";
import { buildPrompt, callGemini, DEFAULT_REPLY } from "@/lib/gemini";

export async function POST(req: Request): Promise<Response> {
  const body = await req.text();
  const signature = req.headers.get("x-line-signature");

  if (!verifySignature(body, signature)) {
    return new Response("Invalid signature", { status: 401 });
  }

  const { events } = JSON.parse(body) as { events: WebhookEvent[] };
  const textEvents = events.filter(isTextMessageEvent);

  const [faq, bookings] = await Promise.all([getFaq(), getBookings()]);

  await Promise.all(
    textEvents.map(async (event) => {
      try {
        const prompt = buildPrompt(faq, bookings, event.message.text);
        const reply = await callGemini(prompt);
        await replyMessage(event.replyToken, reply);
      } catch (err) {
        console.error("[LINE_REPLY_ERROR]", err);
        try {
          await replyMessage(event.replyToken, DEFAULT_REPLY);
        } catch (innerErr) {
          console.error("[LINE_REPLY_ERROR]", innerErr);
        }
      }
    })
  );

  return Response.json({ ok: true }, { status: 200 });
}
