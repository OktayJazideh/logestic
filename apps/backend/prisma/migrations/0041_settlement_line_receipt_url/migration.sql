-- RECEIPT-PDF-1: per-line receipt PDF URL (persisted after first generate)
ALTER TABLE "settlement_lines" ADD COLUMN IF NOT EXISTS "receipt_file_url" TEXT;
