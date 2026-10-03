import { Router } from "express";
import crypto from "node:crypto";
import { canApproveAmount } from "../lib/access-log.js";
import { getSetting } from "../lib/settings.js";
import { z } from "zod";
import { FINANCE_STAFF } from "../lib/access.js";
import { idempotent } from "../lib/idempotency.js";
import { prisma } from "../lib/prisma.js";
import { verifyStripeSignature } from "../lib/card-gateway.js";
import { requireAuth, requireRole, AuthedRequest } from "../middleware/auth.js";
import { signDocument, generateDocumentId } from "../lib/credentials.js";
import { getAccountByCode } from "../lib/ledger.js";
import { dispatchNotification } from "../lib/notify.js";

export const financeRouter = Router();

financeRouter.get("/invoices/mine", requireAuth, async (req: AuthedRequest, res) => {
  const student = await prisma.student.findUnique({ where: { userId: req.user!.id } });
  if (!student) return res.status(404).json({ message: "No student record for this account." });

  const invoices = await prisma.invoice.findMany({
    where: { studentId: student.id },
    include: { payments: true },
    orderBy: { dueDate: "desc" },
  });
  res.json(invoices);
});

financeRouter.get(
  "/invoices",
  requireAuth,
  requireRole("FINANCE_OFFICER", "ACCOUNTANT", "SUPER_ADMIN"),
  async (_req: AuthedRequest, res) => {
    const invoices = await prisma.invoice.findMany({
      include: { student: true, payments: true },
      orderBy: { dueDate: "asc" },
      take: 200,
    });
    res.json(invoices);
  }
);

const stkSchema = z.object({
  phone: z.string().regex(/^\+?\d{9,15}$/),
  amount: z.number().int().positive(),
  invoiceId: z.string().min(1),
});

// M-Pesa STK Push via Safaricom Daraja. Requires real credentials — without
// them this endpoint returns a clear configuration error instead of a fake
// success, so the frontend can surface that honestly rather than pretending
// a payment was initiated.
financeRouter.post("/mpesa/stk-push", requireAuth, async (req: AuthedRequest, res) => {
  const parsed = stkSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ message: "Enter a valid phone number and amount." });
  }

  const invoice = await prisma.invoice.findUnique({ where: { id: parsed.data.invoiceId }, include: { student: true } });
  if (!invoice) return res.status(404).json({ message: "Invoice not found." });
  const canPayForOthers = ["FINANCE_OFFICER", "ACCOUNTANT", "SUPER_ADMIN"].includes(req.user!.role);
  if (invoice.student.userId !== req.user!.id && !canPayForOthers) return res.status(403).json({ message: "You cannot pay another student's invoice." });
  const outstanding = Number(invoice.amountDue) - Number(invoice.amountPaid);
  if (outstanding <= 0 || parsed.data.amount > Math.ceil(outstanding)) return res.status(400).json({ message: "Payment amount exceeds the invoice balance." });

  const { consumerKey, consumerSecret, shortcode, passkey, callbackUrl } = {
    consumerKey: process.env.DARAJA_CONSUMER_KEY,
    consumerSecret: process.env.DARAJA_CONSUMER_SECRET,
    shortcode: process.env.DARAJA_SHORTCODE,
    passkey: process.env.DARAJA_PASSKEY,
    callbackUrl: process.env.DARAJA_CALLBACK_URL,
  };

  if (!consumerKey || !consumerSecret || !shortcode || !passkey || !callbackUrl) {
    return res.status(503).json({
      message:
        "M-Pesa payments aren't configured yet. Set DARAJA_* environment variables to enable live STK push.",
    });
  }
  const callbackToken = process.env.DARAJA_CALLBACK_TOKEN;
  const liveDaraja = process.env.DARAJA_ENV === "production" || process.env.NODE_ENV === "production";
  if (liveDaraja) {
    try {
      const configuredCallback = new URL(callbackUrl);
      if (!callbackToken || configuredCallback.protocol !== "https:" || configuredCallback.searchParams.get("token") !== callbackToken) {
        return res.status(503).json({ message: "Live Daraja requires an HTTPS callback URL containing the configured DARAJA_CALLBACK_TOKEN." });
      }
    } catch {
      return res.status(503).json({ message: "Live Daraja requires a valid HTTPS callback URL." });
    }
  }

  // SP034 — real deployments need production Daraja, not sandbox; this was
  // previously hardcoded to sandbox.safaricom.co.ke everywhere, so even a
  // fully credentialed production setup would silently keep hitting the
  // sandbox. DARAJA_ENV=production switches both endpoints below.
  const darajaBaseUrl =
    process.env.DARAJA_ENV === "production" ? "https://api.safaricom.co.ke" : "https://sandbox.safaricom.co.ke";

  try {
    const authRes = await fetch(
      `${darajaBaseUrl}/oauth/v1/generate?grant_type=client_credentials`,
      {
        headers: {
          Authorization:
            "Basic " + Buffer.from(`${consumerKey}:${consumerSecret}`).toString("base64"),
        },
      }
    );
    const authData = (await authRes.json()) as { access_token?: string };
    const access_token = authData.access_token;
    if (!authRes.ok || !access_token) throw new Error("M-Pesa authentication failed");

    const timestamp = new Date()
      .toISOString()
      .replace(/[^0-9]/g, "")
      .slice(0, 14);
    const password = Buffer.from(`${shortcode}${passkey}${timestamp}`).toString("base64");

    const stkRes = await fetch(
      `${darajaBaseUrl}/mpesa/stkpush/v1/processrequest`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${access_token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          BusinessShortCode: shortcode,
          Password: password,
          Timestamp: timestamp,
          TransactionType: "CustomerPayBillOnline",
          Amount: parsed.data.amount,
          PartyA: parsed.data.phone,
          PartyB: shortcode,
          PhoneNumber: parsed.data.phone,
          CallBackURL: callbackUrl,
          AccountReference: "MBC",
          TransactionDesc: "College fees",
        }),
      }
    );
    const stkData = (await stkRes.json()) as { CheckoutRequestID?: string; ResponseCode?: string };
    if (!stkRes.ok || stkData.ResponseCode !== "0") throw new Error("M-Pesa rejected the payment request");

    // Persist the mapping so the callback (which only carries the
    // CheckoutRequestID and amount) can find the right invoice later —
    // without this, a confirmed M-Pesa payment would have nowhere to land.
    if (stkData.CheckoutRequestID && parsed.data.invoiceId) {
      await prisma.pendingMpesaPush.create({
        data: {
          checkoutRequestId: stkData.CheckoutRequestID,
          invoiceId: parsed.data.invoiceId,
          amount: parsed.data.amount,
          phone: parsed.data.phone,
        },
      });
    }

    res.json({
      message: "STK push sent.",
      checkoutRequestId: stkData.CheckoutRequestID,
      linkedToInvoice: Boolean(stkData.CheckoutRequestID && parsed.data.invoiceId),
    });
  } catch {
    res.status(502).json({ message: "Could not reach the M-Pesa gateway. Try again shortly." });
  }
});

