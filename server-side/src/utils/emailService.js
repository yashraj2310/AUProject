import nodemailer from "nodemailer";
import { ApiError } from "./ApiError.js";

// pull these from your .env
const { SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, SMTP_FROM } = process.env;

if (!SMTP_HOST || !SMTP_PORT || !SMTP_USER || !SMTP_PASS) {
  throw new Error("Missing SMTP_* env vars");
}

// create the transporter once
const transporter = nodemailer.createTransport({
  host: SMTP_HOST,
  port: +SMTP_PORT,
  secure: SMTP_PORT === "465", // true for 465, false for other ports
  auth: { user: SMTP_USER, pass: SMTP_PASS },
});

export const emailService = {
  sendMail: async ({ to, subject, text, html }) => {
    try {
      await transporter.sendMail({
        from: SMTP_FROM || SMTP_USER,
        to,
        subject,
        text,
        html,
      });
    } catch (err) {
      console.error("✉️  emailService error:", err);
      throw new ApiError(500, "Failed to send email");
    }
  }
};
