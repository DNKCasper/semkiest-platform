-- AlterTable: add status, url, and soft-delete columns to projects
ALTER TABLE "projects" ADD COLUMN "url" TEXT;
ALTER TABLE "projects" ADD COLUMN "status" TEXT NOT NULL DEFAULT 'ACTIVE';
ALTER TABLE "projects" ADD COLUMN "deleted_at" TIMESTAMP(3);