// Daraja calls this after the customer completes/cancels payment.
financeRouter.post("/mpesa/callback", async (req, res) => {
  if (process.env.NODE_ENV === "production" || process.env.DARAJA_ENV === "production") {
    const callbackToken = process.env.DARAJA_CALLBACK_TOKEN;
    const supplied = typeof req.query.token === "string" ? req.query.token : "";
    if (!callbackToken || !supplied) return res.status(503).json({ message: "M-Pesa callback authentication is not configured." });
    const expectedBytes = Buffer.from(callbackToken);
    const suppliedBytes = Buffer.from(supplied);
    if (expectedBytes.length !== suppliedBytes.length || !crypto.timingSafeEqual(expectedBytes, suppliedBytes)) {
      return res.status(401).json({ message: "Invalid callback token." });
    }
  }
  const body = req.body?.Body?.stkCallback;
  if (body?.ResultCode === 0) {
    const items: { Name: string; Value: string | number }[] =
      body.CallbackMetadata?.Item ?? [];
    const amount = items.find((i) => i.Name === "Amount")?.Value;
    const receiptNumber = items.find((i) => i.Name === "MpesaReceiptNumber")?.Value;
    const checkoutRequestId: string | undefined = body.CheckoutRequestID;

    // The previous version of this handler only logged the callback and
    // never created a Payment row — meaning a real M-Pesa payment would
    // complete on Safaricom's side but never actually clear the student's
    // invoice. Fixed: look up the pending STK push by CheckoutRequestID
    // (recorded when the push was issued) and record the real payment.
    if (checkoutRequestId && amount && receiptNumber) {
      const pending = await prisma.pendingMpesaPush.findUnique({ where: { checkoutRequestId } });
      if (pending && Number(amount) === Number(pending.amount)) {
        const existing = await prisma.payment.findUnique({ where: { reference: String(receiptNumber) } });
        if (!existing) {
          await recordPayment({
            invoiceId: pending.invoiceId,
            amount: Number(amount),
            method: "mpesa",
            reference: String(receiptNumber),
          });
        }
        await prisma.pendingMpesaPush.delete({ where: { checkoutRequestId } }).catch(() => undefined);
      }
    }
  }
  res.json({ ResultCode: 0, ResultDesc: "Accepted" });
});

// ---------------------------------------------------------------------------
// FN006/FN007 — card payment gateway, batch 64. Before this, "card" was a
// manual-entry-only payment method (a finance officer typing in a
// reference after the fact) — not a real gateway integration, exactly the
// gap the audit named. This is a genuine second real gateway, alongside
// M-Pesa: Stripe Checkout Sessions, called directly over HTTPS+JSON (no
// new npm dependency, same discipline as every other credentialed branch
// in this codebase). Like DARAJA_*, it returns a clear configuration error
// instead of a fake success when credentials aren't set, and has never
// executed against a real key in this sandbox (no network access). Set
// CARD_GATEWAY_SECRET_KEY / CARD_GATEWAY_WEBHOOK_SECRET / PUBLIC_BASE_URL
// to go live once a real Stripe (or Stripe-compatible) merchant account
// exists.
// ---------------------------------------------------------------------------

const cardCheckoutSchema = z.object({
  invoiceId: z.string(),
  amount: z.number().positive(),
});

