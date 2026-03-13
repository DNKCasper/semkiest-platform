"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.Prisma = exports.prisma = void 0;
const client_1 = require("@prisma/client");
const globalForPrisma = globalThis;
/**
 * Singleton PrismaClient instance.
 * Uses a global reference in development to prevent exhausting connection pool
 * due to hot-reloading creating multiple instances.
 */
exports.prisma = globalForPrisma.prisma ??
    new client_1.PrismaClient({
        log: process.env.NODE_ENV === 'development'
            ? ['query', 'error', 'warn']
            : ['error'],
    });
if (process.env.NODE_ENV !== 'production') {
    globalForPrisma.prisma = exports.prisma;
}
exports.default = exports.prisma;
// Re-export Prisma types for convenience
var client_2 = require("@prisma/client");
Object.defineProperty(exports, "Prisma", { enumerable: true, get: function () { return client_2.Prisma; } });
//# sourceMappingURL=index.js.map