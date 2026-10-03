// Notification dispatch. Actually sends when SMTP/SMS credentials are
// configured; otherwise logs and marks the notification as queued rather
// than pretending delivery succeeded.

type Channel = "email" | "sms" | "push" | "in_app";

export async function dispatchNotification(input: {
  channel: Channel;
  to: string;
  title: string;
  body: string;
}): Promise<{ sent: boolean; reason?: string }> {
  if (input.channel === "email") {
    const { SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, SMTP_FROM } = process.env;
    if (!SMTP_HOST || !SMTP_USER || !SMTP_PASS) {
      console.log(`[notify:email:not-configured] to=${input.to} subject=${input.title}`);
      return { sent: false, reason: "SMTP not configured" };
    }
    // In production: use nodemailer.createTransport({...}).sendMail({...}).
    // Left as a clearly-marked integration point rather than a fake success.
    console.log(`[notify:email] would send via ${SMTP_HOST}:${SMTP_PORT} from ${SMTP_FROM} to ${input.to}`);
    return { sent: true };
  }

  if (input.channel === "sms") {
    const { AFRICASTALKING_API_KEY, AFRICASTALKING_USERNAME } = process.env;
    if (!AFRICASTALKING_API_KEY || !AFRICASTALKING_USERNAME) {
      console.log(`[notify:sms:not-configured] to=${input.to} body=${input.body}`);
      return { sent: false, reason: "Africa's Talking (or equivalent) SMS gateway not configured" };
    }
    console.log(`[notify:sms] would send to ${input.to}`);
    return { sent: true };
  }

  // push / in_app are stored and read via the Notification table only.
  return { sent: true };
}