financeRouter.post("/card/checkout", requireAuth, async (req: AuthedRequest, res) => {
  const parsed = cardCheckoutSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ message: "Provide invoiceId and amount." });

  const secretKey = process.env.CARD_GATEWAY_SECRET_KEY;
  const baseUrl = process.env.PUBLIC_BASE_URL ?? process.env.FRONTEND_ORIGIN?.split(",")[0]?.trim();
  if (!secretKey) {
    return res.status(503).json({
      message: "Card payments aren't configured yet. Set CARD_GATEWAY_SECRET_KEY to enable live card checkout.",
    });
  }
  if (!baseUrl || (process.env.NODE_ENV === "production" && !baseUrl.startsWith("https://"))) {
    return res.status(503).json({ message: "Set PUBLIC_BASE_URL to the institution's HTTPS site before enabling card payments." });
  }

  const invoice = await prisma.invoice.findUnique({ where: { id: parsed.data.invoiceId } });
  if (!invoice) return res.status(404).json({ message: "Invoice not found." });
  const student = await prisma.student.findUnique({ where: { id: invoice.studentId }, select: { userId: true } });
  const canPayForOthers = ["FINANCE_OFFICER", "ACCOUNTANT", "SUPER_ADMIN"].includes(req.user!.role);
  if (student?.userId !== req.user!.id && !canPayForOthers) return res.status(403).json({ message: "You cannot pay another student's invoice." });
  const outstanding = Number(invoice.amountDue) - Number(invoice.amountPaid);
  if (outstanding <= 0 || parsed.data.amount > outstanding) return res.status(400).json({ message: "Payment amount exceeds the invoice balance." });

  try {
    // Stripe's REST API takes a form-encoded body, not JSON — real
    // requirement of the actual API this is written against, not an
    // arbitrary choice.
    const body = new URLSearchParams({
      mode: "payment",
      "line_items[0][price_data][currency]": "kes",
      "line_items[0][price_data][product_data][name]": `Invoice ${invoice.id}`,
      "line_items[0][price_data][unit_amount]": String(Math.round(parsed.data.amount * 100)),
      "line_items[0][quantity]": "1",
      success_url: `${baseUrl}/student/fees?card_payment=success`,
      cancel_url: `${baseUrl}/student/fees?card_payment=cancelled`,
    });

    const sessionRes = await fetch("https://api.stripe.com/v1/checkout/sessions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${secretKey}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body,
    });
    const session = (await sessionRes.json()) as { id?: string; url?: string; error?: { message?: string } };
    if (!sessionRes.ok || !session.id) {
      return res.status(502).json({ message: session?.error?.message ?? "The card gateway rejected the request." });
    }

    await prisma.pendingCardCheckout.create({
      data: { checkoutSessionId: session.id, invoiceId: parsed.data.invoiceId, amount: parsed.data.amount },
    });

    res.json({ checkoutUrl: session.url, checkoutSessionId: session.id });
  } catch {
    res.status(502).json({ message: "Could not reach the card gateway. Try again shortly." });
  }
});

// Stripe's webhook signs its payload with a timestamp + HMAC-SHA256 over
// "<timestamp>.<raw body>" — verifying it correctly requires the *raw*
// request bytes, which is why index.ts registers express.raw() for this
// exact path before the app-wide express.json() parser runs. Without a
// real CARD_GATEWAY_WEBHOOK_SECRET configured, this honestly rejects every
// call rather than trusting an unverified body. The verification itself
// lives in lib/card-gateway.ts, where it can be unit-tested in isolation.

financeRouter.post("/card/webhook", async (req, res) => {
  const webhookSecret = process.env.CARD_GATEWAY_WEBHOOK_SECRET;
  const rawBody: Buffer = Buffer.isBuffer(req.body) ? req.body : Buffer.from(JSON.stringify(req.body ?? {}));

  if (!webhookSecret || !verifyStripeSignature(rawBody, req.headers["stripe-signature"] as string | undefined, webhookSecret)) {
    return res.status(400).json({ message: "Invalid or unconfigured webhook signature." });
  }

  let event: any;
  try {
    event = JSON.parse(rawBody.toString("utf8"));
  } catch {
    return res.status(400).json({ message: "Malformed webhook payload." });
  }

  if (event?.type === "checkout.session.completed") {
    const session = event.data?.object;
    const pending = await prisma.pendingCardCheckout.findUnique({ where: { checkoutSessionId: session.id } });
    if (pending && session.payment_status === "paid" && session.currency?.toLowerCase() === "kes" && Number(session.amount_total) === Math.round(Number(pending.amount) * 100)) {
      const reference = session.payment_intent ?? session.id;
      const existing = await prisma.payment.findUnique({ where: { reference: String(reference) } });
      if (!existing) {
        await recordPayment({
          invoiceId: pending.invoiceId,
          amount: Number(pending.amount),
          method: "card",
          reference: String(reference),
        });
      }
      await prisma.pendingCardCheckout.delete({ where: { checkoutSessionId: session.id } }).catch(() => undefined);
    }
  }

  res.json({ received: true });
});

// ---------------------------------------------------------------------------
// FN005 — payment recording, now real for every method, not just a
// (previously broken) M-Pesa callback path. Every recorded payment updates
// the invoice's amountPaid/status AND posts a real, balanced journal entry
// (Dr Cash, Cr Accounts Receivable) — the ledger and the invoice can never
// silently disagree because they're updated in the same transaction.
// ---------------------------------------------------------------------------

