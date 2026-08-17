import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const counts = await prisma.contentItem.groupBy({
    by: ['type', 'status'],
    _count: true,
  });
  console.log(counts);
}

main().finally(() => prisma.$disconnect());
