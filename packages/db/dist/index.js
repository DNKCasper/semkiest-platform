"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.db = exports.TestStepStatus = exports.TestResultStatus = exports.TestRunStatus = exports.UserRole = exports.PrismaClient = exports.Prisma = void 0;
const client_1 = require("@prisma/client");
// Re-export all generated types and enums for consumers of this package.
var client_2 = require("@prisma/client");
Object.defineProperty(exports, "Prisma", { enumerable: true, get: function () { return client_2.Prisma; } });
Object.defineProperty(exports, "PrismaClient", { enumerable: true, get: function () { return client_2.PrismaClient; } });
Object.defineProperty(exports, "UserRole", { enumerable: true, get: function () { return client_2.UserRole; } });
Object.defineProperty(exports, "TestRunStatus", { enumerable: true, get: function () { return client_2.TestRunStatus; } });
Object.defineProperty(exports, "TestResultStatus", { enumerable: true, get: function () { return client_2.TestResultStatus; } });
Object.defineProperty(exports, "TestStepStatus", { enumerable: true, get: function () { return client_2.TestStepStatus; } });
function createPrismaClient() {
    return new client_1.PrismaClient({
        log: process.env['NODE_ENV'] === 'development'
            ? ['query', 'error', 'warn']
            : ['error'],
    });
}
exports.db = global.__prisma ?? createPrismaClient();
if (process.env['NODE_ENV'] !== 'production') {
    global.__prisma = exports.db;
}
exports.default = exports.db;
//# sourceMappingURL=index.js.map