async function recordPayment(params: { invoiceId: string; amount: number; method: string; reference: string }) {
  return prisma.$transaction(async (tx) => {
    if (!Number.isFinite(params.amount) || params.amount <= 0) throw new Error("Payment amount must be positive.");
    const locked = await tx.$queryRaw<Array<{ id: string }>>`SELECT "id" FROM "Invoice" WHERE "id" = ${params.invoiceId} FOR UPDATE`;
    if (!locked.length) throw new Error("Invoice not found.");
    const invoice = await tx.invoice.findUnique({ where: { id: params.invoiceId } });
    if (!invoice) throw new Error("Invoice not found.");
    const outstanding = Number(invoice.amountDue) - Number(invoice.amountPaid);
    if (params.amount > outstanding + 0.000001) throw new Error("Payment exceeds the remaining invoice balance.");

    const payment = await tx.payment.create({
      data: { invoiceId: params.invoiceId, amount: params.amount, method: params.method, reference: params.reference },
    });

    const newAmountPaid = Number(invoice.amountPaid) + params.amount;
    const newStatus = newAmountPaid >= Number(invoice.amountDue) ? "paid" : "partial";
    await tx.invoice.update({
      where: { id: params.invoiceId },
      data: { amountPaid: newAmountPaid, status: newStatus },
    });

    const cash = await getAccountByCode("1000");
    const ar = await getAccountByCode("1100");
    await tx.journalEntry.create({
      data: {
        description: `Payment received — invoice ${params.invoiceId} (${params.method} ${params.reference})`,
        sourceType: "payment",
        sourceId: payment.id,
        lines: { create: [{ debitAccountId: cash.id, creditAccountId: ar.id, amount: params.amount }] },
      },
    });

    return payment;
  });
}

const manualPaymentSchema = z.object({
  invoiceId: z.string(),
  amount: z.number().positive(),
  method: z.enum(["bank", "card", "cash"]),
  reference: z.string().min(2),
});

financeRouter.post(
  "/payments",
  requireAuth,
  requireRole("FINANCE_OFFICER", "ACCOUNTANT", "SUPER_ADMIN"),
  idempotent(),
  async (req: AuthedRequest, res) => {
    const parsed = manualPaymentSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: "Provide invoiceId, amount, method, and a reference." });
    try {
      const payment = await recordPayment(parsed.data);
      // FN037 — finance audit trail. Journal entries already carry
      // sourceType/sourceId, but that's bookkeeping metadata, not an audit
      // trail: nothing recorded *who* triggered a finance action. This adds
      // that, using the same AuditLog table every other domain (compliance,
      // applications, appeals) already writes to — a real audit trail
      // means "who did what, when", queryable the same way across the app.
      await prisma.auditLog.create({
        data: {
          userId: req.user!.id,
          action: "PAYMENT_RECORDED",
          entityType: "Finance",
          entityId: payment.id,
          metadata: { invoiceId: parsed.data.invoiceId, amount: parsed.data.amount, method: parsed.data.method },
        },
      });
      res.status(201).json(payment);
    } catch (err) {
      res.status(400).json({ message: err instanceof Error ? err.message : "Could not record payment." });
    }
  }
);

// FN010 — digital receipts: signed and verifiable exactly like a
// transcript/certificate/letter, generated from a real Payment row.
financeRouter.post(
  "/receipts/:paymentId",
  requireAuth,
  requireRole("FINANCE_OFFICER", "ACCOUNTANT", "SUPER_ADMIN"),
  async (req: AuthedRequest, res) => {
    const payment = await prisma.payment.findUnique({
      where: { id: req.params.paymentId },
      include: { invoice: { include: { student: true } } },
    });
    if (!payment) return res.status(404).json({ message: "Payment not found." });

    const documentId = generateDocumentId("RCT");
    const content = { documentId, studentNumber: payment.invoice.student.studentNumber, amount: Number(payment.amount), reference: payment.reference };
    const signedHash = signDocument(content);
    const verificationUrl = `${process.env.PUBLIC_BASE_URL ?? "https://kvbdtc.ac.ke"}/verify/${documentId}`;

    const receipt = await prisma.receipt.create({
      data: { paymentId: payment.id, documentId, verificationUrl, signedHash },
    });
    res.status(201).json({ ...receipt, amount: payment.amount, reference: payment.reference, method: payment.method });
  }
);

financeRouter.get("/receipts/mine", requireAuth, async (req: AuthedRequest, res) => {
  const student = await prisma.student.findUnique({ where: { userId: req.user!.id } });
  if (!student) return res.status(404).json({ message: "No student record for this account." });
  const receipts = await prisma.receipt.findMany({
    where: { payment: { invoice: { studentId: student.id } } },
    include: { payment: true },
    orderBy: { issuedAt: "desc" },
  });
  res.json(receipts);
});

