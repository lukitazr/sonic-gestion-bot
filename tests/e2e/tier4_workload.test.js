/**
 * Tier 4: Real-World Workload Scenarios E2E Test Suite
 * Validates complete end-to-end lifecycles across registration, tracking, 5-day time passage,
 * YouTube API querying, settlement calculation, admin orders, and participant DMs (4 test cases).
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

export async function runTier4Tests() {
  const results = [];
  const clock = new VirtualClock();
  const db = new MockDatabase();
  const youtube = new ReferenceYouTubeService();
  const client = new MockDiscordClient();

  const HISTORY_CHANNEL_ID = '111222333444555666';
  const ADMIN_CHANNEL_ID = '999888777666555444';

  async function test(name, fn) {
    db.reset();
    clock.reset(1700000000000);
    try {
      await fn();
      results.push({ name, tier: 'Tier 4: Real-World Workloads', passed: true });
    } catch (err) {
      results.push({ name, tier: 'Tier 4: Real-World Workloads', passed: false, error: err });
    }
  }

  await test('T4-01: Full lifecycle of a viral hit video (1,250,000 views) reaching Tier 2 bonus', async () => {
    // 1. Initial Setup: Seed Config
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

    // 2. Register Talents
    const editor = await db.talent.upsert({
      where: { discordId: 'ed_viral' },
      update: {},
      create: { role: 'EDITOR', paypal: 'ed_viral@youtube.com', binance: 'BINANCE_ED_VIRAL' }
    });
    const actor1 = await db.talent.upsert({
      where: { discordId: 'act_viral_1' },
      update: {},
      create: { role: 'ACTOR', paypal: 'act1_viral@youtube.com', binance: null }
    });
    const actor2 = await db.talent.upsert({
      where: { discordId: 'act_viral_2' },
      update: {},
      create: { role: 'ACTOR', paypal: null, binance: 'BINANCE_ACT2_VIRAL' }
    });

    // 3. Admin registers video
    const videoUrl = 'https://www.youtube.com/watch?v=dQw4w9WgXcQ';
    const videoId = youtube.extractVideoId(videoUrl);
    const scheduledDate = new Date(clock.now() + config.waitDays * 86400000);

    const videoRecord = await db.videoRecord.create({
      data: {
        youtubeUrl: videoUrl,
        videoId,
        editorId: editor.discordId,
        status: 'PENDING',
        createdAt: new Date(clock.now()),
        scheduledDate,
        title: 'Rick Astley - Never Gonna Give You Up',
        participants: {
          create: [
            { talentId: actor1.discordId, role: 'ACTOR' },
            { talentId: actor2.discordId, role: 'ACTOR' }
          ]
        }
      },
      include: { participants: true }
    });

    // History Embed & Registration DMs
    const historyChan = client.getChannel(HISTORY_CHANNEL_ID, 'history');
    const historyEmbed = ReferenceNotificationService.buildHistoryEmbed({
      videoRecord,
      editor,
      actors: [actor1, actor2],
      config
    });
    await historyChan.send({ embeds: [historyEmbed] });

    for (const talent of [editor, actor1, actor2]) {
      const u = client.getUser(talent.discordId);
      await u.send(`🎬 Video **${videoRecord.title}** registrado.`);
    }

    assert.equal(historyChan.messages.length, 1);
    assert.equal(client.getUser(editor.discordId).dms.length, 1);

    // 4. Time Jump: 5 Days pass
    clock.advanceDays(5);

    // 5. YouTube API returns 1,250,000 views
    youtube.setMockVideo(videoId, {
      title: videoRecord.title,
      viewCount: 1250000
    });

    // 6. Scheduler evaluates pending videos
    const dueVideos = await db.videoRecord.findMany({
      where: { status: 'PENDING', scheduledDate: { lte: new Date(clock.now()) } },
      include: { participants: true }
    });

    assert.equal(dueVideos.length, 1);
    const matureVideo = dueVideos[0];

    const details = await youtube.getVideoDetails(matureVideo.videoId);
    const freshConfig = await db.config.findFirst();

    const settlement = ReferencePayoutService.calculateVideoSettlement({
      editor,
      participants: [actor1, actor2],
      views: details.viewCount,
      config: freshConfig
    });
    settlement.videoRecord = matureVideo;

    // Calculation assertions:
    // Editor: 125 + 25 + 25 = 175
    // Actor 1: 25 + 25 + 25 = 75
    // Actor 2: 25 + 25 + 25 = 75
    // Total: 325
    assert.equal(settlement.editor.payout.total, 175);
    assert.equal(settlement.actors[0].payout.total, 75);
    assert.equal(settlement.actors[1].payout.total, 75);
    assert.equal(settlement.totalPayout, 325);

    // 7. Dispatch Admin Payment Order
    const adminChan = client.getChannel(ADMIN_CHANNEL_ID, 'admin');
    const adminOrder = ReferenceNotificationService.buildAdminPaymentOrder(settlement);
    await adminChan.send({ embeds: [adminOrder] });

    assert.equal(adminChan.messages.length, 1);
    const breakdownText = adminChan.messages[0].embeds[0].fields.find(f => f.name === '📋 Desglose y Cuentas').value;
    assert.ok(breakdownText.includes('ed_viral@youtube.com'));
    assert.ok(breakdownText.includes('BINANCE_ACT2_VIRAL'));
    assert.ok(breakdownText.includes('TOTAL GENERAL: $325 MXN'));

    // 8. Dispatch Settlement DMs
    const edUser = client.getUser(editor.discordId);
    const ac1User = client.getUser(actor1.discordId);
    const ac2User = client.getUser(actor2.discordId);

    await edUser.send({ embeds: [ReferenceNotificationService.buildSettlementDM({ talent: editor, payout: settlement.editor.payout, views: details.viewCount, config: freshConfig, videoRecord: matureVideo })] });
    await ac1User.send({ embeds: [ReferenceNotificationService.buildSettlementDM({ talent: actor1, payout: settlement.actors[0].payout, views: details.viewCount, config: freshConfig, videoRecord: matureVideo })] });
    await ac2User.send({ embeds: [ReferenceNotificationService.buildSettlementDM({ talent: actor2, payout: settlement.actors[1].payout, views: details.viewCount, config: freshConfig, videoRecord: matureVideo })] });

    assert.equal(edUser.dms.length, 2); // 1 reg + 1 settle
    assert.equal(ac1User.dms.length, 2);
    assert.equal(ac2User.dms.length, 2);

    // 9. Atomic DB state transition
    const updated = await db.videoRecord.update({
      where: { id: matureVideo.id },
      data: {
        status: 'CALCULATED',
        finalViews: details.viewCount,
        totalPayout: settlement.totalPayout,
        calculatedAt: new Date(clock.now())
      }
    });

    assert.equal(updated.status, 'CALCULATED');
    assert.equal(updated.finalViews, 1250000);
    assert.equal(updated.totalPayout, 325);
  });

  await test('T4-02: Full lifecycle of an underperforming video (12,000 views) with base-only payout', async () => {
    const config = await db.config.create({ data: { actorBase: 25, editorBase: 125, threshold1: 500000, bonus1: 25, threshold2: 1000000, bonus2: 25 } });
    const editor = await db.talent.upsert({ where: { discordId: 'ed_low' }, update: {}, create: { role: 'EDITOR', paypal: 'ed_low@mail.com' } });
    const actor = await db.talent.upsert({ where: { discordId: 'act_low' }, update: {}, create: { role: 'ACTOR', paypal: 'act_low@mail.com' } });

    const videoId = 'low_views_vid';
    youtube.setMockVideo(videoId, { title: 'Niche Tech Tutorial', viewCount: 12000 });

    const video = await db.videoRecord.create({
      data: {
        youtubeUrl: `https://youtu.be/${videoId}`,
        videoId,
        editorId: editor.discordId,
        status: 'PENDING',
        scheduledDate: new Date(clock.now() + 5 * 86400000),
        participants: { create: [{ talentId: actor.discordId, role: 'ACTOR' }] }
      },
      include: { participants: true }
    });

    clock.advanceDays(5);

    const settlement = ReferencePayoutService.calculateVideoSettlement({
      editor,
      participants: [actor],
      views: 12000,
      config
    });

    assert.equal(settlement.editor.payout.total, 125);
    assert.equal(settlement.editor.payout.totalBonus, 0);
    assert.equal(settlement.actors[0].payout.total, 25);
    assert.equal(settlement.actors[0].payout.totalBonus, 0);
    assert.equal(settlement.totalPayout, 150);

    const updated = await db.videoRecord.update({
      where: { id: video.id },
      data: { status: 'CALCULATED', finalViews: 12000, totalPayout: 150 }
    });

    assert.equal(updated.status, 'CALCULATED');
    assert.equal(updated.totalPayout, 150);
  });

  await test('T4-03: Full lifecycle mid-tier video (750k views) with mid-flight profile and rate updates', async () => {
    // Day 0: Seed initial config & register talents
    await db.config.create({ data: { actorBase: 25, editorBase: 125, threshold1: 500000, bonus1: 25, threshold2: 1000000, bonus2: 25, waitDays: 5 } });
    await db.talent.upsert({ where: { discordId: 'ed_mid' }, update: {}, create: { role: 'EDITOR', paypal: 'ed_mid@mail.com' } });
    await db.talent.upsert({ where: { discordId: 'act_mid_1' }, update: {}, create: { role: 'ACTOR', paypal: 'act1_old@mail.com' } });
    await db.talent.upsert({ where: { discordId: 'act_mid_2' }, update: {}, create: { role: 'ACTOR', paypal: 'act2@mail.com' } });

    const videoId = 'mid_tier_vid';
    await db.videoRecord.create({
      data: {
        youtubeUrl: `https://youtu.be/${videoId}`,
        videoId,
        editorId: 'ed_mid',
        status: 'PENDING',
        scheduledDate: new Date(clock.now() + 5 * 86400000),
        participants: {
          create: [
            { talentId: 'act_mid_1', role: 'ACTOR' },
            { talentId: 'act_mid_2', role: 'ACTOR' }
          ]
        }
      },
      include: { participants: true }
    });

    // Day 2: Actor 1 updates PayPal
    clock.advanceDays(2);
    await db.talent.upsert({
      where: { discordId: 'act_mid_1' },
      update: { paypal: 'act1_new_payment@mail.com' },
      create: {}
    });

    // Day 3: Admin raises rates
    clock.advanceDays(1);
    await db.config.update({
      where: { id: 1 },
      data: { actorBase: 30, editorBase: 130, bonus1: 30 }
    });

    // Day 5: 5-Day maturity reached
    clock.advanceDays(2);

    youtube.setMockVideo(videoId, { title: 'Mid-Tier Hits', viewCount: 750000 });
    const freshConfig = await db.config.findFirst();
    const freshEditor = await db.talent.findUnique({ where: { discordId: 'ed_mid' } });
    const freshActors = await db.talent.findMany({ where: { discordId: { in: ['act_mid_1', 'act_mid_2'] } } });

    const settlement = ReferencePayoutService.calculateVideoSettlement({
      editor: freshEditor,
      participants: freshActors,
      views: 750000,
      config: freshConfig
    });

    // Calculation:
    // Editor: 130 + 30 = 160
    // Actor 1: 30 + 30 = 60
    // Actor 2: 30 + 30 = 60
    // Total: 280
    assert.equal(settlement.editor.payout.total, 160);
    assert.equal(settlement.actors[0].payout.total, 60);
    assert.equal(settlement.actors[1].payout.total, 60);
    assert.equal(settlement.totalPayout, 280);

    const adminOrder = ReferenceNotificationService.buildAdminPaymentOrder(settlement);
    const breakdown = adminOrder.fields.find(f => f.name === '📋 Desglose y Cuentas').value;

    assert.ok(breakdown.includes('act1_new_payment@mail.com'));
    assert.ok(!breakdown.includes('act1_old@mail.com'));
  });

  await test('T4-04: Full lifecycle multi-video batch settlement with varied maturity dates', async () => {
    const config = await db.config.create({ data: { actorBase: 25, editorBase: 125, threshold1: 500000, bonus1: 25, threshold2: 1000000, bonus2: 25, waitDays: 5 } });
    await db.talent.upsert({ where: { discordId: 'ed_batch' }, update: {}, create: { role: 'EDITOR', paypal: 'ed_batch@mail.com' } });

    const baseTime = clock.now();

    // Video A: Registered at Day 0 -> Mature at Day 5
    await db.videoRecord.create({
      data: {
        youtubeUrl: 'https://youtu.be/vid_batch_A',
        videoId: 'vid_batch_A',
        editorId: 'ed_batch',
        status: 'PENDING',
        scheduledDate: new Date(baseTime + 5 * 86400000)
      }
    });

    // Video B: Registered at Day 1 -> Mature at Day 6
    await db.videoRecord.create({
      data: {
        youtubeUrl: 'https://youtu.be/vid_batch_B',
        videoId: 'vid_batch_B',
        editorId: 'ed_batch',
        status: 'PENDING',
        scheduledDate: new Date(baseTime + 6 * 86400000)
      }
    });

    // Video C: Registered at Day 3 -> Mature at Day 8
    await db.videoRecord.create({
      data: {
        youtubeUrl: 'https://youtu.be/vid_batch_C',
        videoId: 'vid_batch_C',
        editorId: 'ed_batch',
        status: 'PENDING',
        scheduledDate: new Date(baseTime + 8 * 86400000)
      }
    });

    // Fast-forward to Day 6.5
    clock.advanceDays(6.5);

    // Query pending mature videos (Due date <= Day 6.5)
    const matureVideos = await db.videoRecord.findMany({
      where: {
        status: 'PENDING',
        scheduledDate: { lte: new Date(clock.now()) }
      }
    });

    // Video A and Video B should be mature; Video C should remain pending
    assert.equal(matureVideos.length, 2);
    const matureIds = matureVideos.map(v => v.videoId);
    assert.ok(matureIds.includes('vid_batch_A'));
    assert.ok(matureIds.includes('vid_batch_B'));
    assert.ok(!matureIds.includes('vid_batch_C'));

    // Process mature videos
    for (const v of matureVideos) {
      await db.videoRecord.update({
        where: { id: v.id },
        data: { status: 'CALCULATED', finalViews: 100000, totalPayout: 125 }
      });
    }

    // Verify remaining pending count
    const pendingRemaining = await db.videoRecord.findMany({ where: { status: 'PENDING' } });
    assert.equal(pendingRemaining.length, 1);
    assert.equal(pendingRemaining[0].videoId, 'vid_batch_C');

    // Run scheduler again -> Idempotent, 0 videos processed
    const secondPass = await db.videoRecord.findMany({
      where: { status: 'PENDING', scheduledDate: { lte: new Date(clock.now()) } }
    });
    assert.equal(secondPass.length, 0);
  });

  return results;
}
