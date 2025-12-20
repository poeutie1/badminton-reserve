import { NextResponse } from "next/server";
import { z } from "zod";
import tls from "tls";

const contactSchema = z.object({
  name: z.string().min(1).max(100),
  email: z.string().email(),
  message: z.string().min(1).max(2000),
});

type SmtpOptions = {
  host: string;
  port: number;
  username: string;
  password: string;
};

async function sendMailViaSmtp({
  from,
  to,
  subject,
  text,
  smtp,
}: {
  from: string;
  to: string;
  subject: string;
  text: string;
  smtp: SmtpOptions;
}) {
  const socket = tls.connect({
    host: smtp.host,
    port: smtp.port,
    servername: smtp.host,
  });

  await new Promise<void>((resolve, reject) => {
    socket.once("secureConnect", () => resolve());
    socket.once("error", reject);
  });

  const state = { buffer: "" };

  const readResponse = () =>
    new Promise<{ code: number; text: string }>((resolve, reject) => {
      const lines: string[] = [];
      const handleData = (chunk: Buffer) => {
        state.buffer += chunk.toString("utf8");
        while (true) {
          const idx = state.buffer.indexOf("\r\n");
          if (idx === -1) break;
          const line = state.buffer.slice(0, idx);
          state.buffer = state.buffer.slice(idx + 2);
          if (!line) continue;
          lines.push(line);
          if (line.length >= 4 && line[3] === " ") {
            const code = Number(line.slice(0, 3));
            cleanup();
            resolve({ code, text: lines.join("\n") });
            return;
          }
        }
      };

      const handleError = (err: Error) => {
        cleanup();
        reject(err);
      };

      const cleanup = () => {
        socket.off("data", handleData);
        socket.off("error", handleError);
      };

      socket.on("data", handleData);
      socket.on("error", handleError);
    });

  const sendCommand = async (
    command: string | null,
    expect: number | number[]
  ) => {
    if (command) {
      socket.write(`${command}\r\n`, "utf8");
    }
    const { code, text } = await readResponse();
    const expected = Array.isArray(expect) ? expect : [expect];
    if (!expected.includes(code)) {
      throw new Error(`SMTP unexpected response: ${code} ${text}`);
    }
  };

  await sendCommand(null, 220);
  await sendCommand(`EHLO ${smtp.host}`, 250);
  await sendCommand("AUTH LOGIN", 334);
  await sendCommand(
    Buffer.from(smtp.username, "utf8").toString("base64"),
    334
  );
  await sendCommand(
    Buffer.from(smtp.password, "utf8").toString("base64"),
    235
  );
  await sendCommand(`MAIL FROM:<${from}>`, 250);
  await sendCommand(`RCPT TO:<${to}>`, [250, 251]);
  await sendCommand("DATA", 354);

  const headers = [
    `From: ${from}`,
    `To: ${to}`,
    `Subject: ${subject}`,
    "MIME-Version: 1.0",
    "Content-Type: text/plain; charset=UTF-8",
  ].join("\r\n");

  socket.write(`${headers}\r\n\r\n${text}\r\n.\r\n`, "utf8");
  await sendCommand(null, 250);
  await sendCommand("QUIT", [221, 250]);
  socket.end();
}

export async function POST(req: Request) {
  const json = await req.json().catch(() => null);
  const parsed = contactSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "invalid_input", issues: parsed.error.flatten().fieldErrors },
      { status: 400 }
    );
  }

  const { name, email, message } = parsed.data;
  const to = process.env.CONTACT_EMAIL_TO;
  const from = process.env.CONTACT_EMAIL_FROM ?? process.env.CONTACT_EMAIL_TO;
  const smtpUser = process.env.SMTP_USER;
  const smtpPass = process.env.SMTP_PASS;
  const smtpHost = process.env.SMTP_HOST ?? "smtp.gmail.com";
  const smtpPort = Number(process.env.SMTP_PORT ?? "465");

  if (!to || !from || !smtpUser || !smtpPass || !smtpHost || !smtpPort) {
    return NextResponse.json(
      { error: "missing_config", message: "メール送信設定が完了していません。" },
      { status: 500 }
    );
  }

  try {
    await sendMailViaSmtp({
      from,
      to,
      subject: `お問い合わせ: ${name}`,
      text: [
        `送信者: ${name}`,
        `メール: ${email}`,
        "",
        "----- メッセージ -----",
        message,
      ].join("\n"),
      smtp: {
        host: smtpHost,
        port: smtpPort,
        username: smtpUser,
        password: smtpPass,
      },
    });
  } catch (error) {
    console.error("SMTP send failed", error);
    return NextResponse.json(
      { error: "mail_failed", detail: String(error) },
      { status: 502 }
    );
  }

  return NextResponse.json({ ok: true });
}
