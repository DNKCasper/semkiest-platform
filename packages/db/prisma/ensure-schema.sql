-- ensure-schema.sql
-- Safety-net script that runs BEFORE prisma migrate deploy.
-- Ensures critical columns exist even if an earlier migration was recorded
-- as applied but its SQL actually failed.
-- All statements are idempotent — safe to run multiple times.

-- Projects table: url, status, deleted_at
ALTER TABLE "projects" ADD COLUMN IF NOT EXISTS "url" TEXT;
ALTER TABLE "projects" ADD COLUMN IF NOT EXISTS "status" TEXT NOT NULL DEFAULT 'ACTIVE';
ALTER TABLE "projects" ADD COLUMN IF NOT EXISTS "deleted_at" TIMESTAMP(3);

-- Test results table: category + duration added by 20260317120000
ALTER TABLE "test_results" ADD COLUMN IF NOT EXISTS "category" TEXT;
ALTER TABLE "test_results" ADD COLUMN IF NOT EXISTS "duration" INTEGER;

-- Users table: auth fields added by 20260315120000_add_user_auth_fields
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "name" TEXT;
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "bio" TEXT;
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "email_verified" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "email_verified_at" TIMESTAMP(3);
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "last_login_at" TIMESTAMP(3);
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "previous_passwords" TEXT[] DEFAULT ARRAY[]::TEXT[];
