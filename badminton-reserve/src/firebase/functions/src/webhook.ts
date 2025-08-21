import { onRequest } from "firebase-functions/v2/https";
import { getFirestore } from "firebase-admin/firestore";

type LineEvent = {
  type: string;
  replyToken?: string;
  source: { type: string; userId?: string };
  message?: { type: "text"; text?: string };
};
type WebhookBody = { events: LineEvent[] };

export const lineWebhook = onRequest(
  { region: "asia-northeast1" },
  async (req, res) => {
    const body = req.body as WebhookBody;
    const db = getFirestore();

    for (const ev of body.events) {
      const userId = ev.source.userId;
      if (!userId) continue;
      if (ev.type === "message" && ev.message?.type === "text") {
        const code = (ev.message.text || "").trim();
        if (/^\d{6}$/.test(code)) {
          const snap = await db.collection("linkCodes").doc(code).get();
          const uid = snap.exists
            ? (snap.data()?.uid as string | undefined)
            : undefined;
          if (uid) {
            await db
              .collection("lineMessagingUsers")
              .doc(uid)
              .set({ userId }, { merge: true });
            await db.collection("linkCodes").doc(code).delete();
            await reply(ev.replyToken, "通知を有効化しました。");
            continue;
          }
        }
        await reply(
          ev.replyToken,
          "6桁コードが無効です。もう一度お試しください。"
        );
      }
    }
    res.status(200).send("OK");
  }
);

async function reply(replyToken?: string, text?: string): Promise<void> {
  if (!replyToken || !text) return;
  await fetch("https://api.line.me/v2/bot/message/reply", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${process.env.LINE_MESSAGING_ACCESS_TOKEN!}`,
    },
    body: JSON.stringify({ replyToken, messages: [{ type: "text", text }] }),
  });
}
