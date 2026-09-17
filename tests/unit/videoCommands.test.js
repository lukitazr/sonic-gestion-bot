import { describe, it, expect, beforeEach, afterAll } from 'bun:test';
import { PermissionFlagsBits } from 'discord.js';
import { prisma } from '../../src/database/prisma.js';
import { TalentService } from '../../src/services/talentService.js';
import { VideoService } from '../../src/services/videoService.js';
import { ConfigService } from '../../src/services/configService.js';
import registrarVideoCmd from '../../commands/video/registrarvideo.js';
import videosCmd from '../../commands/video/videos.js';

// Helper to create mock Discord message and client harness
function createMockMessage({
  content = '',
  authorId = 'user_author',
  channelId = 'text_chan_1',
  isAdmin = true,
  historyChannelId = 'hist_chan_99'
}) {
  const replies = [];
  const historyMessages = [];
  const dmsSent = [];

  const historyChannel = {
    id: historyChannelId,
    send: async (options) => {
      const msg = { id: `hist_msg_${Date.now()}`, ...options };
      historyMessages.push(msg);
      return msg;
    }
  };

  const usersMap = new Map();
  const getUser = (id) => {
    if (!usersMap.has(id)) {
      usersMap.set(id, {
        id,
        send: async (options) => {
          const msg = { id: `dm_${id}_${Date.now()}`, recipientId: id, ...options };
          dmsSent.push(msg);
          return msg;
        }
      });
    }
    return usersMap.get(id);
  };

  const client = {
    historyChannelId,
    channels: {
      cache: new Map([[historyChannelId, historyChannel]]),
      fetch: async (id) => (id === historyChannelId ? historyChannel : null)
    },
    users: {
      cache: usersMap,
      fetch: async (id) => getUser(id)
    },
    getUser
  };

  const message = {
    content,
    author: getUser(authorId),
    channel: { id: channelId },
    member: {
      permissions: {
        has: (perm) => isAdmin
      }
    },
    replies,
    reply: async (options) => {
      const replyMsg = {
        content: typeof options === 'string' ? options : options.content,
        embeds: options.embeds || [],
        components: options.components || []
      };
      replies.push(replyMsg);
      return replyMsg;
    }
  };

  return { message, client, replies, historyMessages, dmsSent };
}

