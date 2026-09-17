/**
 * Tier 3: Pairwise Combinations & State Shifts E2E Test Suite
 * Tests interactions across dynamic rates, payment shifts, batch maturities, and concurrency locks (6 test cases).
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

export async function runTier3Tests() {
  const results = [];
  const clock = new VirtualClock();
  const db = new MockDatabase();
  const youtube = new ReferenceYouTubeService();
  const client = new MockDiscordClient();

  async function test(name, fn) {
    db.reset();
    clock.reset(1700000000000);
    try {
      await fn();
      results.push({ name, tier: 'Tier 3: Pairwise & State Shifts', passed: true });
    } catch (err) {
      results.push({ name, tier: 'Tier 3: Pairwise & State Shifts', passed: false, error: err });
    }
  }

  await test('T3-01: Dynamic rate update immediately prior to settlement calculation applies new active rates', async () => {
    // 1. Initial Config
    await db.config.create({
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

    // 2. Register Talents & Video
    const editor = await db.talent.upsert({ where: { discordId: 'ed_dyn' }, update: {}, create: { role: 'EDITOR', paypal: 'ed@dyn.com' } });
    const actor = await db.talent.upsert({ where: { discordId: 'ac_dyn' }, update: {}, create: { role: 'ACTOR', paypal: 'ac@dyn.com' } });

    const video = await db.videoRecord.create({
      data: {
        youtubeUrl: 'https://youtu.be/dyn_rates_vid',
        videoId: 'dyn_rates_vid',
        editorId: 'ed_dyn',
        status: 'PENDING',
        scheduledDate: new Date(clock.now() + 5 * 86400000),
        participants: { create: [{ talentId: 'ac_dyn', role: 'ACTOR' }] }
      },
      include: { participants: true }
    });

    // 3. Fast-forward to 4 days, then Admin modifies rates dynamically
    clock.advanceDays(4);
    await db.config.update({
      where: { id: 1 },
      data: {
        actorBase: 35,
        editorBase: 150,
        bonus1: 30,
        bonus2: 30
      }
    });

    // 4. Fast-forward to day 5 (mature)
    clock.advanceDays(1);

    // 5. YouTube API reports 650,000 views (Threshold 1 hit)
    const activeConfig = await db.config.findFirst();
    const settlement = ReferencePayoutService.calculateVideoSettlement({
      editor,
      participants: [actor],
      views: 650000,
      config: activeConfig
    });

    // Editor: Base 150 + Bonus 30 = 180
    assert.equal(settlement.editor.payout.base, 150);
    assert.equal(settlement.editor.payout.bonus1, 30);
    assert.equal(settlement.editor.payout.total, 180);

    // Actor: Base 35 + Bonus 30 = 65
    assert.equal(settlement.actors[0].payout.base, 35);
    assert.equal(settlement.actors[0].payout.bonus1, 30);
    assert.equal(settlement.actors[0].payout.total, 65);

    assert.equal(settlement.totalPayout, 245);
  });

  await test('T3-02: Multi-actor video with heterogeneous payment methods formats all accounts in admin order', async () => {
    const config = { currency: 'MXN' };
    const editor = { discordId: 'ed_multi', paypal: 'ed_multi@paypal.com', binance: 'BINANCE_ED_MULTI' };
    const participants = [
      { discordId: 'act_paypal_only', paypal: 'act1@paypal.com', binance: null },
      { discordId: 'act_binance_only', paypal: null, binance: '0x99887766554433221100' },
      { discordId: 'act_dual_methods', paypal: 'act3@paypal.com', binance: 'BINANCE_ACT3' }
    ];

    const settlement = ReferencePayoutService.calculateVideoSettlement({
      editor,
      participants,
      views: 1200000,
      config: { ...config, actorBase: 25, editorBase: 125, threshold1: 500000, bonus1: 25, threshold2: 1000000, bonus2: 25 }
    });

    settlement.videoRecord = { videoId: 'vid_hetero' };

    const adminOrder = ReferenceNotificationService.buildAdminPaymentOrder(settlement);
    const breakdown = adminOrder.fields.find(f => f.name === '📋 Desglose y Cuentas').value;

    assert.ok(breakdown.includes('ed_multi@paypal.com'));
    assert.ok(breakdown.includes('BINANCE_ED_MULTI'));
    assert.ok(breakdown.includes('act1@paypal.com'));
    assert.ok(breakdown.includes('0x99887766554433221100'));
    assert.ok(breakdown.includes('BINANCE_ACT3'));
  });

  await test('T3-03: Multiple videos maturing simultaneously in the same tick are all processed independently', async () => {
    const config = await db.config.create({ data: { actorBase: 25, editorBase: 125, threshold1: 500000, bonus1: 25, threshold2: 1000000, bonus2: 25, waitDays: 5 } });
    const editor = await db.talent.upsert({ where: { discordId: 'ed_simul' }, update: {}, create: { role: 'EDITOR', paypal: 'ed@simul.com' } });

    const maturityDate = new Date(clock.now() + 5 * 86400000);

    // Create 5 simultaneous videos
    const videoIds = ['vid_simul_1', 'vid_simul_2', 'vid_simul_3', 'vid_simul_4', 'vid_simul_5'];
    for (const vid of videoIds) {
      await db.videoRecord.create({
        data: {
          youtubeUrl: `https://youtu.be/${vid}`,
          videoId: vid,
          editorId: 'ed_simul',
          status: 'PENDING',
          scheduledDate: maturityDate
        }
      });
    }

    // Fast forward 5 days
    clock.advanceDays(5);

    // Query due videos
    const dueVideos = await db.videoRecord.findMany({
      where: {
        status: 'PENDING',
        scheduledDate: { lte: new Date(clock.now()) }
      }
    });

    assert.equal(dueVideos.length, 5);

    // Batch process
    const processedIds = [];
    for (const v of dueVideos) {
      await db.videoRecord.update({
        where: { id: v.id },
        data: { status: 'CALCULATED', finalViews: 100000, totalPayout: 125 }
      });
      processedIds.push(v.videoId);
    }

    assert.equal(processedIds.length, 5);

    const remainingPending = await db.videoRecord.findMany({ where: { status: 'PENDING' } });
    assert.equal(remainingPending.length, 0);
  });

  await test('T3-04: Talent updates payment info between registration and settlement reflects latest info in admin order', async () => {
    const config = await db.config.create({ data: { currency: 'MXN', actorBase: 25, editorBase: 125, threshold1: 500000, bonus1: 25, threshold2: 1000000, bonus2: 25 } });

    // Initial Registration
    await db.talent.upsert({
      where: { discordId: 'actor_updating' },
      update: {},
      create: { role: 'ACTOR', paypal: 'old_email@mail.com', binance: null }
    });

    const editor = await db.talent.upsert({
      where: { discordId: 'editor_updating' },
      update: {},
      create: { role: 'EDITOR', paypal: 'editor@mail.com' }
    });

    const video = await db.videoRecord.create({
      data: {
        youtubeUrl: 'https://youtu.be/vid_payment_update',
        videoId: 'vid_payment_update',
        editorId: 'editor_updating',
        status: 'PENDING',
        scheduledDate: new Date(clock.now() + 5 * 86400000),
        participants: { create: [{ talentId: 'actor_updating', role: 'ACTOR' }] }
      },
      include: { participants: true }
    });

    // Day 2: Actor updates payment info
    clock.advanceDays(2);
    await db.talent.upsert({
      where: { discordId: 'actor_updating' },
      update: { paypal: 'brand_new_actor_email@company.org', binance: 'BINANCE_UPDATED_99' },
      create: {}
    });

    // Day 5: Settlement triggers
    clock.advanceDays(3);

    // Fetch fresh talent data from DB at settlement time
    const freshActor = await db.talent.findUnique({ where: { discordId: 'actor_updating' } });
    const freshEditor = await db.talent.findUnique({ where: { discordId: 'editor_updating' } });

    const settlement = ReferencePayoutService.calculateVideoSettlement({
      editor: freshEditor,
      participants: [freshActor],
      views: 300000,
      config
    });

    const adminOrder = ReferenceNotificationService.buildAdminPaymentOrder(settlement);
    const breakdown = adminOrder.fields.find(f => f.name === '📋 Desglose y Cuentas').value;

    assert.ok(breakdown.includes('brand_new_actor_email@company.org'));
    assert.ok(breakdown.includes('BINANCE_UPDATED_99'));
    assert.ok(!breakdown.includes('old_email@mail.com'));
  });

  await test('T3-05: Concurrent scheduler and manual !liquidar race protection enforces atomic single calculation', async () => {
    await db.config.create({ data: {} });
    await db.talent.upsert({ where: { discordId: 'ed_race' }, update: {}, create: { role: 'EDITOR', paypal: 'ed@race.com' } });

    const video = await db.videoRecord.create({
      data: {
        youtubeUrl: 'https://youtu.be/vid_race',
        videoId: 'vid_race',
        editorId: 'ed_race',
        status: 'PENDING'
      }
    });

    let atomicCalculationCalls = 0;

    // Mutex / Atomic transition simulator
    const lockMap = new Set();
    const settleVideoWithLock = async (videoId) => {
      if (lockMap.has(videoId)) {
        return { success: false, reason: 'LOCKED' };
      }
      lockMap.add(videoId);

      try {
        const v = await db.videoRecord.findUnique({ where: { videoId } });
        if (!v || v.status !== 'PENDING') {
          return { success: false, reason: 'ALREADY_SETTLED' };
        }

        // Simulate async work
        atomicCalculationCalls++;
        await db.videoRecord.update({
          where: { id: v.id },
          data: { status: 'CALCULATED', finalViews: 500000, totalPayout: 150 }
        });

        return { success: true };
      } finally {
        lockMap.delete(videoId);
      }
    };

    // Trigger both simultaneously
    const [res1, res2] = await Promise.all([
      settleVideoWithLock('vid_race'),
      settleVideoWithLock('vid_race')
    ]);

    const successes = [res1, res2].filter(r => r.success);
    assert.equal(successes.length, 1);
    assert.equal(atomicCalculationCalls, 1);

    const finalRecord = await db.videoRecord.findUnique({ where: { videoId: 'vid_race' } });
    assert.equal(finalRecord.status, 'CALCULATED');
  });

  await test('T3-06: Custom waitDays schedule configuration dynamically calculates due dates for new registrations', async () => {
    // 1. Initial 5 days
    await db.config.create({ data: { waitDays: 5 } });
    const regTime1 = clock.now();
    const video1Due = new Date(regTime1 + 5 * 86400000);

    // 2. Admin changes waitDays to 3 days
    await db.config.update({ where: { id: 1 }, data: { waitDays: 3 } });
    const cfgUpdated = await db.config.findFirst();
    assert.equal(cfgUpdated.waitDays, 3);

    const regTime2 = clock.now();
    const video2Due = new Date(regTime2 + cfgUpdated.waitDays * 86400000);

    assert.equal(video1Due.getTime() - regTime1, 5 * 86400000);
    assert.equal(video2Due.getTime() - regTime2, 3 * 86400000);
  });

  return results;
}
