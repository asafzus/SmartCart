-- CreateTable
CREATE TABLE "product_promos" (
    "id" TEXT NOT NULL,
    "product_barcode" TEXT NOT NULL,
    "chain_id" TEXT NOT NULL,
    "promotion_id" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "discounted_price" DOUBLE PRECISION,
    "discounted_price_per_mida" DOUBLE PRECISION,
    "min_qty" DOUBLE PRECISION NOT NULL DEFAULT 1,
    "max_qty" DOUBLE PRECISION,
    "min_purchase_amount" DOUBLE PRECISION,
    "start_date" TIMESTAMP(3) NOT NULL,
    "end_date" TIMESTAMP(3) NOT NULL,
    "is_coupon" BOOLEAN NOT NULL DEFAULT false,
    "club_id" TEXT NOT NULL DEFAULT '0',
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "product_promos_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "product_promos_product_barcode_chain_id_promotion_id_key"
    ON "product_promos"("product_barcode", "chain_id", "promotion_id");

-- CreateIndex (speeds up per-chain delete during sync and per-product lookups)
CREATE INDEX "product_promos_chain_id_idx" ON "product_promos"("chain_id");
CREATE INDEX "product_promos_product_barcode_idx" ON "product_promos"("product_barcode");
CREATE INDEX "product_promos_end_date_idx" ON "product_promos"("end_date");

-- AddForeignKey
ALTER TABLE "product_promos" ADD CONSTRAINT "product_promos_product_barcode_fkey"
    FOREIGN KEY ("product_barcode") REFERENCES "products"("barcode") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_promos" ADD CONSTRAINT "product_promos_chain_id_fkey"
    FOREIGN KEY ("chain_id") REFERENCES "chains"("id") ON DELETE CASCADE ON UPDATE CASCADE;
