// Vercel serverless function — POST /api/smtp-test
// Verifies SMTP credentials server-side (nodemailer can't run in the browser).
// Ported from refresh-proxy.js. Not currently called by the app (Telegram
// notifications call Telegram's API directly), kept for parity/future use.

import { handlePreflight } from './_cors.js';
import nodemailer from 'nodemailer';

export default async function handler(req, res) {
  if (handlePreflight(req, res)) return;

  try {
    const { host, port, secure, user, pass } = req.body || {};
    if (!host || !user || !pass) {
      res.status(400).json({ error: 'host, user, and pass are required' });
      return;
    }
    const transporter = nodemailer.createTransport({
      host,
      port: Number(port) || (secure ? 465 : 587),
      secure: !!secure,
      auth: { user, pass },
    });
    await transporter.verify();
    res.status(200).json({ ok: true, message: 'SMTP connection successful' });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
}