// FN009 — payment reconciliation: verifies the invariant that
// Invoice.amountPaid always equals the sum of its real Payment rows. Any
// mismatch is flagged for investigation rather than silently trusted —
// this is what catches a bug like the M-Pesa callback fixed above, if a
// similar gap is ever introduced elsewhere.
financeRouter.get(
  "/reconciliation",
  requireAuth,
  requireRole("FINANCE_OFFICER", "ACCOUNTANT", "SUPER_ADMIN"),
  async (_req: AuthedRequest, res) => {
    const invoices = await prisma.invoice.findMany({ include: { payments: true } });
    const mismatches = invoices
      .map((inv) => {
        const paymentTotal = inv.payments.reduce((s, p) => s + Number(p.amount), 0);
        return { invoiceId: inv.id, amountPaidOnInvoice: Number(inv.amountPaid), sumOfPayments: paymentTotal, matches: Math.abs(paymentTotal - Number(inv.amountPaid)) < 0.01 };
      })
      .filter((r) => !r.matches);

    res.json({ totalInvoicesChecked: invoices.length, mismatchCount: mismatches.length, mismatches });
  }
);

// ---------------------------------------------------------------------------
// FN021 — accounts receivable: a real aging report over unpaid invoice
// balances, not a static number.
// ---------------------------------------------------------------------------
financeRouter.get(
  "/accounts-receivable",
  requireAuth,
  requireRole("FINANCE_OFFICER", "ACCOUNTANT", "PRINCIPAL", "SUPER_ADMIN"),
  async (_req: AuthedRequest, res) => {
    const invoices = await prisma.invoice.findMany({
      where: { status: { in: ["unpaid", "partial", "overdue"] } },
      include: { student: { select: { fullName: true, studentNumber: true } } },
    });

    const now = Date.now();
    const aged = invoices.map((inv) => {
      const balance = Number(inv.amountDue) - Number(inv.amountPaid);
      const daysOverdue = Math.max(0, Math.floor((now - inv.dueDate.getTime()) / 86400000));
      let bucket: "current" | "0-30" | "31-60" | "61-90" | "90+";
      if (daysOverdue === 0) bucket = "current";
      else if (daysOverdue <= 30) bucket = "0-30";
      else if (daysOverdue <= 60) bucket = "31-60";
      else if (daysOverdue <= 90) bucket = "61-90";
      else bucket = "90+";
      return { invoiceId: inv.id, studentName: inv.student.fullName, studentNumber: inv.student.studentNumber, balance, daysOverdue, bucket };
    });

    const totalReceivable = aged.reduce((s, a) => s + a.balance, 0);
    const byBucket = aged.reduce<Record<string, number>>((acc, a) => {
      acc[a.bucket] = (acc[a.bucket] ?? 0) + a.balance;
      return acc;
    }, {});

    res.json({ totalReceivable, byBucket, invoices: aged });
  }
);

// FN018 — financial holds. releasedAt === null is the only source of
// truth for "active" — placing a hold restricts letter/transcript issuance
// (enforced in credentials.ts), never silently.
const holdSchema = z.object({ studentId: z.string(), reason: z.string().min(3) });

financeRouter.post(
  "/holds",
  requireAuth,
  requireRole("FINANCE_OFFICER", "ACCOUNTANT", "SUPER_ADMIN"),
  async (req: AuthedRequest, res) => {
    const parsed = holdSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: "Provide studentId and a reason." });
    const hold = await prisma.financialHold.create({
      data: { studentId: parsed.data.studentId, reason: parsed.data.reason, placedById: req.user!.id },
    });
    res.status(201).json(hold);
  }
);

financeRouter.get("/holds/:studentId", requireAuth, requireRole("FINANCE_OFFICER", "ACCOUNTANT", "REGISTRAR", "SUPER_ADMIN"), async (req: AuthedRequest, res) => {
  const holds = await prisma.financialHold.findMany({
    where: { studentId: req.params.studentId },
    orderBy: { placedAt: "desc" },
  });
  res.json(holds);
});

financeRouter.patch(
  "/holds/:id/release",
  requireAuth,
  requireRole("FINANCE_OFFICER", "ACCOUNTANT", "SUPER_ADMIN"),
  async (req: AuthedRequest, res) => {
    const hold = await prisma.financialHold.update({
      where: { id: req.params.id },
      data: { releasedById: req.user!.id, releasedAt: new Date() },
    });
    res.json(hold);
  }
);

// FN019 — financial clearance as its own standalone check, not just a
// condition buried inside the graduation audit (graduation.ts computes the
// same feeBalance figure but only as one of four gates toward eligibility
// to graduate). This is the thing a finance officer actually needs day to
// day: "is this specific student currently clear on fees, right now" —
// answerable for any student at any point in their programme, not only at
// the end of it. Clear means both a non-positive fee balance AND no active
// financial hold; either one alone can block issuance elsewhere
// (credentials.ts already gates on the hold specifically).
async function computeFinancialClearance(studentId: string) {
  const invoices = await prisma.invoice.findMany({ where: { studentId } });
  const feeBalance = invoices.reduce(
    (sum, inv) => sum + Number(inv.amountDue) - Number(inv.amountPaid),
    0
  );
  const activeHold = await prisma.financialHold.findFirst({
    where: { studentId, releasedAt: null },
    orderBy: { placedAt: "desc" },
  });
  const feeClearance = feeBalance <= 0;
  return {
    clear: feeClearance && !activeHold,
    feeBalance,
    feeClearance,
    activeHold: activeHold ? { id: activeHold.id, reason: activeHold.reason, placedAt: activeHold.placedAt } : null,
  };
}