describe('Milestone 3: Video Discord Commands (registrar-video & videos)', () => {
  beforeEach(async () => {
    await prisma.videoParticipant.deleteMany({});
    await prisma.videoRecord.deleteMany({});
    await prisma.talent.deleteMany({});
    await ConfigService.resetDefaults();
  });

  afterAll(async () => {
    await prisma.videoParticipant.deleteMany({});
    await prisma.videoRecord.deleteMany({});
    await prisma.talent.deleteMany({});
    await prisma.$disconnect();
  });

  // =========================================================================
  // 1. registrar-video Command Tests
  // =========================================================================
  describe('1. registrar-video Command Definition & Execution', () => {
    it('1.1 should conform to discord-bot-architecture command structure and permissions', () => {
      expect(registrarVideoCmd.name).toBe('registrar-video');
      expect(registrarVideoCmd.aliases).toContain('registrarvideo');
      expect(registrarVideoCmd.aliases).toContain('nuevo-video');
      expect(registrarVideoCmd.desc).toBeDefined();
      expect(typeof registrarVideoCmd.run).toBe('function');
      expect(registrarVideoCmd.permisos).toContain(PermissionFlagsBits.ManageMessages);
    });

    it('1.2 should display interactive GUI panel on 0 args, and usage guide when 1 argument is provided', async () => {
      const { message: msg0, client: cli0, replies: rep0 } = createMockMessage({ content: '!registrar-video' });
      await registrarVideoCmd.run(cli0, msg0, [], '!');
      expect(rep0.length).toBe(1);
      expect(rep0[0].embeds[0].data.title).toContain('Registro de Video');
      expect(rep0[0].components[0].components[0].data.custom_id).toContain('vidreg_btn_start');

      const { message: msg1, client: cli1, replies: rep1 } = createMockMessage({ content: '!registrar-video https://youtu.be/dQw4w9WgXcQ' });
      await registrarVideoCmd.run(cli1, msg1, ['https://youtu.be/dQw4w9WgXcQ'], '!');
      expect(rep1.length).toBe(1);
      expect(rep1[0].embeds[0].data.description).toContain('Uso:');
    });

    it('1.3 should reject registration with invalid YouTube URL/ID', async () => {
      const { message, client, replies } = createMockMessage({ content: '!registrar-video invalid_not_youtube_url @editor' });

      await registrarVideoCmd.run(client, message, ['invalid_not_youtube_url', '<@editor_1>'], '!');

      expect(replies.length).toBe(1);
      expect(replies[0].content).toContain('No se encontró un enlace o ID válido de YouTube');
    });

    it('1.4 should reject registration when editor is not registered in Talent DB', async () => {
      await TalentService.upsertTalent({ discordId: 'actor_valid', role: 'ACTOR', paypal: 'act@mail.com' });

      const { message, client, replies } = createMockMessage({
        content: '!registrar-video https://youtu.be/dQw4w9WgXcQ @unregistered_editor @actor_valid'
      });

      await registrarVideoCmd.run(
        client,
        message,
        ['https://youtu.be/dQw4w9WgXcQ', '<@unregistered_editor>', '<@actor_valid>'],
        '!'
      );

      expect(replies.length).toBe(1);
      expect(replies[0].content).toContain('no está registrado en el sistema');
    });

    it('1.5 should reject registration when an actor is not registered in Talent DB', async () => {
      await TalentService.upsertTalent({ discordId: 'editor_valid', role: 'EDITOR', paypal: 'ed@mail.com' });

      const { message, client, replies } = createMockMessage({
        content: '!registrar-video https://youtu.be/dQw4w9WgXcQ @editor_valid @unregistered_actor'
      });

      await registrarVideoCmd.run(
        client,
        message,
        ['https://youtu.be/dQw4w9WgXcQ', '<@editor_valid>', '<@unregistered_actor>'],
        '!'
      );

      expect(replies.length).toBe(1);
      expect(replies[0].content).toContain('Los siguientes actores no están registrados');
    });

    it('1.6 should successfully register video, post success embed, dispatch history embed and participant DMs', async () => {
      await TalentService.upsertTalent({ discordId: 'ed_ok', role: 'EDITOR', paypal: 'ed@mail.com' });
      await TalentService.upsertTalent({ discordId: 'act_ok1', role: 'ACTOR', paypal: 'a1@mail.com' });
      await TalentService.upsertTalent({ discordId: 'act_ok2', role: 'ACTOR', paypal: 'a2@mail.com' });

      const { message, client, replies, historyMessages, dmsSent } = createMockMessage({
        content: '!registrar-video https://youtu.be/dQw4w9WgXcQ @ed_ok @act_ok1 @act_ok2'
      });

      await registrarVideoCmd.run(
        client,
        message,
        ['https://youtu.be/dQw4w9WgXcQ', '<@ed_ok>', '<@act_ok1>', '<@act_ok2>'],
        '!'
      );

      // Verify channel reply embed
      expect(replies.length).toBe(1);
      const replyEmbed = replies[0].embeds[0];
      expect(replyEmbed.data.title).toBe('✅ Video Registrado Exitosamente');
      expect(replyEmbed.data.fields.some(f => f.name.includes('Editor') && f.value.includes('<@ed_ok>'))).toBe(true);
      expect(replyEmbed.data.fields.some(f => f.name.includes('Actores') && f.value.includes('<@act_ok1>') && f.value.includes('<@act_ok2>'))).toBe(true);

      // Verify history channel embed was dispatched
      expect(historyMessages.length).toBe(1);
      expect(historyMessages[0].embeds[0].data.title).toBe('🎬 Nuevo Video Registrado para Seguimiento');

      // Verify DMs were sent to editor and both actors
      expect(dmsSent.length).toBe(3);
      const recipients = dmsSent.map(d => d.recipientId);
      expect(recipients).toContain('ed_ok');
      expect(recipients).toContain('act_ok1');
      expect(recipients).toContain('act_ok2');

      // Verify DB state
      const videosInDb = await prisma.videoRecord.findMany({ include: { participants: true } });
      expect(videosInDb.length).toBe(1);
      expect(videosInDb[0].youtubeVideoId).toBe('dQw4w9WgXcQ');
      expect(videosInDb[0].participants.length).toBe(2);
    });

    it('1.7 should auto-detect and slot editor and actors regardless of mention order', async () => {
      await TalentService.upsertTalent({ discordId: 'actor_first', role: 'ACTOR', paypal: 'act@mail.com' });
      await TalentService.upsertTalent({ discordId: 'editor_second', role: 'EDITOR', paypal: 'ed@mail.com' });
      await TalentService.upsertTalent({ discordId: 'actor_third', role: 'ACTOR', paypal: 'act3@mail.com' });

      const { message, client, replies } = createMockMessage({
        content: '!registrar-video https://youtu.be/dQw4w9WgXcQ @actor_first @editor_second @actor_third'
      });

      await registrarVideoCmd.run(
        client,
        message,
        ['https://youtu.be/dQw4w9WgXcQ', '<@actor_first>', '<@editor_second>', '<@actor_third>'],
        '!'
      );

      expect(replies.length).toBe(1);
      const replyEmbed = replies[0].embeds[0];
      expect(replyEmbed.data.title).toBe('✅ Video Registrado Exitosamente');
      expect(replyEmbed.data.fields.some(f => f.name.includes('Editor') && f.value.includes('<@editor_second>'))).toBe(true);
      expect(replyEmbed.data.fields.some(f => f.name.includes('Actores') && f.value.includes('<@actor_first>') && f.value.includes('<@actor_third>'))).toBe(true);

      const videoInDb = await prisma.videoRecord.findFirst({
        where: { youtubeVideoId: 'dQw4w9WgXcQ' },
        include: { participants: true }
      });
      expect(videoInDb.editorId).toBe('editor_second');
      const participantIds = videoInDb.participants.map(p => p.talentId);
      expect(participantIds).toContain('actor_first');
      expect(participantIds).toContain('actor_third');
    });

    it('1.8 should successfully register video with ACTORS only without requiring an EDITOR', async () => {
      await TalentService.upsertTalent({ discordId: 'only_actor_1', role: 'ACTOR', paypal: 'a1@mail.com' });
      await TalentService.upsertTalent({ discordId: 'only_actor_2', role: 'ACTOR', paypal: 'a2@mail.com' });

      const { message, client, replies } = createMockMessage({
        content: '!registrar-video https://youtu.be/dQw4w9WgXcQ @only_actor_1 @only_actor_2'
      });

      await registrarVideoCmd.run(
        client,
        message,
        ['https://youtu.be/dQw4w9WgXcQ', '<@only_actor_1>', '<@only_actor_2>'],
        '!'
      );

      expect(replies.length).toBe(1);
      const replyEmbed = replies[0].embeds[0];
      expect(replyEmbed.data.title).toBe('✅ Video Registrado Exitosamente');
      expect(replyEmbed.data.fields.some(f => f.name.includes('Editor') && f.value.includes('Ninguno'))).toBe(true);
      expect(replyEmbed.data.fields.some(f => f.name.includes('Actores') && f.value.includes('<@only_actor_1>') && f.value.includes('<@only_actor_2>'))).toBe(true);

      const videoInDb = await prisma.videoRecord.findFirst({
        where: { youtubeVideoId: 'dQw4w9WgXcQ' },
        include: { participants: true }
      });
      expect(videoInDb).not.toBeNull();
      expect(videoInDb.editorId).toBeNull();
      expect(videoInDb.participants.length).toBe(2);
    });

    it('1.9 should successfully register video with EDITOR only without requiring actors', async () => {
      await TalentService.upsertTalent({ discordId: 'only_editor_1', role: 'EDITOR', paypal: 'e1@mail.com' });

      const { message, client, replies } = createMockMessage({
        content: '!registrar-video https://youtu.be/dQw4w9WgXcQ @only_editor_1'
      });

      await registrarVideoCmd.run(
        client,
        message,
        ['https://youtu.be/dQw4w9WgXcQ', '<@only_editor_1>'],
        '!'
      );

      expect(replies.length).toBe(1);
      const replyEmbed = replies[0].embeds[0];
      expect(replyEmbed.data.title).toBe('✅ Video Registrado Exitosamente');
      expect(replyEmbed.data.fields.some(f => f.name.includes('Editor') && f.value.includes('<@only_editor_1>'))).toBe(true);
    });
  });

  // =========================================================================
  // 2. videos Command Tests
  // =========================================================================
  describe('2. videos Command Definition & Execution', () => {
    it('2.1 should conform to discord-bot-architecture command structure', () => {
      expect(videosCmd.name).toBe('videos');
      expect(videosCmd.aliases).toContain('pendientes');
      expect(videosCmd.aliases).toContain('listar-videos');
      expect(videosCmd.desc).toBeDefined();
      expect(typeof videosCmd.run).toBe('function');
    });

    it('2.2 should display informational embed when no videos are registered', async () => {
      const { message, client, replies } = createMockMessage({ content: '!videos' });

      await videosCmd.run(client, message, [], '!');

      expect(replies.length).toBe(1);
      const embed = replies[0].embeds[0];
      expect(embed.data.description).toContain('No se encontraron videos');
    });

    it('2.3 should display formatted list of registered videos', async () => {
      await TalentService.upsertTalent({ discordId: 'editor_list', role: 'EDITOR', paypal: 'ed@list.com' });
      await TalentService.upsertTalent({ discordId: 'actor_list', role: 'ACTOR', paypal: 'act@list.com' });

      await VideoService.registerVideo({
        youtubeUrl: 'https://youtu.be/video_list_1',
        editorDiscordId: 'editor_list',
        actorDiscordIds: ['actor_list'],
        title: 'Sonic Adventure Gameplay #1'
      });

      await VideoService.registerVideo({
        youtubeUrl: 'https://youtu.be/video_list_2',
        editorDiscordId: 'editor_list',
        actorDiscordIds: ['actor_list'],
        title: 'Sonic Adventure Gameplay #2'
      });

      const { message, client, replies } = createMockMessage({ content: '!videos' });

      await videosCmd.run(client, message, [], '!');

      expect(replies.length).toBe(1);
      const embed = replies[0].embeds[0];
      expect(embed.data.fields.length).toBe(2);
      expect(embed.data.fields[0].name).toContain('Sonic Adventure Gameplay #2'); // newest first
      expect(embed.data.fields[1].name).toContain('Sonic Adventure Gameplay #1');
    });

    it('2.4 should support status filter (pendientes / calculados)', async () => {
      await TalentService.upsertTalent({ discordId: 'editor_filt', role: 'EDITOR', paypal: 'ed@filt.com' });

      const vid = await VideoService.registerVideo({
        youtubeUrl: 'https://youtu.be/vid_pending',
        editorDiscordId: 'editor_filt',
        actorDiscordIds: []
      });

      // Filter by 'pendientes'
      const { message: msgPend, client: clientPend, replies: repliesPend } = createMockMessage({ content: '!videos pendientes' });
      await videosCmd.run(clientPend, msgPend, ['pendientes'], '!');
      expect(repliesPend[0].embeds[0].data.fields.length).toBe(1);

      // Filter by 'calculados' (none exist yet)
      const { message: msgCalc, client: clientCalc, replies: repliesCalc } = createMockMessage({ content: '!videos calculados' });
      await videosCmd.run(clientCalc, msgCalc, ['calculados'], '!');
      expect(repliesCalc[0].embeds[0].data.description).toContain('No se encontraron videos');
    });
  });
});
