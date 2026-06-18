import { GoogleGenAI } from "@google/genai";
import type { FaqRow } from "./sheet";
import { faqToText } from "./sheet";

export const DEFAULT_REPLY =
  "ขออภัยค่ะ ขณะนี้ระบบไม่สามารถตอบกลับได้ ทีมงานจะติดต่อคุณลูกค้ากลับโดยเร็วที่สุดในเวลาทำการ (09:00-20:00) นะคะ";

const FALLBACK_TO_ADMIN =
  "ขออภัยค่ะ คำถามนี้ทีมงานขอส่งต่อให้แอดมินตอบคุณลูกค้าโดยตรงในเวลาทำการนะคะ (09:00-20:00) ทีมงานจะติดต่อกลับโดยเร็วที่สุดค่ะ";

const GEMINI_TIMEOUT_MS = 8_000;

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY! });

export function buildPrompt(faq: FaqRow[], userMessage: string): string {
  const faqText = faqToText(faq);

  return `<role>
คุณคือทีมงานต้อนรับของ PUYA Beach Villa พูลวิลล่าหรูริมทะเลหาดสะกอม จังหวัดสงขลา
</role>

<constraints>
- ตอบโดยใช้ข้อมูลใน <faq> เท่านั้น ห้ามเดา ห้ามแต่งข้อมูลที่ไม่มี
- ห้ามแต่งราคา เวลาเช็คอิน/เช็คเอาท์ ที่ตั้ง หรือสิ่งอำนวยความสะดวกใดๆ ที่ไม่ได้ระบุใน <faq>
- ถ้าคำถามไม่มีคำตอบใน <faq> ให้ตอบข้อความนี้เป๊ะ ห้ามดัดแปลง:
"${FALLBACK_TO_ADMIN}"
- โทน: ทางการ อบอุ่น เป็นมืออาชีพ ลงท้ายด้วย "ค่ะ/ครับ"
- เรียกลูกค้าว่า "คุณลูกค้า" หรือ "คุณพี่"
- เรียกตัวเองว่า "ทีมงาน"
- ห้ามใช้ emoji ทุกชนิด
- ความยาว 2-3 ประโยค มีรายละเอียดพอเหมาะ ไม่สั้นเกินไป ไม่ยาวเกินไป
- ตอบในมุมที่ส่งเสริมการจอง เช่น เมื่อแจ้งราคาจบ ให้เชิญชวนสอบถามวันว่างเพิ่ม
</constraints>

<output_format>
ตอบเป็นภาษาไทยล้วน ห้ามใช้ markdown ห้ามใช้ bullet ห้ามใช้ * # _ \` ใดๆ
</output_format>

<faq>
${faqText}
</faq>

<question>
${userMessage}
</question>`;
}

export async function callGemini(prompt: string): Promise<string> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), GEMINI_TIMEOUT_MS);

  try {
    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: prompt,
      config: {
        temperature: 1.0,
        maxOutputTokens: 1024,
        thinkingConfig: {
          thinkingBudget: 0,
        },
      },
      // @ts-expect-error -- abort signal is supported at the transport level
      signal: controller.signal,
    });

    const finishReason = response.candidates?.[0]?.finishReason;
    const thoughtsTokenCount = response.usageMetadata?.thoughtsTokenCount;
    const candidatesTokenCount = response.usageMetadata?.candidatesTokenCount;

    console.log("[GEMINI]", { finishReason, thoughtsTokenCount, candidatesTokenCount });

    if (finishReason === "MAX_TOKENS") {
      console.error("[MAX_TOKENS]", `thoughts=${thoughtsTokenCount} output=${candidatesTokenCount}`);
      return DEFAULT_REPLY;
    }

    if (finishReason === "SAFETY") {
      console.error("[SAFETY_BLOCK]");
      return DEFAULT_REPLY;
    }

    const text = response.text;
    if (!text) {
      console.error("[GEMINI_EMPTY_RESPONSE]");
      return DEFAULT_REPLY;
    }

    return text;
  } catch (err) {
    console.error("[GEMINI_TIMEOUT_OR_ERROR]", err);
    return DEFAULT_REPLY;
  } finally {
    clearTimeout(timeoutId);
  }
}
