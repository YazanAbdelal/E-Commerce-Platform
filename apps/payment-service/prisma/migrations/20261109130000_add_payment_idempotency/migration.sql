-- AlterTable
ALTER TABLE "Payment" ADD COLUMN "idempotencyKey" VARCHAR;

-- CreateIndex
CREATE UNIQUE INDEX "Payment_idempotencyKey_key" ON "Payment"("idempotencyKey");
