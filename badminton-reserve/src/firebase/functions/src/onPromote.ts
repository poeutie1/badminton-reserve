import { onDocumentUpdated } from "firebase-functions/v2/firestore";

type Participant = { status?: "wait" | "in" | "cancel" };

export const notifyPromotion = onDocumentUpdated(
  {
    document: "events/{eventId}/participants/{uid}",
    region: "asia-northeast1",
  },
  async (event) => {
    const before = event.data?.before.data() as Participant | undefined;
    const after = event.data?.after.data() as Participant | undefined;
    if (!(before && after)) return;
    if (!(before.status === "wait" && after.status === "in")) return;

    const uid = event.params.uid as string;
    const eventId = event.params.eventId as string;

    const { getFirestore } = await import("firebase-admin/firestore");
    const db = getFirestore();

    const mapSnap = await db.collection("lineMessagingUsers").doc(uid).get();
    const to = mapSnap.exists
      ? (mapSnap.data()?.userId as string | undefined)
      : undefined;
    if (!to) return;

    const evSnap = await db.collection("events").doc(eventId).get();
    const title = (evSnap.data()?.title as string | undefined) ?? "練習";
    const when = (evSnap.data()?.displayTime as string | undefined) ?? "";
    const url = `https://badminton-gold.vercel.app/events/${eventId}`;

    await pushFlex(to, buildPromotionFlex({ title, when, url }));
  }
);

type FlexMessage = {
  type: "flex";
  altText: string;
  contents: Record<string, unknown>;
};
type FlexArgs = { title: string; when: string; url: string };

function buildPromotionFlex(a: FlexArgs): FlexMessage {
  return {
    type: "flex",
    altText: "繰り上がり通知",
    contents: {
      type: "bubble",
      body: {
        type: "box",
        layout: "vertical",
        contents: [
          {
            type: "text",
            text: "キャンセル待ち繰り上げ",
            weight: "bold",
            size: "lg",
          },
          {
            type: "box",
            layout: "baseline",
            margin: "md",
            contents: [
              { type: "text", text: "開催日時", size: "sm", color: "#999999" },
              { type: "text", text: a.when, size: "sm", margin: "md" },
            ],
          },
          {
            type: "text",
            text: "キャンセルが出たため、キャンセル待ちを参加に繰り上げました。ご参加フォームからイベント内容をご確認ください。",
            wrap: true,
            size: "sm",
            margin: "md",
          },
        ],
      },
      footer: {
        type: "box",
        layout: "vertical",
        spacing: "sm",
        contents: [
          {
            type: "button",
            style: "link",
            height: "sm",
            action: { type: "uri", label: "イベント内容の確認", uri: a.url },
          },
        ],
        flex: 0,
      },
    },
  };
}

async function pushFlex(to: string, msg: FlexMessage): Promise<void> {
  const res = await fetch("https://api.line.me/v2/bot/message/push", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${process.env.LINE_MESSAGING_ACCESS_TOKEN!}`,
    },
    body: JSON.stringify({ to, messages: [msg] }),
  });
  if (!res.ok) {
    const text = await res.text();
    console.error("LINE push error:", res.status, text);
  }
}
