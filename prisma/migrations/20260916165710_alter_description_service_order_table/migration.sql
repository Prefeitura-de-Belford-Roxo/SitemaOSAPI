-- DropForeignKey
ALTER TABLE "service_order" DROP CONSTRAINT "service_order_patrimony_id_fkey";

-- AlterTable
ALTER TABLE "service_order" ALTER COLUMN "description" DROP NOT NULL;

-- AddForeignKey
ALTER TABLE "service_order" ADD CONSTRAINT "service_order_patrimony_id_fkey" FOREIGN KEY ("patrimony_id") REFERENCES "patrimonies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