financeRouter.get(
  "/clearance/:studentId",
  requireAuth,
  requireRole("FINANCE_OFFICER", "ACCOUNTANT", "REGISTRAR", "SUPER_ADMIN"),
  async (req: AuthedRequest, res) => {
    const student = await prisma.student.findUnique({ where: { id: req.params.studentId } });
    if (!student) return res.status(404).json({ message: "Student not found." });
    res.json(await computeFinancialClearance(req.params.studentId));
  }
);

// ---------------------------------------------------------------------------
// FN012 — refund management: request/approval, never a single-actor edit.
// Approval posts a real reversing journal entry (Dr Revenue, Cr Cash — the
// institution is giving cash back out) and reduces the invoice's
// amountPaid so the invoice, the ledger, and the refund all agree.
// ---------------------------------------------------------------------------

const refundRequestSchema = z.object({
  paymentId: z.string(),
  amount: z.number().positive(),
  reason: z.string().min(5),
});

financeRouter.post(
  "/refunds",
  requireAuth,
  requireRole("FINANCE_OFFICER", "ACCOUNTANT", "SUPER_ADMIN"),
  async (req: AuthedRequest, res) => {
    const parsed = refundRequestSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: "Provide paymentId, amount, and a reason." });

    const payment = await prisma.payment.findUnique({ where: { id: parsed.data.paymentId } });
    if (!payment) return res.status(404).json({ message: "Payment not found." });
    if (parsed.data.amount > Number(payment.amount)) {
      return res.status(400).json({ message: "Refund amount cannot exceed the original payment." });
    }

    const request = await prisma.refundRequest.create({
      data: { ...parsed.data, requestedById: req.user!.id },
    });
    res.status(201).json(request);
  }
);

financeRouter.get(
  "/refunds/pending",
  requireAuth,
  requireRole("FINANCE_OFFICER", "SUPER_ADMIN"),
  async (_req: AuthedRequest, res) => {
    const pending = await prisma.refundRequest.findMany({
      where: { status: "pending" },
      include: { payment: { include: { invoice: { include: { student: true } } } } },
      orderBy: { createdAt: "asc" },
    });
    res.json(pending);
  }
);

const refundDecisionSchema = z.object({ decision: z.enum(["approved", "rejected"]), decisionNote: z.string().optional() });

financeRouter.patch(
  "/refunds/:id/decide",
  requireAuth,
  requireRole("FINANCE_OFFICER", "SUPER_ADMIN"),
  async (req: AuthedRequest, res) => {
    const parsed = refundDecisionSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: "Choose approved or rejected." });

    const request = await prisma.refundRequest.findUnique({ where: { id: req.params.id }, include: { payment: true } });
    if (!request) return res.status(404).json({ message: "Refund request not found." });
    if (request.status !== "pending") return res.status(409).json({ message: "Already decided." });
    if (request.requestedById === req.user!.id) {
      return res.status(403).json({ message: "The requester cannot also approve their own refund." });
    }
    if (parsed.data.decision === "approved" && !canApproveAmount(req.user!.role, Number(request.amount), (await getSetting("finance.limits")).refundApprovalLimitKes)) {
      return res.status(403).json({ message: "This refund is above the approval limit and needs the Principal or a Super Admin." }); // KFEAT-052
    }

    const updated = await prisma.$transaction(async (tx) => {
      const decision = await tx.refundRequest.update({
        where: { id: req.params.id },
        data: { status: parsed.data.decision, decidedById: req.user!.id, decidedAt: new Date(), decisionNote: parsed.data.decisionNote },
      });

      if (parsed.data.decision === "approved") {
        const revenue = await getAccountByCode("3000");
        const cash = await getAccountByCode("1000");
        await tx.journalEntry.create({
          data: {
            description: `Refund approved — payment ${request.paymentId}: ${request.reason}`,
            sourceType: "refund",
            sourceId: request.id,
            lines: { create: [{ debitAccountId: revenue.id, creditAccountId: cash.id, amount: Number(request.amount) }] },
          },
        });
        const invoice = await tx.invoice.findUnique({ where: { id: request.payment.invoiceId } });
        if (invoice) {
          const newAmountPaid = Math.max(0, Number(invoice.amountPaid) - Number(request.amount));
          await tx.invoice.update({
            where: { id: invoice.id },
            data: { amountPaid: newAmountPaid, status: newAmountPaid >= Number(invoice.amountDue) ? "paid" : newAmountPaid > 0 ? "partial" : "unpaid" },
          });
        }
      }

      return decision;
    });

    // FN037 — finance audit trail (see the payments/recordPayment note above).
    await prisma.auditLog.create({
      data: {
        userId: req.user!.id,
        action: parsed.data.decision === "approved" ? "REFUND_APPROVED" : "REFUND_REJECTED",
        entityType: "Finance",
        entityId: request.id,
        metadata: { paymentId: request.paymentId, amount: Number(request.amount), note: parsed.data.decisionNote },
      },
    });

    res.json(updated);
  }
);

// ---------------------------------------------------------------------------
// FN013 — payment reversal: for a payment that was recorded in error
// entirely (wrong invoice, duplicate entry, wrong amount) rather than a
// deliberate refund. Posts the exact opposite of the original payment
// entry (Dr Accounts Receivable, Cr Cash) and reduces the invoice balance
// back down. A payment can only be reversed once.
// ---------------------------------------------------------------------------

