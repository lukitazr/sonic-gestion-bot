import { describe, it, expect, beforeEach, afterEach, afterAll } from 'bun:test';
import { PermissionFlagsBits } from 'discord.js';
import { prisma } from '../../src/database/prisma.js';
import { ConfigService } from '../../src/services/configService.js';
import { TalentService } from '../../src/services/talentService.js';
import { YouTubeService } from '../../src/services/youtubeService.js';
import { SchedulerService } from '../../src/services/schedulerService.js';
import liquidarCommand from '../../commands/admin/liquidar.js';
import pagarCommand from '../../commands/admin/pagar.js';
import ayudaCommand from '../../commands/info/ayuda.js';
import readyEvent from '../../events/client/ready.js';

describe('Milestone 5: Liquidar Command, Ayuda Command & Ready Event (Unit Tests)', () => {
  beforeEach(async () => {
    SchedulerService.stopScheduler();
    YouTubeService.clearMocks();
    await prisma.videoParticipant.deleteMany({});
    await prisma.videoRecord.deleteMany({});
    await prisma.talent.deleteMany({});
    await ConfigService.resetDefaults();
  });

  afterEach(() => {
    SchedulerService.stopScheduler();
    YouTubeService.clearMocks();
  });

  afterAll(async () => {
    SchedulerService.stopScheduler();
    await prisma.videoParticipant.deleteMany({});
    await prisma.videoRecord.deleteMany({});
    await prisma.talent.deleteMany({});
    await prisma.$disconnect();
  });

  // =========================================================================
  // 1. Liquidar Command Definition & Execution
  // =========================================================================
  describe('1. liquidar Command Definition & Structure', () => {
    it('1.1 should conform to discord-bot-architecture command structure', () => {
      expect(liquidarCommand.name).toBe('liquidar');
      expect(Array.isArray(liquidarCommand.aliases)).toBe(true);
      expect(liquidarCommand.aliases).toContain('forzar-calculo');
      expect(liquidarCommand.aliases).toContain('liquidar-video');
      expect(liquidarCommand.aliases).toContain('calcular-video');
      expect(liquidarCommand.permisos).toContain(PermissionFlagsBits.Administrator);
      expect(typeof liquidarCommand.run).toBe('function');
    });

    it('1.2 should display usage embed when called with no arguments', async () => {
      let sentEmbed = null;
      const mockMessage = {
        author: { tag: 'AdminUser#0001' },
        reply: async (payload) => {
          sentEmbed = payload.embeds?.[0];
          return payload;
        }
      };

      await liquidarCommand.run({}, mockMessage, [], '!');
      expect(sentEmbed).not.toBeNull();
      expect(sentEmbed.data.title).toContain('Uso del Comando Liquidar');
    });

    it('1.3 should return error reply when video is not found', async () => {
      let replyMessage = null;
      const mockMessage = {
        author: { tag: 'AdminUser#0001' },
        reply: async (payload) => {
          replyMessage = typeof payload === 'string' ? payload : payload.content;
          return payload;
        }
      };

      await liquidarCommand.run({}, mockMessage, ['non_existent_id'], '!');
      expect(replyMessage).toContain('❌ **Error al liquidar video:**');
      expect(replyMessage).toContain('No se encontró ningún video registrado');
    });

    it('1.4 should return error reply when video is already CALCULATED', async () => {
      await TalentService.upsertTalent({ discordId: 'ed_already', role: 'EDITOR', paypal: 'ed@test.com' });

      await prisma.videoRecord.create({
        data: {
          youtubeUrl: 'https://youtu.be/already_done',
          youtubeVideoId: 'already_done',
          editorId: 'ed_already',
          scheduledCalculationAt: new Date(),
          status: 'CALCULATED',
          finalViews: 500000,
          totalAmount: 150
        }
      });

      let replyMessage = null;
      const mockMessage = {
        author: { tag: 'AdminUser#0001' },
        reply: async (payload) => {
          replyMessage = typeof payload === 'string' ? payload : payload.content;
          return payload;
        }
      };

      await liquidarCommand.run({}, mockMessage, ['already_done'], '!');
      expect(replyMessage).toContain('❌ **Error al liquidar video:**');
      expect(replyMessage).toContain('ya ha sido liquidado previamente');
    });

    it('1.5 should successfully execute manual settlement for pending video and dispatch notifications', async () => {
      await TalentService.upsertTalent({ discordId: 'ed_man_exec', role: 'EDITOR', paypal: 'ed_exec@pay.com', binance: 'BIN_ED_EXEC' });
      await TalentService.upsertTalent({ discordId: 'act_man_exec', role: 'ACTOR', paypal: 'act_exec@pay.com' });

      YouTubeService.setMockVideo('man_exec_vid', {
        title: 'Sonic Frontiers Boss Speedrun',
        viewCount: 1100000 // Reaches 1M bonus threshold (Tier 2)
      });

      const video = await prisma.videoRecord.create({
        data: {
          youtubeUrl: 'https://www.youtube.com/watch?v=man_exec_vid',
          youtubeVideoId: 'man_exec_vid',
          editorId: 'ed_man_exec',
          scheduledCalculationAt: new Date(Date.now() + 5 * 86400000), // Future scheduled date
          status: 'PENDING',
          participants: {
            create: [{ talentId: 'act_man_exec', role: 'ACTOR' }]
          }
        }
      });

      let sentAdminOrder = null;
      const mockAdminChannel = {
        id: 'admin_chan_id',
        send: async (payload) => {
          sentAdminOrder = payload;
          return { id: 'admin_msg_001', ...payload };
        }
      };

      const userDMs = new Map();
      const mockClient = {
        adminChannelId: 'admin_chan_id',
        channels: {
          cache: new Map([['admin_chan_id', mockAdminChannel]]),
          fetch: async (id) => id === 'admin_chan_id' ? mockAdminChannel : null
        },
        users: {
          cache: new Map([
            ['ed_man_exec', { id: 'ed_man_exec', send: async (payload) => userDMs.set('ed_man_exec', payload) }],
            ['act_man_exec', { id: 'act_man_exec', send: async (payload) => userDMs.set('act_man_exec', payload) }]
          ]),
          fetch: async (id) => mockClient.users.cache.get(id) || null
        }
      };

      let successEmbed = null;
      const mockMessage = {
        author: { tag: 'AdminChief#9999' },
        reply: async (payload) => {
          successEmbed = payload.embeds?.[0];
          return payload;
        }
      };

      await liquidarCommand.run(mockClient, mockMessage, ['man_exec_vid'], '!');

      // 1. Verify reply embed
      expect(successEmbed).not.toBeNull();
      expect(successEmbed.data.title).toContain('Video Liquidado Exitosamente');
      expect(successEmbed.data.description).toContain('orden de pago detallada fue emitida');

      // 2. Verify DB persistence
      const updatedVideo = await prisma.videoRecord.findUnique({
        where: { id: video.id },
        include: { participants: true }
      });
      expect(updatedVideo.status).toBe('CALCULATED');
      expect(updatedVideo.finalViews).toBe(1100000);
      expect(updatedVideo.totalAmount).toBe(250.0); // Editor: 125+50=175, Actor: 25+50=75, Total: 250
      expect(updatedVideo.participants[0].totalAmount).toBe(75.0);

      // 3. Verify Admin Order dispatch
      expect(sentAdminOrder).not.toBeNull();
      expect(sentAdminOrder.embeds[0].data.title).toBe('💰 Orden de Pago y Liquidación de Video');
      const breakdown = sentAdminOrder.embeds[0].data.fields.find(f => f.name === '📋 Desglose y Cuentas').value;
      expect(breakdown).toContain('ed_exec@pay.com');
      expect(breakdown).toContain('BIN_ED_EXEC');
      expect(breakdown).toContain('act_exec@pay.com');

      // 4. Verify participant DMs are NOT sent upon calculation (deferred until marked as PAID)
      expect(userDMs.size).toBe(0);

      // 5. When marked as PAID via pagarCommand, verify DMs ARE dispatched to participants
      await pagarCommand.run(mockClient, mockMessage, ['man_exec_vid'], '!');
      expect(userDMs.size).toBe(2);
      expect(userDMs.has('ed_man_exec')).toBe(true);
      expect(userDMs.has('act_man_exec')).toBe(true);
      expect(userDMs.get('ed_man_exec').embeds[0].data.title).toContain('Pago Realizado');
    });
  });

  // =========================================================================
  // 2. Ayuda Command Definition & Execution
  // =========================================================================
  describe('2. ayuda Command Definition & Execution', () => {
    it('2.1 should conform to discord-bot-architecture command structure', () => {
      expect(ayudaCommand.name).toBe('ayuda');
      expect(ayudaCommand.aliases).toContain('help');
      expect(ayudaCommand.aliases).toContain('comandos');
      expect(typeof ayudaCommand.run).toBe('function');
    });

    it('2.2 should display categorized guide embed with all bot commands', async () => {
      let sentEmbed = null;
      const mockMessage = {
        reply: async (payload) => {
          sentEmbed = payload.embeds?.[0];
          return payload;
        }
      };

      await ayudaCommand.run({}, mockMessage, [], '!');

      expect(sentEmbed).not.toBeNull();
      expect(sentEmbed.data.title).toContain('Guía de Comandos');

      const fieldNames = sentEmbed.data.fields.map(f => f.name);
      expect(fieldNames.some(n => n.includes('Administración'))).toBe(true);
      expect(fieldNames.some(n => n.includes('Talentos'))).toBe(true);
      expect(fieldNames.some(n => n.includes('Videos'))).toBe(true);
      expect(fieldNames.some(n => n.includes('Información'))).toBe(true);

      const allFieldContent = sentEmbed.data.fields.map(f => f.value).join('\n');
      expect(allFieldContent).toContain('!tarifas');
      expect(allFieldContent).toContain('!set-tarifa');
      expect(allFieldContent).toContain('!liquidar');
      expect(allFieldContent).toContain('!registro');
      expect(allFieldContent).toContain('!miperfil');
      expect(allFieldContent).toContain('!registrar-video');
      expect(allFieldContent).toContain('!videos');
      expect(allFieldContent).toContain('!ping');
      expect(allFieldContent).toContain('!ayuda');
    });
  });

  // =========================================================================
  // 3. Ready Event Lifecycle Hook
  // =========================================================================
  describe('3. ready Event Lifecycle Hook', () => {
    it('3.1 should initialize ConfigService and start SchedulerService on bot ready', async () => {
      expect(readyEvent.once).toBe(true);
      expect(readyEvent.name).toBeDefined();

      let activitySet = null;
      const mockClient = {
        user: {
          tag: 'SonicGestBot#1234',
          setActivity: (name, options) => {
            activitySet = { name, options };
          }
        }
      };

      await readyEvent.run(mockClient);

      // Verify Config auto-seeded
      const config = await ConfigService.getConfig();
      expect(config).not.toBeNull();
      expect(config.actorBase).toBe(25.0);
      expect(config.editorBase).toBe(125.0);

      // Verify Scheduler running
      expect(SchedulerService.isSchedulerRunning()).toBe(true);
      expect(activitySet).not.toBeNull();
      expect(activitySet.name).toContain('!ayuda');
    });
  });
});
