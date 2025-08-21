// 送信用ヘルパ（any なし）
export type FlexMessage = {
  type: "flex";
  altText: string;
  contents: Record<string, unknown>;
};

export async function pushFlex(to: string, msg: FlexMessage): Promise<void> {
  await fetch("https://api.line.me/v2/bot/message/push", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      // Messaging API のチャネルアクセストークン
      Authorization: `Bearer ${process.env.LINE_MESSAGING_ACCESS_TOKEN!}`,
    },
    body: JSON.stringify({ to, messages: [msg] }),
  });
}
