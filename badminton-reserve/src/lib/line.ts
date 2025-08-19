// src/lib/line.ts
export type PromotePayload = {
  to: string; // lineUserId (U で始まる)
  title: string; // イベント名
  whenLabel: string; // 例: "11/12(火) 18:50〜21:30"
  eventUrl: string; // イベント詳細URL
};

const LINE_PUSH_API = "https://api.line.me/v2/bot/message/push";

export async function pushPromotedMessage(p: PromotePayload) {
  const token = process.env.LINE_CHANNEL_ACCESS_TOKEN;
  if (!token) throw new Error("LINE_CHANNEL_ACCESS_TOKEN not set");

  const flex = buildFlex(p);
  const body = {
    to: p.to,
    messages: [
      {
        type: "flex",
        altText: `キャンセル待ち繰り上げ: ${p.title}（${p.whenLabel}）`,
        contents: flex,
      },
    ],
  };

  const res = await fetch(LINE_PUSH_API, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(body),
  });

  // 友だちでない等は 400 になるので握りつぶしてもOK
  if (!res.ok) {
    const t = await res.text().catch(() => "");
    console.warn("LINE push failed", res.status, t);
  }
}

function buildFlex(p: PromotePayload) {
  // 画像なしのシンプルカード（スクショ風）
  return {
    type: "bubble",
    size: "mega",
    body: {
      type: "box",
      layout: "vertical",
      contents: [
        {
          type: "text",
          text: "キャンセル待ち繰り上げ",
          weight: "bold",
          size: "xl",
        },
        {
          type: "box",
          layout: "vertical",
          margin: "md",
          contents: [
            {
              type: "box",
              layout: "baseline",
              spacing: "sm",
              contents: [
                {
                  type: "text",
                  text: "開催日時",
                  color: "#aaaaaa",
                  size: "sm",
                  flex: 2,
                },
                {
                  type: "text",
                  text: p.whenLabel,
                  wrap: true,
                  color: "#666666",
                  size: "sm",
                  flex: 5,
                },
              ],
            },
            {
              type: "text",
              margin: "md",
              wrap: true,
              text: "キャンセルが出たため、キャンセル待ちを参加に繰り上げました。ご参加フォームからイベント内容をご確認ください。",
            },
          ],
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
          action: { type: "uri", label: "イベント内容の確認", uri: p.eventUrl },
        },
      ],
      flex: 0,
    },
  };
}
