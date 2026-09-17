import { describe, it, expect, beforeEach, afterAll } from 'bun:test';
import { prisma } from '../../src/database/prisma.js';
import { ConfigService } from '../../src/services/configService.js';
import { TalentService } from '../../src/services/talentService.js';
import { VideoService } from '../../src/services/videoService.js';
import { YouTubeService } from '../../src/services/youtubeService.js';
import { WeeklySummaryService, parseDayOfWeek, DAYS_OF_WEEK } from '../../src/services/weeklySummaryService.js';
import { SchedulerService } from '../../src/services/schedulerService.js';
import resumenCmd from '../../commands/admin/resumensemanal.js';
import interactionEvent from '../../events/server/interactionCreate.js';

describe('Weekly Summary System (Resúmenes Semanales con Pre-cálculo y Ping @everyone)', () => {
  const TEST_ADMIN_CHANNEL = '123456789012345678';
  const TEST_SUMMARY_CHANNEL = '123456789012345679';
  const TEST_EDITOR_ID = '111111111111111111';
  const TEST_ACTOR_1_ID = '222222222222222222';
  const TEST_ACTOR_2_ID = '333333333333333333';

  let mockClient;
  let sentMessages;

  beforeEach(async () => {
    // 1. Clear database
    await prisma.videoParticipant.deleteMany({});
    await prisma.videoRecord.deleteMany({});
    await prisma.talent.deleteMany({});
    await prisma.config.deleteMany({});

    // 2. Initialize default config
    await ConfigService.init();
    await prisma.config.update({
      where: { id: 1 },
      data: {
        adminChannelId: TEST_ADMIN_CHANNEL,
        weeklySummaryChannelId: TEST_SUMMARY_CHANNEL,
        weeklySummaryEnabled: true,
        weeklySummaryDay: 5, // Friday
        weeklySummaryHour: 20,
        weeklySummaryMinute: 0,
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

    // 3. Register test talents
    await TalentService.upsertTalent({
      discordId: TEST_EDITOR_ID,
      role: 'EDITOR',
      paypal: 'editor_weekly@paypal.com',
      binance: 'BINANCE_ED_WEEKLY'
    });

    await TalentService.upsertTalent({
      discordId: TEST_ACTOR_1_ID,
      role: 'ACTOR',
      paypal: 'actor1_weekly@paypal.com',
      binance: null
    });

    await TalentService.upsertTalent({
      discordId: TEST_ACTOR_2_ID,
      role: 'ACTOR',
      paypal: null,
      binance: 'BINANCE_ACT2_WEEKLY'
    });

    // 4. Mock YouTubeService details
    YouTubeService.getVideoDetails = async (videoId) => {
      return {
        videoId,
        title: `Test Video ${videoId}`,
        viewCount: 600000, // Meets threshold 1 (+$25 bonus)
        thumbnailUrl: `https://img.youtube.com/vi/${videoId}/maxresdefault.jpg`
      };
    };

    // 5. Mock Discord Client and Channel
    sentMessages = [];
    const mockChannel = {
      id: TEST_SUMMARY_CHANNEL,
      send: async (payload) => {
        const msg = {
          id: `msg_summary_${Date.now()}_${Math.random()}`,
          ...payload,
          edit: async (newPayload) => {
            Object.assign(msg, typeof newPayload === 'string' ? { content: newPayload } : newPayload);
            return msg;
          }
        };
        sentMessages.push(msg);
        return msg;
      }
    };

    const mockUser = {
      id: TEST_ACTOR_1_ID,
      tag: 'User1#0001',
      send: async (payload) => {
        const msg = {
          id: `dm_${Date.now()}_${Math.random()}`,
          ...payload
        };
        sentMessages.push(msg);
        return msg;
      }
    };

    mockClient = {
      user: { id: 'bot_id', tag: 'SonicBot#0001' },
      channels: {
        cache: new Map([[TEST_SUMMARY_CHANNEL, mockChannel], [TEST_ADMIN_CHANNEL, mockChannel]]),
        fetch: async (id) => (id === TEST_SUMMARY_CHANNEL || id === TEST_ADMIN_CHANNEL ? mockChannel : null)
      },
      users: {
        cache: new Map([[TEST_ACTOR_1_ID, mockUser]]),
        fetch: async (id) => (id === TEST_ACTOR_1_ID ? mockUser : null)
      }
    };
  });

  afterAll(async () => {
    await prisma.videoParticipant.deleteMany({});
    await prisma.videoRecord.deleteMany({});
    await prisma.talent.deleteMany({});
    await prisma.config.deleteMany({});
  });

  it('1. parseDayOfWeek should parse numbers, Spanish names, and abbreviations accurately', () => {
    expect(parseDayOfWeek(0)).toBe(0);
    expect(parseDayOfWeek(5)).toBe(5);
    expect(parseDayOfWeek(6)).toBe(6);
    expect(parseDayOfWeek('0')).toBe(0);
    expect(parseDayOfWeek('5')).toBe(5);
    expect(parseDayOfWeek('viernes')).toBe(5);
    expect(parseDayOfWeek('Vie')).toBe(5);
    expect(parseDayOfWeek('domingo')).toBe(0);
    expect(parseDayOfWeek('LUNES')).toBe(1);
    expect(parseDayOfWeek('miércoles')).toBe(3);
    expect(parseDayOfWeek('miercoles')).toBe(3);
    expect(parseDayOfWeek('sabado')).toBe(6);
    expect(parseDayOfWeek('invalid_day')).toBeNull();
    expect(parseDayOfWeek(7)).toBeNull();
    expect(parseDayOfWeek(-1)).toBeNull();
  });

  it('2. ConfigService should update weekly summary fields with validation', async () => {
    const resDay = await ConfigService.updateConfig('resumen_dia', 4);
    expect(resDay.newValue).toBe(4);

    const resHour = await ConfigService.updateConfig('resumen_hora', 19);
    expect(resHour.newValue).toBe(19);

    const resActive = await ConfigService.updateConfig('resumen_activo', 'no');
    expect(resActive.newValue).toBe(false);

    const updated = await ConfigService.getConfig();
    expect(updated.weeklySummaryDay).toBe(4);
    expect(updated.weeklySummaryHour).toBe(19);
    expect(updated.weeklySummaryEnabled).toBe(false);

    // Bounds checking
    expect(ConfigService.updateConfig('resumen_dia', 7)).rejects.toThrow();
    expect(ConfigService.updateConfig('resumen_dia', -1)).rejects.toThrow();
    expect(ConfigService.updateConfig('resumen_hora', 24)).rejects.toThrow();
    expect(ConfigService.updateConfig('resumen_minuto', 60)).rejects.toThrow();
  });

  it('3. settleSameDayPendingVideos should pre-calculate same-day pending videos and leave future videos pending', async () => {
    // Reference date: Friday Sept 18 at 20:00:00
    const summaryDate = new Date('2026-09-18T20:00:00.000Z');

    // Video A: Already mature 2 days ago (Wednesday Sept 16) -> PENDING
    const vidPast = await VideoService.registerVideo({
      youtubeUrl: 'https://www.youtube.com/watch?v=vidPast11111',
      editorDiscordId: TEST_EDITOR_ID,
      actorDiscordIds: [TEST_ACTOR_1_ID]
    });
    await prisma.videoRecord.update({
      where: { id: vidPast.id },
      data: {
        scheduledCalculationAt: new Date('2026-09-16T15:00:00.000Z')
      }
    });

    // Video B: Scheduled to mature on the SAME day as summary (Friday Sept 18 at 22:30:00 - 2.5 hours after summary time)
    const vidSameDay = await VideoService.registerVideo({
      youtubeUrl: 'https://www.youtube.com/watch?v=vidSameDay22',
      editorDiscordId: TEST_EDITOR_ID,
      actorDiscordIds: [TEST_ACTOR_2_ID]
    });
    await prisma.videoRecord.update({
      where: { id: vidSameDay.id },
      data: {
        scheduledCalculationAt: new Date('2026-09-18T22:30:00.000Z')
      }
    });

    // Video C: Scheduled to mature TOMORROW (Saturday Sept 19 at 10:00:00) -> Must remain PENDING
    const vidFuture = await VideoService.registerVideo({
      youtubeUrl: 'https://www.youtube.com/watch?v=vidFuture333',
      editorDiscordId: TEST_EDITOR_ID,
      actorDiscordIds: [TEST_ACTOR_1_ID, TEST_ACTOR_2_ID]
    });
    await prisma.videoRecord.update({
      where: { id: vidFuture.id },
      data: {
        scheduledCalculationAt: new Date('2026-09-19T10:00:00.000Z')
      }
    });

    // Execute same-day pre-calculation
    const settled = await WeeklySummaryService.settleSameDayPendingVideos(mockClient, summaryDate);

    // Both past and same-day videos should be settled
    expect(settled.length).toBe(2);

    const refreshedPast = await prisma.videoRecord.findUnique({ where: { id: vidPast.id } });
    const refreshedSameDay = await prisma.videoRecord.findUnique({ where: { id: vidSameDay.id } });
    const refreshedFuture = await prisma.videoRecord.findUnique({ where: { id: vidFuture.id } });

    expect(refreshedPast.status).toBe('CALCULATED');
    expect(refreshedSameDay.status).toBe('CALCULATED');
    // Future video MUST remain strictly PENDING
    expect(refreshedFuture.status).toBe('PENDING');
  });

  it('4. getWeeklyCalculatedVideos should only include calculated videos in the weekly window and exclude pending future videos', async () => {
    const summaryDate = new Date('2026-09-18T20:00:00.000Z');

    // Create 1 calculated video within this week
    const v1 = await VideoService.registerVideo({
      youtubeUrl: 'https://www.youtube.com/watch?v=weeklyVid111',
      editorDiscordId: TEST_EDITOR_ID,
      actorDiscordIds: [TEST_ACTOR_1_ID]
    });
    await SchedulerService.settleVideo(v1.id, mockClient);

    // Create 1 pending video maturing next week
    const v2 = await VideoService.registerVideo({
      youtubeUrl: 'https://www.youtube.com/watch?v=weeklyVid222',
      editorDiscordId: TEST_EDITOR_ID,
      actorDiscordIds: [TEST_ACTOR_2_ID]
    });
    await prisma.videoRecord.update({
      where: { id: v2.id },
      data: {
        scheduledCalculationAt: new Date('2026-09-25T12:00:00.000Z')
      }
    });

    const calculatedList = await WeeklySummaryService.getWeeklyCalculatedVideos(summaryDate);

    expect(calculatedList.length).toBe(1);
    expect(calculatedList[0].id).toBe(v1.id);
    expect(calculatedList[0].status).toBe('CALCULATED');
  });

  it('5. buildWeeklySummaryPage and buildWeeklySummaryComponents should build formatted paginated embeds with payment links and navigation buttons', async () => {
    const v = await VideoService.registerVideo({
      youtubeUrl: 'https://www.youtube.com/watch?v=pageVid11111',
      editorDiscordId: TEST_EDITOR_ID,
      actorDiscordIds: [TEST_ACTOR_1_ID]
    });
    await SchedulerService.settleVideo(v.id, mockClient);

    const videos = await WeeklySummaryService.getWeeklyCalculatedVideos(new Date());
    const config = await ConfigService.getConfig();

    const embed = WeeklySummaryService.buildWeeklySummaryPage({
      videos,
      page: 1,
      config
    });

    expect(embed.data.title).toContain('Resumen Semanal');
    expect(embed.data.footer.text).toContain('Página 1 de 1');
    expect(embed.data.description).toContain('Total Semana:');

    // Verify Monospace Payment Methods block
    const copyBlockField = embed.data.fields.find(f => f.name.includes('Datos para Transferencia'));
    expect(copyBlockField).toBeDefined();
    expect(copyBlockField.value).toContain('=== MÉTODOS DE PAGO ===');
    expect(copyBlockField.value).toContain('[EDITOR]');
    expect(copyBlockField.value).toContain('[ACTOR]');

    // Verify Direct Checkout Quick Links field
    const linksField = embed.data.fields.find(f => f.name.includes('Enlaces de Pago Rápido'));
    expect(linksField).toBeDefined();
    expect(linksField.value).toContain('paypal.com');

    // Verify pagination components
    const components = WeeklySummaryService.buildWeeklySummaryComponents(1, 3);
    expect(components.length).toBe(1);
    const buttons = components[0].components;
    expect(buttons.length).toBe(3);
    // Prev button should be disabled on page 1
    expect(buttons[0].data.disabled).toBe(true);
    // Page indicator
    expect(buttons[1].data.label).toBe('Página 1 / 3');
    // Next button should be enabled
    expect(buttons[2].data.disabled).toBe(false);

    // Verify 1-page summary NEVER has duplicate customIds (avoids COMPONENT_CUSTOM_ID_DUPLICATED Discord error)
    const singlePageComponents = WeeklySummaryService.buildWeeklySummaryComponents(1, 1);
    const customIds = singlePageComponents[0].components.map(c => c.data.custom_id);
    const uniqueIds = new Set(customIds);
    expect(uniqueIds.size).toBe(customIds.length);
    expect(customIds[0]).toBe('summary_page:prev:1');
    expect(customIds[1]).toBe('summary_page:info:1');
    expect(customIds[2]).toBe('summary_page:next:1');
  });

  it('6. executeWeeklySummary should dispatch message with @everyone ping and allowedMentions', async () => {
    const summaryDate = new Date('2026-09-18T20:00:00.000Z');

    // Register and mature a video on the same day
    const v = await VideoService.registerVideo({
      youtubeUrl: 'https://www.youtube.com/watch?v=dispatchVid1',
      editorDiscordId: TEST_EDITOR_ID,
      actorDiscordIds: [TEST_ACTOR_1_ID]
    });
    await prisma.videoRecord.update({
      where: { id: v.id },
      data: { scheduledCalculationAt: new Date('2026-09-18T18:00:00.000Z') }
    });

    const result = await WeeklySummaryService.executeWeeklySummary(mockClient, {
      force: true,
      pingEveryone: true,
      referenceDate: summaryDate
    });

    expect(result.success).toBe(true);
    expect(result.totalVideos).toBe(1);
    expect(sentMessages.length).toBeGreaterThanOrEqual(1);

    const summaryMsg = sentMessages.find(m => m.content && m.content.includes('@everyone'));
    expect(summaryMsg).toBeDefined();
    expect(summaryMsg.content).toContain('@everyone');
    expect(summaryMsg.allowedMentions.parse).toContain('everyone');

    // Config lastWeeklySummaryAt should be set
    const updatedConfig = await ConfigService.getConfig(true);
    expect(updatedConfig.lastWeeklySummaryAt).not.toBeNull();
  });

  it('7. SchedulerService.checkAndRunWeeklySummary should trigger when day, hour, and minute match', async () => {
    await ConfigService.updateConfig('weeklySummaryDay', 5);
    await ConfigService.updateConfig('weeklySummaryHour', 20);
    await ConfigService.updateConfig('weeklySummaryMinute', 0);
    await ConfigService.updateConfig('weeklySummaryEnabled', true);

    // Trigger date: Friday (day 5) at 20:00
    // In UTC, Friday 2026-09-18 is day 5
    const triggerDate = new Date();
    // Force day 5, hour 20, minute 0 in local time
    const dayDiff = (5 - triggerDate.getDay() + 7) % 7;
    triggerDate.setDate(triggerDate.getDate() + dayDiff);
    triggerDate.setHours(20, 0, 0, 0);

    const triggered = await SchedulerService.checkAndRunWeeklySummary(mockClient, triggerDate);
    expect(triggered).toBe(true);

    // Immediate second run should be skipped due to 2-minute debounce guard
    const immediateRepeat = await SchedulerService.checkAndRunWeeklySummary(mockClient, triggerDate);
    expect(immediateRepeat).toBe(false);
  });

  it('8. resumen-semanal admin command should handle enviar, preview, and config subcommands', async () => {
    let replyCalls = [];
    const mockMessage = {
      author: { id: 'admin_user_1', username: 'Admin' },
      reply: async (payload) => {
        const res = {
          ...payload,
          edit: async (newContent) => {
            res.editedContent = newContent;
            return res;
          }
        };
        replyCalls.push(res);
        return res;
      }
    };

    // Subcommand: config
    await resumenCmd.run(mockClient, mockMessage, ['config', 'viernes', '21', '30'], '!');
    expect(replyCalls.length).toBe(1);
    const lastReply = replyCalls[replyCalls.length - 1];
    expect(lastReply.embeds[0].data.title).toContain('Actualizado');

    const config = await ConfigService.getConfig();
    expect(config.weeklySummaryDay).toBe(5);
    expect(config.weeklySummaryHour).toBe(21);
    expect(config.weeklySummaryMinute).toBe(30);

    // Subcommand: preview
    await resumenCmd.run(mockClient, mockMessage, ['preview'], '!');
    const previewReply = replyCalls[replyCalls.length - 1];
    expect(previewReply.content).toContain('Vista Previa');
    expect(previewReply.embeds[0].data.title).toContain('Resumen Semanal');

    // Subcommand: default status panel
    await resumenCmd.run(mockClient, mockMessage, [], '!');
    const panelReply = replyCalls[replyCalls.length - 1];
    expect(panelReply.embeds[0].data.title).toContain('Control del Resumen Semanal');
    expect(panelReply.components.length).toBe(1);
  });

  it('9. interactionCreate should handle summary_page:goto: pagination button clicks', async () => {
    // Seed 2 calculated videos
    const v1 = await VideoService.registerVideo({
      youtubeUrl: 'https://www.youtube.com/watch?v=interVid111',
      editorDiscordId: TEST_EDITOR_ID,
      actorDiscordIds: [TEST_ACTOR_1_ID]
    });
    const v2 = await VideoService.registerVideo({
      youtubeUrl: 'https://www.youtube.com/watch?v=interVid222',
      editorDiscordId: TEST_EDITOR_ID,
      actorDiscordIds: [TEST_ACTOR_2_ID]
    });
    await SchedulerService.settleVideo(v1.id, mockClient);
    await SchedulerService.settleVideo(v2.id, mockClient);

    let updatedPayload = null;
    const mockInteraction = {
      isButton: () => true,
      customId: 'summary_page:next:2',
      user: { id: 'admin_user_1' },
      memberPermissions: { has: () => true },
      update: async (payload) => {
        updatedPayload = payload;
        return payload;
      }
    };

    await interactionEvent.run(mockClient, mockInteraction);

    expect(updatedPayload).not.toBeNull();
    expect(updatedPayload.embeds[0].data.footer.text).toContain('Página 2 de 2');
  });

  it('10. sendWeeklySummaryDM should dispatch paginated summary directly to specified user DM', async () => {
    // Seed 1 calculated video
    const v = await VideoService.registerVideo({
      youtubeUrl: 'https://www.youtube.com/watch?v=dmVid1111111',
      editorDiscordId: TEST_EDITOR_ID,
      actorDiscordIds: [TEST_ACTOR_1_ID]
    });
    await SchedulerService.settleVideo(v.id, mockClient);

    const result = await WeeklySummaryService.sendWeeklySummaryDM(mockClient, TEST_ACTOR_1_ID);
    expect(result.success).toBe(true);
    expect(result.messageId).toBeDefined();

    const dmMsg = sentMessages.find(m => m.id?.startsWith('dm_'));
    expect(dmMsg).toBeDefined();
    expect(dmMsg.content).toContain('Resumen Semanal de Liquidaciones');
    expect(dmMsg.embeds.length).toBe(1);
    expect(dmMsg.embeds[0].data.title).toContain('Resumen Semanal');
  });

  it('11. executeWeeklySummary should dispatch to user DM when weeklySummaryDmEnabled is true', async () => {
    // Enable optional DM
    await ConfigService.updateConfig('weeklySummaryDmUserId', TEST_ACTOR_1_ID);
    await ConfigService.updateConfig('weeklySummaryDmEnabled', true);

    const v = await VideoService.registerVideo({
      youtubeUrl: 'https://www.youtube.com/watch?v=dmAutoVid222',
      editorDiscordId: TEST_EDITOR_ID,
      actorDiscordIds: [TEST_ACTOR_1_ID]
    });
    await SchedulerService.settleVideo(v.id, mockClient);

    const result = await WeeklySummaryService.executeWeeklySummary(mockClient, {
      force: true,
      pingEveryone: true
    });

    expect(result.success).toBe(true);
    expect(result.dmResult).toBeDefined();
    expect(result.dmResult.success).toBe(true);

    const dmMsg = sentMessages.find(m => m.id?.startsWith('dm_'));
    expect(dmMsg).toBeDefined();
  });

  it('12. resumen-semanal md subcommand should configure recipient, toggle state, and support manual dispatch', async () => {
    let replyCalls = [];
    const mockMessage = {
      author: { id: 'admin_user_1', username: 'Admin' },
      reply: async (payload) => {
        const base = typeof payload === 'string' ? { content: payload } : payload;
        const res = {
          ...base,
          edit: async (newContent) => {
            res.editedContent = typeof newContent === 'string' ? newContent : newContent.content;
            return res;
          }
        };
        replyCalls.push(res);
        return res;
      }
    };

    // 1. Assign user: !resumen-semanal md @user
    await resumenCmd.run(mockClient, mockMessage, ['md', `<@${TEST_ACTOR_1_ID}>`], '!');
    expect(replyCalls[replyCalls.length - 1].content).toContain('Usuario de recepción por MD configurado');

    let cfg = await ConfigService.getConfig();
    expect(cfg.weeklySummaryDmUserId).toBe(TEST_ACTOR_1_ID);
    expect(cfg.weeklySummaryDmEnabled).toBe(true);

    // 2. Deactivate: !resumen-semanal md off
    await resumenCmd.run(mockClient, mockMessage, ['md', 'off'], '!');
    expect(replyCalls[replyCalls.length - 1].content).toContain('desactivado');
    cfg = await ConfigService.getConfig();
    expect(cfg.weeklySummaryDmEnabled).toBe(false);

    // 3. Activate: !resumen-semanal md on
    await resumenCmd.run(mockClient, mockMessage, ['md', 'on'], '!');
    expect(replyCalls[replyCalls.length - 1].content).toContain('activado');
    cfg = await ConfigService.getConfig();
    expect(cfg.weeklySummaryDmEnabled).toBe(true);

    // 4. Send now: !resumen-semanal md enviar
    await resumenCmd.run(mockClient, mockMessage, ['md', 'enviar', `<@${TEST_ACTOR_1_ID}>`], '!');
    const sendReply = replyCalls[replyCalls.length - 1];
    expect(sendReply.editedContent).toContain('exitosamente');
  });
});