const reversalSchema = z.object({ reason: z.string().min(5) });

financeRouter.patch(
  "/payments/:id/reverse",
  requireAuth,
  requireRole("FINANCE_OFFICER", "SUPER_ADMIN"),
  async (req: AuthedRequest, res) => {
    const parsed = reversalSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: "Provide a reason for the reversal." });

    const payment = await prisma.payment.findUnique({ where: { id: req.params.id } });
    if (!payment) return res.status(404).json({ message: "Payment not found." });
    if (payment.reversedAt) return res.status(409).json({ message: "This payment was already reversed." });

    const updated = await prisma.$transaction(async (tx) => {
      const cash = await getAccountByCode("1000");
      const ar = await getAccountByCode("1100");
      await tx.journalEntry.create({
        data: {
          description: `Payment reversed — ${payment.method} ${payment.reference}: ${parsed.data.reason}`,
          sourceType: "reversal",
          sourceId: payment.id,
          lines: { create: [{ debitAccountId: ar.id, creditAccountId: cash.id, amount: Number(payment.amount) }] },
        },
      });

      const invoice = await tx.invoice.findUnique({ where: { id: payment.invoiceId } });
      if (invoice) {
        const newAmountPaid = Math.max(0, Number(invoice.amountPaid) - Number(payment.amount));
        await tx.invoice.update({
          where: { id: invoice.id },
          data: { amountPaid: newAmountPaid, status: newAmountPaid >= Number(invoice.amountDue) ? "paid" : newAmountPaid > 0 ? "partial" : "unpaid" },
        });
      }

      return tx.payment.update({ where: { id: payment.id }, data: { reversedAt: new Date(), reversalReason: parsed.data.reason } });
    });

    // FN037 — finance audit trail (see the payments/recordPayment note above).
    await prisma.auditLog.create({
      data: {
        userId: req.user!.id,
        action: "PAYMENT_REVERSED",
        entityType: "Finance",
        entityId: payment.id,
        metadata: { amount: Number(payment.amount), reason: parsed.data.reason },
      },
    });

    res.json(updated);
  }
);

// ---------------------------------------------------------------------------
// FN014 — installment plans: a real, persisted schedule. The schedule
// total is validated against the invoice's actual outstanding balance at
// creation time — it can't be built for an amount disconnected from what's
// really owed.
// ---------------------------------------------------------------------------

const installmentPlanSchema = z.object({
  invoiceId: z.string(),
  installments: z.array(z.object({ dueDate: z.string().datetime(), amount: z.number().positive() })).min(1),
});

financeRouter.post(
  "/installment-plans",
  requireAuth,
  requireRole("FINANCE_OFFICER", "ACCOUNTANT", "SUPER_ADMIN"),
  async (req: AuthedRequest, res) => {
    const parsed = installmentPlanSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: "Provide invoiceId and at least one installment." });

    const invoice = await prisma.invoice.findUnique({ where: { id: parsed.data.invoiceId } });
    if (!invoice) return res.status(404).json({ message: "Invoice not found." });

    const scheduledTotal = parsed.data.installments.reduce((s, i) => s + i.amount, 0);
    const outstanding = Number(invoice.amountDue) - Number(invoice.amountPaid);
    if (Math.abs(scheduledTotal - outstanding) > 0.01) {
      return res.status(400).json({ message: `Installments must sum to the outstanding balance of ${outstanding}, not ${scheduledTotal}.` });
    }

    const plan = await prisma.installmentPlan.create({
      data: {
        invoiceId: parsed.data.invoiceId,
        createdById: req.user!.id,
        items: { create: parsed.data.installments.map((i) => ({ dueDate: new Date(i.dueDate), amount: i.amount })) },
      },
      include: { items: true },
    });
    res.status(201).json(plan);
  }
);

financeRouter.get("/installment-plans/:invoiceId", requireAuth, async (req: AuthedRequest, res) => {
  // KSEC-007 — this returned any invoice's plan to any signed-in user. Owner or finance staff only.
  const owner = await prisma.invoice.findUnique({ where: { id: req.params.invoiceId }, select: { student: { select: { userId: true } } } });
  if (!owner || (owner.student.userId !== req.user!.id && !FINANCE_STAFF.has(req.user!.role))) return res.status(404).json({ message: "Invoice not found.", code: "NOT_FOUND" });
  const plan = await prisma.installmentPlan.findFirst({
    where: { invoiceId: req.params.invoiceId },
    include: { items: { orderBy: { dueDate: "asc" } } },
    orderBy: { createdAt: "desc" },
  });
  res.json(plan);
});

financeRouter.patch("/installment-plans/items/:id/pay", requireAuth, requireRole("FINANCE_OFFICER", "ACCOUNTANT", "SUPER_ADMIN"), async (req: AuthedRequest, res) => {
  const item = await prisma.installmentScheduleItem.update({
    where: { id: req.params.id },
    data: { paidAt: new Date() },
  });
  res.json(item);
});

