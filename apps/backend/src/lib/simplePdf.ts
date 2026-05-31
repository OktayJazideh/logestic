import fs from "node:fs";
import path from "node:path";
import PDFDocument from "pdfkit";
import QRCode from "qrcode";

/** Minimal single-page PDF (Helvetica) for finance export — no external deps. */
export function buildSimplePdf(lines: string[]): Buffer {
  const escaped = lines.map((line) =>
    line
      .replace(/\\/g, "\\\\")
      .replace(/\(/g, "\\(")
      .replace(/\)/g, "\\)")
      .replace(/[^\x00-\x7F]/g, "?"),
  );
  const contentLines = ["BT", "/F1 10 Tf", "50 750 Td", "14 TL"];
  escaped.forEach((line, i) => {
    if (i > 0) contentLines.push("T*");
    contentLines.push(`(${line}) Tj`);
  });
  contentLines.push("ET");
  const stream = contentLines.join("\n");
  const streamLen = Buffer.byteLength(stream, "utf8");

  const objects = [
    "1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n",
    "2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n",
    "3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>\nendobj\n",
    `4 0 obj\n<< /Length ${streamLen} >>\nstream\n${stream}\nendstream\nendobj\n`,
    "5 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>\nendobj\n",
  ];

  let pdf = "%PDF-1.4\n";
  const offsets: number[] = [0];
  for (const obj of objects) {
    offsets.push(Buffer.byteLength(pdf, "utf8"));
    pdf += obj;
  }
  const xrefStart = Buffer.byteLength(pdf, "utf8");
  pdf += `xref\n0 ${objects.length + 1}\n`;
  pdf += "0000000000 65535 f \n";
  for (let i = 1; i <= objects.length; i++) {
    pdf += `${String(offsets[i]).padStart(10, "0")} 00000 n \n`;
  }
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\n`;
  pdf += `startxref\n${xrefStart}\n%%EOF\n`;
  return Buffer.from(pdf, "utf8");
}

export type SettlementReceiptPdfInput = {
  platformName: string;
  payeeName: string;
  ibanMasked: string;
  amountRialFa: string;
  amountTomanFa: string;
  paymentReference: string;
  paidAtFa: string;
  verifyUrl: string;
};

function resolveReceiptFontPath(): string | null {
  const candidates = [
    path.join(__dirname, "../../assets/fonts/Vazirmatn-Regular.ttf"),
    path.join(process.cwd(), "assets/fonts/Vazirmatn-Regular.ttf"),
    path.join(process.cwd(), "apps/backend/assets/fonts/Vazirmatn-Regular.ttf"),
    "C:\\Windows\\Fonts\\tahoma.ttf",
    "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
  ];
  for (const p of candidates) {
    if (fs.existsSync(p)) return p;
  }
  return null;
}

function rtlRow(doc: PDFKit.PDFDocument, label: string, value: string, rightX: number, width: number, y: number) {
  doc.fontSize(11).fillColor("#6b7280").text(`${label}:`, rightX - width, y, { width, align: "right" });
  doc.fontSize(12).fillColor("#111827").text(value, rightX - width, y + 16, { width, align: "right" });
  return y + 44;
}

/** RTL settlement receipt PDF with logo placeholder, amounts, and QR verify link. */
export async function buildSettlementReceiptPdf(input: SettlementReceiptPdfInput): Promise<Buffer> {
  const qrPng = await QRCode.toBuffer(input.verifyUrl, { type: "png", width: 128, margin: 1, errorCorrectionLevel: "M" });
  const fontPath = resolveReceiptFontPath();

  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: "A4", margin: 50, autoFirstPage: true });
    const chunks: Buffer[] = [];
    doc.on("data", (chunk: Buffer) => chunks.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    const bodyFont = fontPath ? "ReceiptFa" : "Helvetica";
    if (fontPath) doc.registerFont("ReceiptFa", fontPath);

    const pageWidth = doc.page.width;
    const margin = 50;
    const contentWidth = pageWidth - margin * 2;
    const rightX = pageWidth - margin;

    doc.save();
    doc.circle(margin + 24, 72, 22).fill("#1d4ed8");
    doc.fillColor("#ffffff").font("Helvetica-Bold").fontSize(20).text("L", margin + 16, 58);
    doc.restore();

    doc.font(bodyFont).fillColor("#111827").fontSize(18).text(input.platformName, margin + 56, 58);
    doc.font(bodyFont).fontSize(13).fillColor("#6b7280").text("رسید رسمی پرداخت تسویه", margin + 56, 82);

    doc.moveTo(margin, 112).lineTo(rightX, 112).strokeColor("#e5e7eb").stroke();

    let y = 130;
    y = rtlRow(doc, "نام دریافت‌کننده", input.payeeName, rightX, contentWidth, y);
    y = rtlRow(doc, "شماره شبا", input.ibanMasked, rightX, contentWidth, y);
    y = rtlRow(doc, "مبلغ (ریال)", input.amountRialFa, rightX, contentWidth, y);
    y = rtlRow(doc, "مبلغ (تومان)", input.amountTomanFa, rightX, contentWidth, y);
    y = rtlRow(doc, "شماره پیگیری پرداخت", input.paymentReference, rightX, contentWidth, y);
    y = rtlRow(doc, "تاریخ پرداخت", input.paidAtFa, rightX, contentWidth, y);

    doc.font(bodyFont).fontSize(11).fillColor("#6b7280").text("اسکن QR برای تأیید رسید:", rightX - contentWidth, y + 8, {
      width: contentWidth,
      align: "right",
    });
    doc.image(qrPng, rightX - 128, y + 28, { width: 128, height: 128 });

    doc.font(bodyFont).fontSize(9).fillColor("#9ca3af").text(input.verifyUrl, margin, doc.page.height - 60, {
      width: contentWidth,
      align: "center",
    });

    doc.end();
  });
}

/** @internal tests */
export function resolveReceiptFontPathForTests(): string | null {
  return resolveReceiptFontPath();
}
