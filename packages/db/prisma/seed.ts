import { PrismaClient, UserRole } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('Seeding database...');

  // ─── Organization ────────────────────────────────────────────────────────────
  const org = await prisma.organization.upsert({
    where: { id: 'seed-org-001' },
    update: {},
    create: {
      id: 'seed-org-001',
      name: 'Acme Corp',
    },
  });
  console.log(`Upserted organization: ${org.name} (${org.id})`);

  // ─── Users ───────────────────────────────────────────────────────────────────
  // Passwords are bcrypt hashes of "password123" (cost factor 10) — dev only.
  const ownerUser = await prisma.user.upsert({
    where: { email: 'owner@acme.com' },
    update: {},
    create: {
      email: 'owner@acme.com',
      orgId: org.id,
      role: UserRole.OWNER,
      // bcrypt hash of "password123"
      passwordHash:
        '$2b$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi',
    },
  });

  const adminUser = await prisma.user.upsert({
    where: { email: 'admin@acme.com' },
    update: {},
    create: {
      email: 'admin@acme.com',
      orgId: org.id,
      role: UserRole.ADMIN,
      passwordHash:
        '$2b$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi',
    },
  });

  const memberUser = await prisma.user.upsert({
    where: { email: 'member@acme.com' },
    update: {},
    create: {
      email: 'member@acme.com',
      orgId: org.id,
      role: UserRole.MEMBER,
      passwordHash:
        '$2b$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi',
    },
  });
  console.log(
    `Upserted users: ${ownerUser.email}, ${adminUser.email}, ${memberUser.email}`,
  );

  // ─── Projects ────────────────────────────────────────────────────────────────
  const webProject = await prisma.project.upsert({
    where: { id: 'seed-project-001' },
    update: {},
    create: {
      id: 'seed-project-001',
      orgId: org.id,
      name: 'Web Application',
      description: 'End-to-end tests for the main web application.',
    },
  });

  const apiProject = await prisma.project.upsert({
    where: { id: 'seed-project-002' },
    update: {},
    create: {
      id: 'seed-project-002',
      orgId: org.id,
      name: 'API Service',
      description: 'Integration tests for the backend REST API.',
    },
  });
  console.log(
    `Upserted projects: ${webProject.name}, ${apiProject.name}`,
  );

  // ─── Test Profiles ────────────────────────────────────────────────────────────
  const chromeProfile = await prisma.testProfile.upsert({
    where: { id: 'seed-profile-001' },
    update: {},
    create: {
      id: 'seed-profile-001',
      projectId: webProject.id,
      name: 'Chrome Desktop',
      config: {
        browser: 'chromium',
        viewport: { width: 1280, height: 720 },
        retries: 2,
        timeout: 30000,
      },
    },
  });

  const mobileProfile = await prisma.testProfile.upsert({
    where: { id: 'seed-profile-002' },
    update: {},
    create: {
      id: 'seed-profile-002',
      projectId: webProject.id,
      name: 'Mobile Safari',
      config: {
        browser: 'webkit',
        viewport: { width: 390, height: 844 },
        retries: 1,
        timeout: 45000,
      },
    },
  });
  console.log(
    `Upserted test profiles: ${chromeProfile.name}, ${mobileProfile.name}`,
  );

  // ─── Agent Config ─────────────────────────────────────────────────────────────
  const agentConfig = await prisma.agentConfig.upsert({
    where: { id: 'seed-agent-001' },
    update: {},
    create: {
      id: 'seed-agent-001',
      orgId: org.id,
      active: true,
      configJson: {
        model: 'claude-opus-4-6',
        maxTokens: 4096,
        systemPrompt: 'You are a QA automation assistant.',
        tools: ['screenshot', 'click', 'type', 'assert'],
      },
    },
  });
  console.log(`Upserted agent config (active: ${agentConfig.active})`);

  // ─── Notification ─────────────────────────────────────────────────────────────
  await prisma.notification.createMany({
    skipDuplicates: true,
    data: [
      {
        userId: ownerUser.id,
        message: 'Welcome to SemkiEst! Your organization has been set up.',
        read: true,
      },
      {
        userId: adminUser.id,
        message: 'You have been added as an admin to Acme Corp.',
        read: false,
      },
    ],
  });
  console.log('Created seed notifications');

  console.log('Seeding complete.');
}

main()
  .catch((err) => {
    console.error('Seed failed:', err);
    process.exit(1);
  })
  .finally(() => {
    void prisma.$disconnect();
  });