// ---------------------------------------------------------------------------
// FN020 — automated reminders. Honest about what this actually is: an
// on-demand, admin-triggered action that scans real overdue invoices and
// overdue installment items and creates real Notification rows (dispatched
// through dispatchNotification, which itself is honest about whether SMTP/
// SMS is actually configured). There is no cron/scheduler in this sandbox
// to run this automatically on a timer — a real deployment would put this
// exact logic behind one.
// ---------------------------------------------------------------------------

financeRouter.post(
  "/reminders/run",
  requireAuth,
  requireRole("FINANCE_OFFICER", "SUPER_ADMIN"),
  async (_req: AuthedRequest, res) => {
    const now = new Date();
    const overdueInvoices = await prisma.invoice.findMany({
      where: { status: { in: ["unpaid", "partial"] }, dueDate: { lt: now } },
      include: { student: { include: { user: true } } },
    });
    const overdueInstallments = await prisma.installmentScheduleItem.findMany({
      where: { paidAt: null, dueDate: { lt: now } },
      include: { plan: { include: { invoice: { include: { student: { include: { user: true } } } } } } },
    });

    let created = 0;
    for (const inv of overdueInvoices) {
      const balance = Number(inv.amountDue) - Number(inv.amountPaid);
      await prisma.notification.create({
        data: {
          userId: inv.student.userId,
          channel: "in_app",
          title: "Overdue fee balance",
          body: `Your invoice balance of KES ${balance.toLocaleString()} was due ${inv.dueDate.toLocaleDateString()}.`,
        },
      });
      await dispatchNotification({ channel: "email", to: inv.student.user.email, title: "Overdue fee balance", body: `Balance of KES ${balance}` });
      created++;
    }
    for (const item of overdueInstallments) {
      const student = item.plan.invoice.student;
      await prisma.notification.create({
        data: {
          userId: student.userId,
          channel: "in_app",
          title: "Overdue installment",
          body: `An installment of KES ${Number(item.amount).toLocaleString()} was due ${item.dueDate.toLocaleDateString()}.`,
        },
      });
      created++;
    }

    res.json({ remindersCreated: created, overdueInvoiceCount: overdueInvoices.length, overdueInstallmentCount: overdueInstallments.length });
  }
);

// ---------------------------------------------------------------------------
// FN003 — student invoices. Real gap found while building this: no route
// anywhere in the entire backend (not even the seed script) ever created
// an Invoice — the model existed with no writer at all. amountDue is
// computed from real FeeStructureItem rows for the student's actual
// programme and semester, minus any real Scholarship/sponsorship/discount
// on record for that student and semester — never a manually-typed total
// disconnected from the fee structure, though an explicit override is
// still allowed for genuine one-off cases (clearly logged as an override).
// ---------------------------------------------------------------------------
const invoiceSchema = z.object({
  studentId: z.string(),
  semester: z.string().min(2),
  semesterNumber: z.number().int().positive(),
  dueDate: z.string().datetime(),
  overrideAmount: z.number().positive().optional(),
});

financeRouter.post(
  "/invoices",
  requireAuth,
  requireRole("FINANCE_OFFICER", "ACCOUNTANT", "SUPER_ADMIN"),
  async (req: AuthedRequest, res) => {
    const parsed = invoiceSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: "Provide studentId, semester, semesterNumber, and dueDate." });

    const student = await prisma.student.findUnique({ where: { id: parsed.data.studentId } });
    if (!student) return res.status(404).json({ message: "Student not found." });

    let amountDue: number;
    let feeBreakdown: { item: string; amount: number }[] = [];
    if (parsed.data.overrideAmount !== undefined) {
      amountDue = parsed.data.overrideAmount;
    } else {
      const feeItems = await prisma.feeStructureItem.findMany({
        where: { programmeId: student.programmeId, semester: parsed.data.semesterNumber },
      });
      const scholarships = await prisma.scholarship.findMany({
        where: { studentId: student.id, semester: parsed.data.semester },
      });
      const feeTotal = feeItems.reduce((s, i) => s + Number(i.amount), 0);
      const discountTotal = scholarships.reduce((s, sc) => s + Number(sc.amount), 0);
      amountDue = Math.max(0, feeTotal - discountTotal);
      feeBreakdown = feeItems.map((i) => ({ item: i.item, amount: Number(i.amount) }));
      if (feeItems.length === 0) {
        return res.status(400).json({
          message: `No fee structure items found for this programme/semester ${parsed.data.semesterNumber} — set up the fee structure first, or provide overrideAmount for a one-off charge.`,
        });
      }
    }

    const invoice = await prisma.invoice.create({
      data: {
        studentId: student.id,
        semester: parsed.data.semester,
        amountDue,
        dueDate: new Date(parsed.data.dueDate),
      },
    });

    res.status(201).json({ invoice, feeBreakdown, wasOverride: parsed.data.overrideAmount !== undefined });
  }
);

financeRouter.get(
  "/invoices",
  requireAuth,
  requireRole("FINANCE_OFFICER", "ACCOUNTANT", "SUPER_ADMIN"),
  async (req: AuthedRequest, res) => {
    const studentId = typeof req.query.studentId === "string" ? req.query.studentId : undefined;
    const invoices = await prisma.invoice.findMany({
      where: studentId ? { studentId } : undefined,
      include: { student: { select: { fullName: true, studentNumber: true } } },
      orderBy: { createdAt: "desc" },
      take: 200,
    });
    res.json(invoices);
  }
);
