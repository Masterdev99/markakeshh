// Vercel serverless function — POST /api/smtp-forward
// Forwards an email via SMTP server-side. Ported from refresh-proxy.js. Not
// currently called by the app (Telegram notifications call Telegram's API
// directly), kept for parity/future use.

import { handlePreflight } from './_cors.js';
import nodemailer from 'nodemailer';

export default async function handler(req, res) {
  if (handlePreflight(req, res)) return;

  try {
    const { smtp, message } = req.body || {};
    const { host, port, secure, user, pass } = smtp || {};
    if (!host || !user || !pass) {
      res.status(400).json({ error: 'smtp.host, smtp.user, and smtp.pass are required' });
      return;
    }
    if (!message || !message.to || !message.subject || !message.html) {
      res.status(400).json({ error: 'message.to, message.subject, and message.html are required' });
      return;
    }

    const transporter = nodemailer.createTransport({
      host,
      port: Number(port) || (secure ? 465 : 587),
      secure: !!secure,
      auth: { user, pass },
    });

    const attachments = (message.attachments || []).map((a) => ({
      filename: a.name,
      content: Buffer.from(a.contentBytes, 'base64'),
      contentType: a.contentType,
    }));

    await transporter.sendMail({
      from: message.from || user,
      to: message.to,
      subject: `${message.subject}`,
      html: message.html,
      attachments,
    });

    res.status(200).json({ ok: true, message: 'Forwarded via SMTP' });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
}
