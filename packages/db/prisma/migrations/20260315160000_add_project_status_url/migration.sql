-- AlterTable: add status, url, and soft-delete columns to projects
ALTER TABLE "projects" ADD COLUMN IF NOT EXISTS "url" TEXT;
ALTER TABLE "projects" ADD COLUMN IF NOT EXISTS "status" TEXT NOT NULL DEFAULT 'ACTIVE';
ALTER TABLE "projects" ADD COLUMN IF NOT EXISTS "deleted_at" TIMESTAMP(3);
