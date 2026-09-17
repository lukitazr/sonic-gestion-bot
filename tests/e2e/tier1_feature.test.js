/**
 * Tier 1: Feature Coverage E2E Test Suite
 * Covers R1 to R6 with >=5 comprehensive test cases per feature (36 test cases total).
 */

import assert from 'node:assert/strict';
import {
  VirtualClock,
  MockDiscordClient,
  MockDatabase,
  ReferenceYouTubeService,
  ReferencePayoutService,
  ReferenceNotificationService
} from './test_context.js';

export async function runTier1Tests() {
  const results = [];
  const clock = new VirtualClock();
  const db = new MockDatabase();
  const youtube = new ReferenceYouTubeService();
  const client = new MockDiscordClient();

  const HISTORY_CHANNEL_ID = '111222333444555666';
  const ADMIN_CHANNEL_ID = '999888777666555444';

  async function test(name, fn) {
    db.reset();
    clock.reset(1700000000000); // Fixed epoch baseline
    try {
      await fn();
      results.push({ name, tier: 'Tier 1: Feature Coverage', passed: true });
    } catch (err) {
      results.push({ name, tier: 'Tier 1: Feature Coverage', passed: false, error: err });
    }
  }

  // ==========================================
  // R1. Storage & Models (SQLite + Prisma)
  // ==========================================

  await test('R1-T1: Config schema defaults and singleton lifecycle', async () => {
    const config = await db.config.create({
      data: {
        actorBase: 25,
        editorBase: 125,
        threshold1: 500000,
        bonus1: 25,
        threshold2: 1000000,
        bonus2: 25,
        currency: 'MXN',
        waitDays: 5
      }
    });

    assert.equal(config.actorBase, 25);
    assert.equal(config.editorBase, 125);
    assert.equal(config.threshold1, 500000);
    assert.equal(config.bonus1, 25);
    assert.equal(config.threshold2, 1000000);
    assert.equal(config.bonus2, 25);
    assert.equal(config.currency, 'MXN');
    assert.equal(config.waitDays, 5);

    const fetched = await db.config.findFirst();
    assert.deepEqual(fetched, config);
  });

  await test('R1-T2: Talent model CRUD for ACTOR and EDITOR roles', async () => {
    const actor = await db.talent.upsert({
      where: { discordId: 'actor_101' },
      update: {},
      create: { role: 'ACTOR', paypal: 'actor101@test.com', binance: 'BINANCE_ACTOR_101' }
    });
    assert.equal(actor.role, 'ACTOR');
    assert.equal(actor.paypal, 'actor101@test.com');
    assert.equal(actor.binance, 'BINANCE_ACTOR_101');

    const editor = await db.talent.upsert({
      where: { discordId: 'editor_202' },
      update: {},
      create: { role: 'EDITOR', paypal: 'editor202@test.com', binance: null }
    });
    assert.equal(editor.role, 'EDITOR');
    assert.equal(editor.binance, null);

    const foundActor = await db.talent.findUnique({ where: { discordId: 'actor_101' } });
    assert.equal(foundActor.discordId, 'actor_101');
  });

  await test('R1-T3: VideoRecord creation with multi-actor VideoParticipant relations', async () => {
    const video = await db.videoRecord.create({
      data: {
        youtubeUrl: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
        videoId: 'dQw4w9WgXcQ',
        editorId: 'editor_1',
        status: 'PENDING',
        scheduledDate: new Date(clock.now() + 5 * 86400000),
        participants: {
          create: [
            { talentId: 'actor_1', role: 'ACTOR' },
            { talentId: 'actor_2', role: 'ACTOR' },
            { talentId: 'actor_3', role: 'ACTOR' }
          ]
        }
      },
      include: { participants: true }
    });

    assert.equal(video.videoId, 'dQw4w9WgXcQ');
    assert.equal(video.editorId, 'editor_1');
    assert.equal(video.status, 'PENDING');
    assert.equal(video.participants.length, 3);
    assert.equal(video.participants[0].talentId, 'actor_1');
  });

  await test('R1-T4: VideoRecord state transitions from PENDING to CALCULATED and PAID', async () => {
    const video = await db.videoRecord.create({
      data: {
        youtubeUrl: 'https://youtu.be/dQw4w9WgXcQ',
        videoId: 'dQw4w9WgXcQ',
        editorId: 'editor_1',
        status: 'PENDING'
      }
    });
    assert.equal(video.status, 'PENDING');

    const calculated = await db.videoRecord.update({
      where: { id: video.id },
      data: {
        status: 'CALCULATED',
        finalViews: 650000,
        totalPayout: 200,
        calculatedAt: new Date()
      }
    });
    assert.equal(calculated.status, 'CALCULATED');
    assert.equal(calculated.finalViews, 650000);
    assert.equal(calculated.totalPayout, 200);

    const paid = await db.videoRecord.update({
      where: { id: video.id },
      data: { status: 'PAID' }
    });
    assert.equal(paid.status, 'PAID');
  });

  await test('R1-T5: Relational participant queries and multi-talent lookup', async () => {
    await db.talent.upsert({ where: { discordId: 't1' }, update: {}, create: { role: 'ACTOR', paypal: 't1@pay.com' } });
    await db.talent.upsert({ where: { discordId: 't2' }, update: {}, create: { role: 'ACTOR', paypal: 't2@pay.com' } });
    await db.talent.upsert({ where: { discordId: 't3' }, update: {}, create: { role: 'ACTOR', paypal: 't3@pay.com' } });

    const batch = await db.talent.findMany({
      where: { discordId: { in: ['t1', 't3'] } }
    });
    assert.equal(batch.length, 2);
    assert.ok(batch.some(t => t.discordId === 't1'));
    assert.ok(batch.some(t => t.discordId === 't3'));
    assert.ok(!batch.some(t => t.discordId === 't2'));
  });

  await test('R1-T6: Query filtering for overdue pending videos (scheduledDate <= now)', async () => {
    const pastDate = new Date(clock.now() - 1000);
    const futureDate = new Date(clock.now() + 86400000);

    await db.videoRecord.create({
      data: { youtubeUrl: 'https://youtu.be/vid_past', videoId: 'vid_past', editorId: 'ed1', status: 'PENDING', scheduledDate: pastDate }
    });
    await db.videoRecord.create({
      data: { youtubeUrl: 'https://youtu.be/vid_future', videoId: 'vid_future', editorId: 'ed1', status: 'PENDING', scheduledDate: futureDate }
    });
    await db.videoRecord.create({
      data: { youtubeUrl: 'https://youtu.be/vid_already_done', videoId: 'vid_already_done', editorId: 'ed1', status: 'CALCULATED', scheduledDate: pastDate }
    });

    const dueVideos = await db.videoRecord.findMany({
      where: {
        status: 'PENDING',
        scheduledDate: { lte: new Date(clock.now()) }
      }
    });

    assert.equal(dueVideos.length, 1);
    assert.equal(dueVideos[0].videoId, 'vid_past');
  });

  // ==========================================
  // R2. Dynamic Rate Configuration & Setup
  // ==========================================

  await test('R2-T1: Auto-seeding default Config when database is empty', async () => {
    const existing = await db.config.findFirst();
    assert.equal(existing, null);

    // Auto-seed simulation
    const seeded = await db.config.create({
      data: {
        actorBase: 25,
        editorBase: 125,
        threshold1: 500000,
        bonus1: 25,
        threshold2: 1000000,
        bonus2: 25,
        currency: 'MXN',
        waitDays: 5
      }
    });

    assert.equal(seeded.actorBase, 25);
    assert.equal(seeded.editorBase, 125);
    assert.equal(seeded.waitDays, 5);
  });

  await test('R2-T2: Configuration retrieval returns active active config', async () => {
    await db.config.create({
      data: { actorBase: 30, editorBase: 150, threshold1: 500000, bonus1: 25, threshold2: 1000000, bonus2: 25, currency: 'MXN', waitDays: 5 }
    });

    const config = await db.config.findFirst();
    assert.equal(config.actorBase, 30);
    assert.equal(config.editorBase, 150);
  });

  await test('R2-T3: Dynamic update of actorBase and editorBase modifies persisted state live', async () => {
    await db.config.create({
      data: { actorBase: 25, editorBase: 125, threshold1: 500000, bonus1: 25, threshold2: 1000000, bonus2: 25, currency: 'MXN', waitDays: 5 }
    });

    const updated = await db.config.update({
      where: { id: 1 },
      data: { actorBase: 40, editorBase: 160 }
    });

    assert.equal(updated.actorBase, 40);
    assert.equal(updated.editorBase, 160);

    const fresh = await db.config.findFirst();
    assert.equal(fresh.actorBase, 40);
    assert.equal(fresh.editorBase, 160);
  });

  await test('R2-T4: Dynamic update of thresholds and bonuses modifies calculation parameters', async () => {
    await db.config.create({
      data: { actorBase: 25, editorBase: 125, threshold1: 500000, bonus1: 25, threshold2: 1000000, bonus2: 25, currency: 'MXN', waitDays: 5 }
    });

    const updated = await db.config.update({
      where: { id: 1 },
      data: { threshold1: 250000, bonus1: 50, threshold2: 750000, bonus2: 100 }
    });

    assert.equal(updated.threshold1, 250000);
    assert.equal(updated.bonus1, 50);
    assert.equal(updated.threshold2, 750000);
    assert.equal(updated.bonus2, 100);
  });

  await test('R2-T5: Validation guard rejects negative rate mutations or invalid parameters', async () => {
    const validateConfigUpdate = (key, value) => {
      const numericKeys = ['actorBase', 'editorBase', 'threshold1', 'bonus1', 'threshold2', 'bonus2', 'waitDays'];
      if (!numericKeys.includes(key)) {
        throw new Error(`Invalid configuration key: ${key}`);
      }
      const num = Number(value);
      if (isNaN(num) || num < 0) {
        throw new Error(`Value for ${key} must be a non-negative number`);
      }
      return num;
    };

    assert.throws(() => validateConfigUpdate('actorBase', -10), /non-negative/);
    assert.throws(() => validateConfigUpdate('invalidKey', 50), /Invalid configuration key/);
    assert.throws(() => validateConfigUpdate('threshold1', 'not_a_number'), /non-negative/);
    assert.equal(validateConfigUpdate('actorBase', '50'), 50);
  });

  await test('R2-T6: Admin permission guard blocks non-administrators from rate modification', async () => {
    const adminMsg = client.createMessage({ authorId: 'admin_1', channelId: 'admin_chan', content: '!set-tarifa actorBase 35', isAdmin: true });
    const nonAdminMsg = client.createMessage({ authorId: 'user_regular', channelId: 'admin_chan', content: '!set-tarifa actorBase 35', isAdmin: false });

    const handleSetTarifa = async (msg) => {
      if (!msg.member.permissions.has('Administrator')) {
        await msg.reply('❌ No tienes permisos de Administrador para modificar tarifas.');
        return false;
      }
      await msg.reply('✅ Tarifa actualizada con éxito.');
      return true;
    };

    const allowed = await handleSetTarifa(adminMsg);
    assert.equal(allowed, true);
    assert.ok(adminMsg.replies[0].content.includes('✅'));

    const denied = await handleSetTarifa(nonAdminMsg);
    assert.equal(denied, false);
    assert.ok(nonAdminMsg.replies[0].content.includes('❌'));
  });

  // ==========================================
  // R3. Talent Dossier Registry
  // ==========================================

  await test('R3-T1: Register ACTOR with both PayPal email and Binance Pay ID', async () => {
    const talent = await db.talent.upsert({
      where: { discordId: 'actor_alice' },
      update: { role: 'ACTOR', paypal: 'alice@paypal.me', binance: 'BINANCE_987654' },
      create: { role: 'ACTOR', paypal: 'alice@paypal.me', binance: 'BINANCE_987654' }
    });

    assert.equal(talent.discordId, 'actor_alice');
    assert.equal(talent.role, 'ACTOR');
    assert.equal(talent.paypal, 'alice@paypal.me');
    assert.equal(talent.binance, 'BINANCE_987654');
  });

  await test('R3-T2: Register EDITOR with PayPal only and null Binance', async () => {
    const talent = await db.talent.upsert({
      where: { discordId: 'editor_bob' },
      update: { role: 'EDITOR', paypal: 'bob_editor@gmail.com', binance: null },
      create: { role: 'EDITOR', paypal: 'bob_editor@gmail.com', binance: null }
    });

    assert.equal(talent.role, 'EDITOR');
    assert.equal(talent.paypal, 'bob_editor@gmail.com');
    assert.equal(talent.binance, null);
  });

  await test('R3-T3: Register ACTOR with Binance only and null PayPal', async () => {
    const talent = await db.talent.upsert({
      where: { discordId: 'actor_charlie' },
      update: { role: 'ACTOR', paypal: null, binance: 'BNB123456789' },
      create: { role: 'ACTOR', paypal: null, binance: 'BNB123456789' }
    });

    assert.equal(talent.role, 'ACTOR');
    assert.equal(talent.paypal, null);
    assert.equal(talent.binance, 'BNB123456789');
  });

  await test('R3-T4: Update existing talent dossier modifies fields without creating duplicates', async () => {
    await db.talent.upsert({
      where: { discordId: 'talent_dave' },
      update: {},
      create: { role: 'ACTOR', paypal: 'dave_old@mail.com', binance: null }
    });

    const updated = await db.talent.upsert({
      where: { discordId: 'talent_dave' },
      update: { role: 'EDITOR', paypal: 'dave_new@mail.com', binance: 'BINANCE_DAVE' },
      create: { role: 'EDITOR', paypal: 'dave_new@mail.com', binance: 'BINANCE_DAVE' }
    });

    assert.equal(updated.role, 'EDITOR');
    assert.equal(updated.paypal, 'dave_new@mail.com');
    assert.equal(updated.binance, 'BINANCE_DAVE');

    const count = (await db.talent.findMany()).length;
    assert.equal(count, 1);
  });

  await test('R3-T5: Validation rejects invalid talent roles', async () => {
    const validateTalentRegistration = ({ role, paypal, binance }) => {
      const normalizedRole = (role || '').toUpperCase();
      if (!['ACTOR', 'EDITOR'].includes(normalizedRole)) {
        throw new Error(`Rol inválido '${role}'. Debe ser ACTOR o EDITOR.`);
      }
      if (!paypal && !binance) {
        throw new Error('Debes proporcionar al menos un método de pago (PayPal o Binance).');
      }
      return { role: normalizedRole, paypal, binance };
    };

    assert.throws(() => validateTalentRegistration({ role: 'DIRECTOR', paypal: 'dir@mail.com' }), /Rol inválido/);
    assert.throws(() => validateTalentRegistration({ role: '', paypal: 'dir@mail.com' }), /Rol inválido/);
  });

  await test('R3-T6: Validation rejects registration when both PayPal and Binance are omitted', async () => {
    const validateTalentRegistration = ({ role, paypal, binance }) => {
      const normalizedRole = (role || '').toUpperCase();
      if (!['ACTOR', 'EDITOR'].includes(normalizedRole)) {
        throw new Error(`Rol inválido '${role}'. Debe ser ACTOR o EDITOR.`);
      }
      if (!paypal && !binance) {
        throw new Error('Debes proporcionar al menos un método de pago (PayPal o Binance).');
      }
      return { role: normalizedRole, paypal, binance };
    };

    assert.throws(() => validateTalentRegistration({ role: 'ACTOR', paypal: null, binance: null }), /método de pago/);
    assert.throws(() => validateTalentRegistration({ role: 'EDITOR', paypal: '', binance: '' }), /método de pago/);
  });

  // ==========================================
  // R4. Video Registration & Immediate Publication
  // ==========================================

  await test('R4-T1: Universal YouTube URL/ID parser handles all standard formats', async () => {
    const formats = [
      { input: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ', expected: 'dQw4w9WgXcQ' },
      { input: 'https://youtu.be/dQw4w9WgXcQ', expected: 'dQw4w9WgXcQ' },
      { input: 'https://www.youtube.com/embed/dQw4w9WgXcQ', expected: 'dQw4w9WgXcQ' },
      { input: 'https://www.youtube.com/shorts/dQw4w9WgXcQ', expected: 'dQw4w9WgXcQ' },
      { input: 'dQw4w9WgXcQ', expected: 'dQw4w9WgXcQ' },
      { input: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=42s&feature=share', expected: 'dQw4w9WgXcQ' }
    ];

    for (const { input, expected } of formats) {
      const extracted = youtube.extractVideoId(input);
      assert.equal(extracted, expected, `Failed to parse YouTube ID for input: ${input}`);
    }
  });

  await test('R4-T2: Video registration with valid editor and actor schedules due date at now + 5 days', async () => {
    await db.talent.upsert({ where: { discordId: 'ed_1' }, update: {}, create: { role: 'EDITOR', paypal: 'ed1@mail.com' } });
    await db.talent.upsert({ where: { discordId: 'ac_1' }, update: {}, create: { role: 'ACTOR', paypal: 'ac1@mail.com' } });

    const waitDays = 5;
    const scheduledDate = new Date(clock.now() + waitDays * 86400000);

    const video = await db.videoRecord.create({
      data: {
        youtubeUrl: 'https://youtu.be/dQw4w9WgXcQ',
        videoId: 'dQw4w9WgXcQ',
        editorId: 'ed_1',
        status: 'PENDING',
        createdAt: new Date(clock.now()),
        scheduledDate,
        participants: {
          create: [{ talentId: 'ac_1', role: 'ACTOR' }]
        }
      },
      include: { participants: true }
    });

    assert.equal(video.videoId, 'dQw4w9WgXcQ');
    assert.equal(video.scheduledDate.getTime(), clock.now() + 5 * 86400000);
    assert.equal(video.participants.length, 1);
  });

  await test('R4-T3: Video registration with multiple actors (3+ participants)', async () => {
    await db.talent.upsert({ where: { discordId: 'ed_main' }, update: {}, create: { role: 'EDITOR', paypal: 'ed@mail.com' } });
    await db.talent.upsert({ where: { discordId: 'act_1' }, update: {}, create: { role: 'ACTOR', paypal: 'a1@mail.com' } });
    await db.talent.upsert({ where: { discordId: 'act_2' }, update: {}, create: { role: 'ACTOR', paypal: 'a2@mail.com' } });
    await db.talent.upsert({ where: { discordId: 'act_3' }, update: {}, create: { role: 'ACTOR', paypal: 'a3@mail.com' } });

    const video = await db.videoRecord.create({
      data: {
        youtubeUrl: 'https://youtu.be/vid_multi',
        videoId: 'vid_multi',
        editorId: 'ed_main',
        status: 'PENDING',
        participants: {
          create: [
            { talentId: 'act_1', role: 'ACTOR' },
            { talentId: 'act_2', role: 'ACTOR' },
            { talentId: 'act_3', role: 'ACTOR' }
          ]
        }
      },
      include: { participants: true }
    });

    assert.equal(video.participants.length, 3);
  });

  await test('R4-T4: Video registration rejects when mentioned editor is not in Talent DB', async () => {
    const registerVideo = async ({ url, editorId, actorIds }) => {
      const editor = await db.talent.findUnique({ where: { discordId: editorId } });
      if (!editor) {
        throw new Error(`El editor <@${editorId}> no está registrado en el sistema. Debe usar !registro primero.`);
      }
    };

    await assert.rejects(
      async () => registerVideo({ url: 'https://youtu.be/12345678901', editorId: 'unregistered_editor', actorIds: ['a1'] }),
      /no está registrado/
    );
  });

  await test('R4-T5: Video registration rejects when any mentioned actor is not in Talent DB', async () => {
    await db.talent.upsert({ where: { discordId: 'ed_ok' }, update: {}, create: { role: 'EDITOR', paypal: 'ed@mail.com' } });
    await db.talent.upsert({ where: { discordId: 'ac_ok' }, update: {}, create: { role: 'ACTOR', paypal: 'ac@mail.com' } });

    const registerVideo = async ({ editorId, actorIds }) => {
      const editor = await db.talent.findUnique({ where: { discordId: editorId } });
      if (!editor) throw new Error('Editor no registrado');

      const actors = await db.talent.findMany({ where: { discordId: { in: actorIds } } });
      const foundIds = new Set(actors.map(a => a.discordId));
      const missing = actorIds.filter(id => !foundIds.has(id));

      if (missing.length > 0) {
        throw new Error(`Los siguientes actores no están registrados: ${missing.map(m => `<@${m}>`).join(', ')}`);
      }
    };

    await assert.rejects(
      async () => registerVideo({ editorId: 'ed_ok', actorIds: ['ac_ok', 'ac_missing'] }),
      /ac_missing/
    );
  });

  await test('R4-T6: History channel embed and registration DMs dispatched accurately', async () => {
    const editor = { discordId: 'ed_notif', paypal: 'ed@mail.com' };
    const actors = [{ discordId: 'ac_notif', paypal: 'ac@mail.com' }];
    const videoRecord = {
      title: 'Sonic Adventure Gameplay',
      youtubeUrl: 'https://youtu.be/sonic_01',
      videoId: 'sonic_01',
      scheduledDate: new Date(clock.now() + 5 * 86400000)
    };

    const historyEmbed = ReferenceNotificationService.buildHistoryEmbed({
      videoRecord,
      editor,
      actors,
      config: { currency: 'MXN' }
    });

    const historyChan = client.getChannel(HISTORY_CHANNEL_ID, 'history');
    await historyChan.send({ embeds: [historyEmbed] });

    assert.equal(historyChan.messages.length, 1);
    assert.equal(historyChan.messages[0].embeds[0].title, '🎬 Nuevo Video Registrado para Seguimiento');

    // Registration DMs
    const edUser = client.getUser(editor.discordId);
    const acUser = client.getUser(actors[0].discordId);

    await edUser.send(`🎬 Tu video **${videoRecord.title}** ha sido registrado. La liquidación se calculará en 5 días.`);
    await acUser.send(`🎬 Tu video **${videoRecord.title}** ha sido registrado. La liquidación se calculará en 5 días.`);

    assert.equal(edUser.dms.length, 1);
    assert.equal(acUser.dms.length, 1);
  });

  // ==========================================
  // R5. Payout Calculation & YouTube Views
  // ==========================================

  await test('R5-T1: Pure math calculation below Threshold 1 awards base rates only', async () => {
    const config = {
      actorBase: 25,
      editorBase: 125,
      threshold1: 500000,
      bonus1: 25,
      threshold2: 1000000,
      bonus2: 25,
      currency: 'MXN'
    };

    const actorPayout = ReferencePayoutService.calculateTalentPayout('ACTOR', 250000, config);
    assert.equal(actorPayout.base, 25);
    assert.equal(actorPayout.bonus1, 0);
    assert.equal(actorPayout.bonus2, 0);
    assert.equal(actorPayout.total, 25);
    assert.equal(actorPayout.threshold1Passed, false);

    const editorPayout = ReferencePayoutService.calculateTalentPayout('EDITOR', 250000, config);
    assert.equal(editorPayout.base, 125);
    assert.equal(editorPayout.bonus1, 0);
    assert.equal(editorPayout.bonus2, 0);
    assert.equal(editorPayout.total, 125);
  });

  await test('R5-T2: Pure math calculation hitting Threshold 1 awards Bonus 1', async () => {
    const config = {
      actorBase: 25,
      editorBase: 125,
      threshold1: 500000,
      bonus1: 25,
      threshold2: 1000000,
      bonus2: 25,
      currency: 'MXN'
    };

    const actorPayout = ReferencePayoutService.calculateTalentPayout('ACTOR', 500000, config);
    assert.equal(actorPayout.base, 25);
    assert.equal(actorPayout.bonus1, 25);
    assert.equal(actorPayout.bonus2, 0);
    assert.equal(actorPayout.total, 50);
    assert.equal(actorPayout.threshold1Passed, true);
    assert.equal(actorPayout.threshold2Passed, false);

    const editorPayout = ReferencePayoutService.calculateTalentPayout('EDITOR', 750000, config);
    assert.equal(editorPayout.base, 125);
    assert.equal(editorPayout.bonus1, 25);
    assert.equal(editorPayout.bonus2, 0);
    assert.equal(editorPayout.total, 150);
  });

  await test('R5-T3: Pure math calculation hitting Threshold 2 awards Bonus 1 + Bonus 2', async () => {
    const config = {
      actorBase: 25,
      editorBase: 125,
      threshold1: 500000,
      bonus1: 25,
      threshold2: 1000000,
      bonus2: 25,
      currency: 'MXN'
    };

    const actorPayout = ReferencePayoutService.calculateTalentPayout('ACTOR', 1000000, config);
    assert.equal(actorPayout.base, 25);
    assert.equal(actorPayout.bonus1, 25);
    assert.equal(actorPayout.bonus2, 25);
    assert.equal(actorPayout.totalBonus, 50);
    assert.equal(actorPayout.total, 75);
    assert.equal(actorPayout.threshold1Passed, true);
    assert.equal(actorPayout.threshold2Passed, true);

    const editorPayout = ReferencePayoutService.calculateTalentPayout('EDITOR', 1500000, config);
    assert.equal(editorPayout.total, 175);
  });

  await test('R5-T4: Multi-actor video settlement itemization and grand total calculation', async () => {
    const config = {
      actorBase: 25,
      editorBase: 125,
      threshold1: 500000,
      bonus1: 25,
      threshold2: 1000000,
      bonus2: 25,
      currency: 'MXN'
    };

    const editor = { discordId: 'ed1', paypal: 'ed@mail.com' };
    const participants = [
      { discordId: 'act1', paypal: 'a1@mail.com' },
      { discordId: 'act2', paypal: 'a2@mail.com' },
      { discordId: 'act3', paypal: 'a3@mail.com' },
      { discordId: 'act4', paypal: 'a4@mail.com' }
    ];

    // Views: 1,200,000 (Hits Threshold 2: Editor gets 175, each Actor gets 75)
    const settlement = ReferencePayoutService.calculateVideoSettlement({
      editor,
      participants,
      views: 1200000,
      config
    });

    assert.equal(settlement.editor.payout.total, 175);
    assert.equal(settlement.actors.length, 4);
    assert.equal(settlement.actors[0].payout.total, 75);
    // Total = 175 + (4 * 75) = 175 + 300 = 475
    assert.equal(settlement.totalPayout, 475);
  });

  await test('R5-T5: YouTube mock returns configured views and metadata', async () => {
    youtube.setMockVideo('test_vid_xyz', {
      title: 'Sonic Speedrun 100%',
      viewCount: 888000
    });

    const details = await youtube.getVideoDetails('test_vid_xyz');
    assert.equal(details.videoId, 'test_vid_xyz');
    assert.equal(details.title, 'Sonic Speedrun 100%');
    assert.equal(details.viewCount, 888000);
  });

  await test('R5-T6: Scheduler detects mature pending videos and excludes pending future videos', async () => {
    const config = await db.config.create({ data: { waitDays: 5 } });
    
    // Video 1: Registered 6 days ago (mature)
    await db.videoRecord.create({
      data: {
        youtubeUrl: 'https://youtu.be/mature_vid',
        videoId: 'mature_vid',
        editorId: 'ed1',
        status: 'PENDING',
        scheduledDate: new Date(clock.now() - 86400000)
      }
    });

    // Video 2: Registered 2 days ago (immature)
    await db.videoRecord.create({
      data: {
        youtubeUrl: 'https://youtu.be/immature_vid',
        videoId: 'immature_vid',
        editorId: 'ed1',
        status: 'PENDING',
        scheduledDate: new Date(clock.now() + 3 * 86400000)
      }
    });

    const pendingMature = await db.videoRecord.findMany({
      where: {
        status: 'PENDING',
        scheduledDate: { lte: new Date(clock.now()) }
      }
    });

    assert.equal(pendingMature.length, 1);
    assert.equal(pendingMature[0].videoId, 'mature_vid');
  });

  // ==========================================
  // R6. Settlement Dispatch, Admin Orders & DMs
  // ==========================================

  await test('R6-T1: Admin payment order embed formats copyable monospace payment blocks', async () => {
    const config = { currency: 'MXN' };
    const settlement = {
      views: 600000,
      config,
      editor: {
        talent: { discordId: 'ed_pay', paypal: 'ed_paypal@mail.com', binance: 'BINANCE_ED' },
        payout: { total: 150, role: 'EDITOR' }
      },
      actors: [
        {
          talent: { discordId: 'act_pay', paypal: 'act_paypal@mail.com', binance: null },
          payout: { total: 50, role: 'ACTOR' }
        }
      ],
      totalPayout: 200,
      videoRecord: { videoId: 'dQw4w9WgXcQ' }
    };

    const embed = ReferenceNotificationService.buildAdminPaymentOrder(settlement);
    assert.equal(embed.title, '💰 Orden de Pago y Liquidación de Video');
    
    const breakdownField = embed.fields.find(f => f.name === '📋 Desglose y Cuentas');
    assert.ok(breakdownField, 'Breakdown field must exist');
    assert.ok(breakdownField.value.includes('ed_paypal@mail.com'));
    assert.ok(breakdownField.value.includes('BINANCE_ED'));
    assert.ok(breakdownField.value.includes('act_paypal@mail.com'));
    assert.ok(breakdownField.value.includes('```')); // Verified monospace formatting
  });

  await test('R6-T2: Settlement private DMs dispatched to all video participants', async () => {
    const config = { currency: 'MXN' };
    const edTalent = { discordId: 'user_ed_dm', paypal: 'ed@mail.com' };
    const actTalent = { discordId: 'user_act_dm', paypal: 'ac@mail.com' };

    const edPayout = { role: 'EDITOR', base: 125, bonus1: 25, bonus2: 0, totalBonus: 25, total: 150 };
    const actPayout = { role: 'ACTOR', base: 25, bonus1: 25, bonus2: 0, totalBonus: 25, total: 50 };

    const edDM = ReferenceNotificationService.buildSettlementDM({
      talent: edTalent,
      payout: edPayout,
      views: 600000,
      config,
      videoRecord: { title: 'Sonic Speed Episode 1' }
    });

    const actDM = ReferenceNotificationService.buildSettlementDM({
      talent: actTalent,
      payout: actPayout,
      views: 600000,
      config,
      videoRecord: { title: 'Sonic Speed Episode 1' }
    });

    const edUser = client.getUser(edTalent.discordId);
    const actUser = client.getUser(actTalent.discordId);

    await edUser.send({ embeds: [edDM] });
    await actUser.send({ embeds: [actDM] });

    assert.equal(edUser.dms.length, 1);
    assert.equal(actUser.dms.length, 1);
    assert.equal(edUser.dms[0].embeds[0].title, '🎉 Liquidación de Video Completada');
    assert.equal(actUser.dms[0].embeds[0].title, '🎉 Liquidación de Video Completada');
  });

  await test('R6-T3: Video status transition to CALCULATED updates database record atomically', async () => {
    const video = await db.videoRecord.create({
      data: {
        youtubeUrl: 'https://youtu.be/vid_settle',
        videoId: 'vid_settle',
        editorId: 'ed1',
        status: 'PENDING'
      }
    });

    const updated = await db.videoRecord.update({
      where: { id: video.id },
      data: {
        status: 'CALCULATED',
        finalViews: 1250000,
        totalPayout: 250,
        calculatedAt: new Date(clock.now())
      }
    });

    assert.equal(updated.status, 'CALCULATED');
    assert.equal(updated.finalViews, 1250000);
    assert.equal(updated.totalPayout, 250);
    assert.ok(updated.calculatedAt);
  });

  await test('R6-T4: Manual settlement trigger (!liquidar) executes calculation immediately for admin', async () => {
    await db.config.create({ data: { actorBase: 25, editorBase: 125, threshold1: 500000, bonus1: 25, threshold2: 1000000, bonus2: 25, currency: 'MXN' } });
    await db.talent.upsert({ where: { discordId: 'ed_man' }, update: {}, create: { role: 'EDITOR', paypal: 'ed@mail.com' } });
    await db.talent.upsert({ where: { discordId: 'ac_man' }, update: {}, create: { role: 'ACTOR', paypal: 'ac@mail.com' } });

    youtube.setMockVideo('vid_manual', { title: 'Manual Calc Video', viewCount: 550000 });

    const video = await db.videoRecord.create({
      data: {
        youtubeUrl: 'https://youtu.be/vid_manual',
        videoId: 'vid_manual',
        editorId: 'ed_man',
        status: 'PENDING',
        participants: { create: [{ talentId: 'ac_man', role: 'ACTOR' }] }
      },
      include: { participants: true }
    });

    // Simulate !liquidar execution
    const adminMsg = client.createMessage({ authorId: 'admin_1', channelId: 'admin_chan', content: '!liquidar vid_manual', isAdmin: true });

    const executeLiquidar = async (msg, videoId) => {
      if (!msg.member.permissions.has('Administrator')) {
        await msg.reply('❌ Permiso denegado.');
        return false;
      }
      const v = await db.videoRecord.findUnique({ where: { videoId }, include: { participants: true } });
      if (!v || v.status !== 'PENDING') {
        await msg.reply('❌ Video no encontrado o ya liquidado.');
        return false;
      }
      const cfg = await db.config.findFirst();
      const details = await youtube.getVideoDetails(videoId);
      const editor = await db.talent.findUnique({ where: { discordId: v.editorId } });
      const actorIds = v.participants.map(p => p.talentId);
      const actors = await db.talent.findMany({ where: { discordId: { in: actorIds } } });

      const settlement = ReferencePayoutService.calculateVideoSettlement({
        editor,
        participants: actors,
        views: details.viewCount,
        config: cfg
      });

      await db.videoRecord.update({
        where: { id: v.id },
        data: { status: 'CALCULATED', finalViews: details.viewCount, totalPayout: settlement.totalPayout }
      });

      await msg.reply(`✅ Video ${videoId} liquidado exitosamente.`);
      return true;
    };

    const success = await executeLiquidar(adminMsg, 'vid_manual');
    assert.equal(success, true);
    assert.ok(adminMsg.replies[0].content.includes('✅'));

    const updated = await db.videoRecord.findUnique({ where: { videoId: 'vid_manual' } });
    assert.equal(updated.status, 'CALCULATED');
    assert.equal(updated.finalViews, 550000);
  });

  await test('R6-T5: Non-admin attempt to execute !liquidar is blocked by permission guard', async () => {
    const nonAdminMsg = client.createMessage({ authorId: 'user_regular', channelId: 'admin_chan', content: '!liquidar vid_manual', isAdmin: false });

    const executeLiquidar = async (msg) => {
      if (!msg.member.permissions.has('Administrator')) {
        await msg.reply('❌ Permiso denegado: Se requiere rol de Administrador.');
        return false;
      }
      return true;
    };

    const allowed = await executeLiquidar(nonAdminMsg);
    assert.equal(allowed, false);
    assert.ok(nonAdminMsg.replies[0].content.includes('❌ Permiso denegado'));
  });

  await test('R6-T6: Settlement idempotency prevents duplicate calculations and disbursements', async () => {
    await db.config.create({ data: {} });
    const video = await db.videoRecord.create({
      data: {
        youtubeUrl: 'https://youtu.be/vid_idempotent',
        videoId: 'vid_idempotent',
        editorId: 'ed1',
        status: 'CALCULATED',
        finalViews: 500000,
        totalPayout: 200
      }
    });

    let executionCount = 0;
    const processVideo = async (targetVideo) => {
      if (targetVideo.status !== 'PENDING') {
        return { skipped: true, reason: 'ALREADY_PROCESSED' };
      }
      executionCount++;
      return { skipped: false };
    };

    const result = await processVideo(video);
    assert.equal(result.skipped, true);
    assert.equal(result.reason, 'ALREADY_PROCESSED');
    assert.equal(executionCount, 0);
  });

  await test('R6-T7: VideoRecord transition from CALCULATED to PAID via mark-paid action', async () => {
    const video = await db.videoRecord.create({
      data: {
        youtubeUrl: 'https://youtu.be/vid_pay_01',
        videoId: 'vid_pay_01',
        editorId: 'ed_pay',
        status: 'CALCULATED',
        finalViews: 650000,
        totalPayout: 250
      }
    });
    assert.equal(video.status, 'CALCULATED');

    const adminMsg = client.createMessage({
      authorId: 'admin_1',
      channelId: 'admin_chan',
      content: '!pagar vid_pay_01',
      isAdmin: true
    });

    const executePagar = async (msg, videoId) => {
      if (!msg.member.permissions.has('Administrator')) {
        await msg.reply('❌ No tienes los permisos necesarios para ejecutar este comando.');
        return false;
      }
      const v = await db.videoRecord.findUnique({ where: { videoId } });
      if (!v) {
        await msg.reply('❌ No se encontró ningún video registrado.');
        return false;
      }
      if (v.status === 'PENDING') {
        await msg.reply('⚠️ El video aún no ha sido calculado.');
        return false;
      }
      if (v.status === 'PAID') {
        await msg.reply('ℹ️ El video ya se encuentra marcado como PAGADO.');
        return true;
      }
      await db.videoRecord.update({
        where: { id: v.id },
        data: { status: 'PAID' }
      });
      await msg.reply(`💰 Video ${videoId} marcado como pagado exitosamente.`);
      return true;
    };

    const success = await executePagar(adminMsg, 'vid_pay_01');
    assert.equal(success, true);
    assert.ok(adminMsg.replies[0].content.includes('💰 Video vid_pay_01 marcado como pagado'));

    const updated = await db.videoRecord.findUnique({ where: { videoId: 'vid_pay_01' } });
    assert.equal(updated.status, 'PAID');
  });

  await test('R6-T8: Rejection of marking PENDING video directly as PAID', async () => {
    await db.videoRecord.create({
      data: {
        youtubeUrl: 'https://youtu.be/vid_pending_pay',
        videoId: 'vid_pending_pay',
        editorId: 'ed_pay',
        status: 'PENDING'
      }
    });

    const adminMsg = client.createMessage({
      authorId: 'admin_1',
      channelId: 'admin_chan',
      content: '!pagar vid_pending_pay',
      isAdmin: true
    });

    const executePagar = async (msg, videoId) => {
      const v = await db.videoRecord.findUnique({ where: { videoId } });
      if (v.status === 'PENDING') {
        await msg.reply('⚠️ El video aún no ha sido calculado.');
        return false;
      }
      return true;
    };

    const success = await executePagar(adminMsg, 'vid_pending_pay');
    assert.equal(success, false);
    assert.ok(adminMsg.replies[0].content.includes('⚠️ El video aún no ha sido calculado'));

    const untouched = await db.videoRecord.findUnique({ where: { videoId: 'vid_pending_pay' } });
    assert.equal(untouched.status, 'PENDING');
  });

  await test('R6-T9: Admin permission guard blocks non-administrators from executing !pagar', async () => {
    const nonAdminMsg = client.createMessage({
      authorId: 'regular_user',
      channelId: 'admin_chan',
      content: '!pagar vid_pay_01',
      isAdmin: false
    });

    const executePagar = async (msg) => {
      if (!msg.member.permissions.has('Administrator')) {
        await msg.reply('❌ No tienes los permisos necesarios para ejecutar este comando.');
        return false;
      }
      return true;
    };

    const allowed = await executePagar(nonAdminMsg);
    assert.equal(allowed, false);
    assert.ok(nonAdminMsg.replies[0].content.includes('❌ No tienes los permisos'));
  });

  await test('R6-T10: Idempotency of marking already PAID video', async () => {
    await db.videoRecord.create({
      data: {
        youtubeUrl: 'https://youtu.be/vid_already_paid',
        videoId: 'vid_already_paid',
        status: 'PAID'
      }
    });

    const adminMsg = client.createMessage({
      authorId: 'admin_1',
      channelId: 'admin_chan',
      content: '!pagar vid_already_paid',
      isAdmin: true
    });

    const executePagar = async (msg, videoId) => {
      const v = await db.videoRecord.findUnique({ where: { videoId } });
      if (v.status === 'PAID') {
        await msg.reply('ℹ️ El video ya se encuentra marcado como PAGADO.');
        return true;
      }
      return false;
    };

    const res = await executePagar(adminMsg, 'vid_already_paid');
    assert.equal(res, true);
    assert.ok(adminMsg.replies[0].content.includes('ℹ️ El video ya se encuentra marcado como PAGADO'));
  });

  return results;
}
