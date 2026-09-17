import { PrismaClient } from '@prisma/client';

// Singleton instance across hot-reloads and module imports
let prisma;

if (!globalThis.__prismaClient) {
  globalThis.__prismaClient = new PrismaClient({
    log: process.env.PRISMA_LOG === 'true' ? ['query', 'info', 'warn', 'error'] : ['error']
  });
}
prisma = globalThis.__prismaClient;

export { prisma };
export default prisma;

