import { describe, it, expect, beforeEach, afterAll } from 'bun:test';
import { prisma } from '../../src/database/prisma.js';
import { ConfigService } from '../../src/services/configService.js';
import { TalentService } from '../../src/services/talentService.js';
import { VideoService } from '../../src/services/videoService.js';
import { YouTubeService } from '../../src/services/youtubeService.js';
import { NotificationService } from '../../src/services/notificationService.js';
import { SchedulerService } from '../../src/services/schedulerService.js';
import pagarCmd from '../../commands/admin/pagar.js';
import interactionEvent from '../../events/server/interactionCreate.js';

describe('Deferred Settlement DMs: Admin Alert on 5-Day Calculation & Talent DMs on Mark as Paid', () => {
  const TEST_ADMIN_CHANNEL = 'admin_channel_deferred_test';
  const TEST_EDITOR_ID = 'user_editor_def_1';
  const TEST_ACTOR_1_ID = 'user_actor_def_1';
  const TEST_ACTOR_2_ID = 'user_actor_def_2';
  const TEST_YT_VIDEO_ID = 'dQw4w9WgXcQ';

  let mockClient;
  let adminChannelMessages;
  let sentUserDMs;

  beforeEach(async () => {
    // Reset database
    await prisma.videoParticipant.deleteMany({});
    await prisma.videoRecord.deleteMany({});
    await prisma.talent.deleteMany({});
    await prisma.config.deleteMany({});

    // Initialize config
    await ConfigService.init();
    await prisma.config.update({
      where: { id: 1 },
      data: {
        adminChannelId: TEST_ADMIN_CHANNEL,
        currency: 'MXN',
        actorBase: 25.0,
        editorBase: 125.0,
        threshold1: 500000,
        bonus1: 25.0,
        threshold2: 1000000,
        bonus2: 25.0,
        waitDays: 5
      }
    });
    await ConfigService.init();

    // Create talents
    await TalentService.upsertTalent({
      discordId: TEST_EDITOR_ID,
      role: 'EDITOR',
      paypal: 'editor@paypal.com',
      binance: 'BINANCE_ED'
    });

    await TalentService.upsertTalent({
      discordId: TEST_ACTOR_1_ID,
      role: 'ACTOR',
      paypal: 'actor1@paypal.com',
      binance: null
    });

    await TalentService.upsertTalent({
      discordId: TEST_ACTOR_2_ID,
      role: 'ACTOR',
      paypal: null,
      binance: 'BINANCE_ACT2'
    });

    // Mock YouTube details
    YouTubeService.setMockVideo(TEST_YT_VIDEO_ID, {
      videoId: TEST_YT_VIDEO_ID,
      title: 'Sonic Frontiers Final Boss Showcase',
      viewCount: 1200000,
      thumbnailUrl: 'https://img.youtube.com/vi/dQw4w9WgXcQ/hqdefault.jpg'
    });

    // Mock Client state
    adminChannelMessages = [];
    sentUserDMs = new Map();

    const createMockUser = (id) => ({
      id,
      send: async (payload) => {
        if (!sentUserDMs.has(id)) sentUserDMs.set(id, []);
        sentUserDMs.get(id).push(payload);
        return { id: `dm_msg_${Date.now()}_${id}`, ...payload };
      }
    });

    const mockAdminChannel = {
      id: TEST_ADMIN_CHANNEL,
      send: async (payload) => {
        const msg = {
          id: `msg_admin_${Date.now()}`,
          embeds: payload.embeds,
          components: payload.components,
          edit: async (updatePayload) => {
            msg.embeds = updatePayload.embeds;
            msg.components = updatePayload.components;
            return msg;
          }
        };
        adminChannelMessages.push(msg);
        return msg;
      }
    };

    mockClient = {
      channels: {
        cache: new Map([[TEST_ADMIN_CHANNEL, mockAdminChannel]]),
        fetch: async (id) => (id === TEST_ADMIN_CHANNEL ? mockAdminChannel : null)
      },
      users: {
        cache: new Map([
          [TEST_EDITOR_ID, createMockUser(TEST_EDITOR_ID)],
          [TEST_ACTOR_1_ID, createMockUser(TEST_ACTOR_1_ID)],
          [TEST_ACTOR_2_ID, createMockUser(TEST_ACTOR_2_ID)]
        ]),
        fetch: async (id) => mockClient.users.cache.get(id) || null
      }
    };
  });

  afterAll(async () => {
    await prisma.videoParticipant.deleteMany({});
    await prisma.videoRecord.deleteMany({});
    await prisma.talent.deleteMany({});
    await prisma.config.deleteMany({});
    await prisma.$disconnect();
    YouTubeService.clearMocks();
  });

  it('1. should alert admin channel upon 5-day calculation and NOT send DMs to participants yet', async () => {
    // Register a pending video whose scheduled date has matured (5 days ago)
    const fiveDaysAgo = new Date(Date.now() - 6 * 24 * 60 * 60 * 1000);
    const video = await VideoService.registerVideo({
      youtubeUrl: `https://www.youtube.com/watch?v=${TEST_YT_VIDEO_ID}`,
      editorDiscordId: TEST_EDITOR_ID,
      actorDiscordIds: [TEST_ACTOR_1_ID, TEST_ACTOR_2_ID]
    });

    // Manually force scheduledCalculationAt to the past to simulate 5-day maturity
    await prisma.videoRecord.update({
      where: { id: video.id },
      data: { scheduledCalculationAt: fiveDaysAgo }
    });

    // Execute scheduler calculation cycle
    const results = await SchedulerService.processPendingVideos(mockClient);

    expect(results.length).toBe(1);
    expect(results[0].videoRecord.status).toBe('CALCULATED');
    expect(results[0].views).toBe(1200000);

    // 1.1 Verify Admin Channel was alerted with payment order
    expect(adminChannelMessages.length).toBe(1);
    const adminMsg = adminChannelMessages[0];
    expect(adminMsg.embeds[0].data.title).toContain('Orden de Pago');
    expect(adminMsg.embeds[0].data.fields.some(f => f.name === '📊 Vistas Finales')).toBe(true);

    // 1.2 Verify that NO DMs were sent to participants during calculation
    expect(sentUserDMs.get(TEST_EDITOR_ID)).toBeUndefined();
    expect(sentUserDMs.get(TEST_ACTOR_1_ID)).toBeUndefined();
    expect(sentUserDMs.get(TEST_ACTOR_2_ID)).toBeUndefined();
  });

  it('2. should alert admin channel on settleVideo (!liquidar) and NOT send DMs to participants', async () => {
    const video = await VideoService.registerVideo({
      youtubeUrl: `https://www.youtube.com/watch?v=${TEST_YT_VIDEO_ID}`,
      editorDiscordId: TEST_EDITOR_ID,
      actorDiscordIds: [TEST_ACTOR_1_ID]
    });

    const result = await SchedulerService.settleVideo(video.id, mockClient);

    expect(result.videoRecord.status).toBe('CALCULATED');
    expect(adminChannelMessages.length).toBe(1);

    // No DMs to editor or actor yet
    expect(sentUserDMs.get(TEST_EDITOR_ID)).toBeUndefined();
    expect(sentUserDMs.get(TEST_ACTOR_1_ID)).toBeUndefined();
  });

  it('3. should dispatch private payment DMs to all participants when marked as PAID via !pagar command', async () => {
    // Setup a CALCULATED video
    const video = await VideoService.registerVideo({
      youtubeUrl: `https://www.youtube.com/watch?v=${TEST_YT_VIDEO_ID}`,
      editorDiscordId: TEST_EDITOR_ID,
      actorDiscordIds: [TEST_ACTOR_1_ID, TEST_ACTOR_2_ID]
    });

    await SchedulerService.settleVideo(video.id, mockClient);
    expect(sentUserDMs.size).toBe(0); // Still 0 DMs

    // Execute !pagar command by Admin
    let replyPayload = null;
    const mockMessage = {
      author: { id: 'admin_exec_user', tag: 'AdminBoss#0001' },
      reply: async (payload) => {
        replyPayload = payload;
        return payload;
      }
    };

    await pagarCmd.run(mockClient, mockMessage, [video.id], '!');

    expect(replyPayload).not.toBeNull();
    expect(replyPayload.embeds[0].data.title).toContain('Video Marcado como Pagado');

    // 3.1 Verify database record is PAID
    const dbVideo = await prisma.videoRecord.findUnique({ where: { id: video.id } });
    expect(dbVideo.status).toBe('PAID');

    // 3.2 Verify participants received the payment completed DMs
    expect(sentUserDMs.has(TEST_EDITOR_ID)).toBe(true);
    expect(sentUserDMs.has(TEST_ACTOR_1_ID)).toBe(true);
    expect(sentUserDMs.has(TEST_ACTOR_2_ID)).toBe(true);

    const editorDM = sentUserDMs.get(TEST_EDITOR_ID)[0];
    expect(editorDM.embeds[0].data.title).toContain('Pago Realizado');
    expect(editorDM.embeds[0].data.description).toContain('ha completado y transferido tu pago');
    expect(editorDM.embeds[0].data.fields.some(f => f.name === '🎭 Tu Rol' && f.value === '🎬 Editor')).toBe(true);
    expect(editorDM.embeds[0].data.fields.some(f => f.name === '💰 Monto Total Transferido')).toBe(true);
    expect(editorDM.embeds[0].data.fields.some(f => f.name === '💳 Cuenta de Destino' && f.value.includes('editor@paypal.com'))).toBe(true);

    const actorDM = sentUserDMs.get(TEST_ACTOR_1_ID)[0];
    expect(actorDM.embeds[0].data.title).toContain('Pago Realizado');
    expect(actorDM.embeds[0].data.fields.some(f => f.name === '🎭 Tu Rol' && f.value === '🎭 Actor')).toBe(true);
    expect(actorDM.embeds[0].data.fields.some(f => f.name === '💳 Cuenta de Destino' && f.value.includes('actor1@paypal.com'))).toBe(true);
  });

  it('4. should dispatch private payment DMs to all participants when marked as PAID via order_btn_mark_paid button', async () => {
    // Setup a CALCULATED video
    const video = await VideoService.registerVideo({
      youtubeUrl: `https://www.youtube.com/watch?v=${TEST_YT_VIDEO_ID}`,
      editorDiscordId: TEST_EDITOR_ID,
      actorDiscordIds: [TEST_ACTOR_1_ID]
    });

    await SchedulerService.settleVideo(video.id, mockClient);
    expect(sentUserDMs.size).toBe(0);

    // Simulate Admin clicking "Marcar como Pagado" button on Discord
    let updatedInteraction = null;
    let followUpPayload = null;

    const mockButtonInteraction = {
      isButton: () => true,
      isChannelSelectMenu: () => false,
      isUserSelectMenu: () => false,
      isStringSelectMenu: () => false,
      customId: `order_btn_mark_paid:${video.id}`,
      user: { id: 'admin_btn_user', tag: 'SuperAdmin#0001' },
      memberPermissions: { has: () => true },
      message: {
        embeds: [{ title: '💰 Orden de Pago', fields: [{ name: '📌 Estado', value: '`📝 CALCULADO`' }] }]
      },
      update: async (payload) => {
        updatedInteraction = payload;
        return payload;
      },
      followUp: async (payload) => {
        followUpPayload = payload;
        return payload;
      },
      reply: async (p) => p
    };

    await interactionEvent.run(mockClient, mockButtonInteraction);

    // 4.1 Verify message in admin channel was updated to PAID
    expect(updatedInteraction).not.toBeNull();
    const estadoField = updatedInteraction.embeds[0].data.fields.find(f => f.name === '📌 Estado');
    expect(estadoField.value).toContain('PAGADO');

    // 4.2 Verify ephemeral followUp was sent
    expect(followUpPayload).not.toBeNull();
    expect(followUpPayload.content).toContain('Aviso a Talentos');

    // 4.3 Verify DMs were sent to participants
    expect(sentUserDMs.has(TEST_EDITOR_ID)).toBe(true);
    expect(sentUserDMs.has(TEST_ACTOR_1_ID)).toBe(true);

    const edDM = sentUserDMs.get(TEST_EDITOR_ID)[0];
    expect(edDM.embeds[0].data.title).toContain('Pago Realizado');
  });

  it('5. should handle closed DMs gracefully without failing the mark-paid process', async () => {
    // User with closed DMs
    mockClient.users.cache.set('closed_dm_user', {
      id: 'closed_dm_user',
      send: async () => {
        const err = new Error('Cannot send messages to this user');
        err.code = 50007;
        throw err;
      }
    });

    await TalentService.upsertTalent({
      discordId: 'closed_dm_user',
      role: 'ACTOR',
      paypal: 'closed@mail.com'
    });

    const video = await VideoService.registerVideo({
      youtubeUrl: `https://www.youtube.com/watch?v=${TEST_YT_VIDEO_ID}`,
      editorDiscordId: null,
      actorDiscordIds: ['closed_dm_user']
    });

    await SchedulerService.settleVideo(video.id, mockClient);

    // Execute !pagar
    const mockMessage = {
      author: { id: 'admin_user', tag: 'Admin#0001' },
      reply: async (p) => p
    };

    await pagarCmd.run(mockClient, mockMessage, [video.id], '!');

    const dbVideo = await prisma.videoRecord.findUnique({ where: { id: video.id } });
    expect(dbVideo.status).toBe('PAID');
  });
});
