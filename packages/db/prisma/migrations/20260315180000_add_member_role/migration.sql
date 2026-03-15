-- AlterEnum: add MEMBER value to UserRole enum
ALTER TYPE "UserRole" ADD VALUE IF NOT EXISTS 'MEMBER';
