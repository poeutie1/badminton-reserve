// LINE Messaging API 送信用ユーティリティ
const PUSH_URL = "https://api.line.me/v2/bot/message/push";

// 最低限使うメッセージ型
type LineTextMessage = { type: "text"; text: string };
type LineFlexMessage = {
  type: "flex";
  altText: string;
  contents: Record<string, unknown>; // Flex JSON（厳密にしない）
};
type LineMessage = LineTextMessage | LineFlexMessage;

// "line:Uxxxx" → "Uxxxx"
export function toLineUserId(raw: string | undefined | null): string | null {
  if (!raw) return null;
  if (raw.startsWith("line:")) return raw.slice(5);
  if (raw.startsWith("U")) return raw;
  return null;
}

/** 低レベル：そのまま push する */
export async function pushLine(
  to: string,
  messages: LineMessage[]
): Promise<boolean> {
  const token = process.env.LINE_CHANNEL_ACCESS_TOKEN;
  if (!token) {
    console.error("LINE_CHANNEL_ACCESS_TOKEN is missing");
    return false;
  }
  const res = await fetch(PUSH_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ to, messages }),
  });
  if (!res.ok) {
    const t = await res.text().catch(() => "");
    console.error("LINE push failed:", res.status, t);
  }
  return res.ok;
}

/** Flex（カードUI）の生成 */
export function buildPromotionFlex(args: {
  title: string;
  whenText: string; // 例: "11/12(火) 18:50〜21:30"
  url: string; // イベント詳細URL or LIFF URL
}): LineMessage[] {
  const { title, whenText, url } = args;
  return [
    {
      type: "flex",
      altText: `キャンセル待ち繰り上げ: ${title}`,
      contents: {
        type: "bubble",
        size: "mega",
        body: {
          type: "box",
          layout: "vertical",
          spacing: "md",
          contents: [
            {
              type: "text",
              text: "キャンセル待ち繰り上げ",
              weight: "bold",
              size: "xl",
            },
            {
              type: "box",
              layout: "baseline",
              spacing: "sm",
              contents: [
                {
                  type: "text",
                  text: "開催日時",
                  size: "sm",
                  color: "#9CA3AF",
                  flex: 2,
                },
                {
                  type: "text",
                  text: whenText,
                  size: "sm",
                  color: "#111827",
                  wrap: true,
                  flex: 5,
                },
              ],
            },
            {
              type: "text",
              text: "キャンセルが出たため、キャンセル待ちを参加に繰り上げました。ご参加フォームからイベント内容をご確認ください。",
              size: "sm",
              color: "#374151",
              wrap: true,
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
              action: { type: "uri", label: "イベント内容の確認", uri: url },
            },
          ],
        },
      } as Record<string, unknown>,
    },
  ];
}

/** 高レベル：cancel ルートから呼びやすいラッパー */
export async function pushPromotedMessage(args: {
  to: string; // "line:Uxxx" でも "Uxxx" でもOK
  title: string;
  whenLabel: string; // 表示用日時
  eventUrl: string; // 遷移先URL
}) {
  const u = toLineUserId(args.to);
  if (!u) {
    console.error("pushPromotedMessage: invalid 'to'", args.to);
    return false;
  }

  const messages = buildPromotionFlex({
    title: args.title,
    whenText: args.whenLabel,
    url: args.eventUrl,
  });

  const ok = await pushLine(u, messages);
  if (!ok) {
    return pushLine(u, [
      {
        type: "text",
        text: `キャンセル待ち繰り上げ\n「${args.title}」\n${args.whenLabel}\n${args.eventUrl}`,
      },
    ]);
  }
  return true;
}
