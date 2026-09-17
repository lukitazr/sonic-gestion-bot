import { describe, it, expect, beforeEach, afterAll } from 'bun:test';
import { prisma } from '../../src/database/prisma.js';
import { YouTubeService } from '../../src/services/youtubeService.js';
import { TalentService } from '../../src/services/talentService.js';
import { ConfigService } from '../../src/services/configService.js';
import { VideoService } from '../../src/services/videoService.js';
import { NotificationService } from '../../src/services/notificationService.js';

describe('Milestone 3: VideoService, YouTubeService & NotificationService (Unit & Integration)', () => {
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
  // 1. YouTubeService (URL / ID Parser & Metadata)
  // =========================================================================
  describe('1. YouTubeService URL / ID Extraction', () => {
    it('1.1 should extract video ID from standard watch URLs with various query parameters', () => {
      expect(YouTubeService.extractVideoId('https://www.youtube.com/watch?v=dQw4w9WgXcQ')).toBe('dQw4w9WgXcQ');
      expect(YouTubeService.extractVideoId('http://www.youtube.com/watch?v=dQw4w9WgXcQ')).toBe('dQw4w9WgXcQ');
      expect(YouTubeService.extractVideoId('https://youtube.com/watch?v=dQw4w9WgXcQ')).toBe('dQw4w9WgXcQ');
      expect(YouTubeService.extractVideoId('https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=42s&feature=share')).toBe('dQw4w9WgXcQ');
      expect(YouTubeService.extractVideoId('https://www.youtube.com/watch?feature=youtu.be&v=dQw4w9WgXcQ')).toBe('dQw4w9WgXcQ');
    });

    it('1.2 should extract video ID from shortened youtu.be URLs', () => {
      expect(YouTubeService.extractVideoId('https://youtu.be/dQw4w9WgXcQ')).toBe('dQw4w9WgXcQ');
      expect(YouTubeService.extractVideoId('http://youtu.be/dQw4w9WgXcQ')).toBe('dQw4w9WgXcQ');
      expect(YouTubeService.extractVideoId('https://youtu.be/dQw4w9WgXcQ?t=10')).toBe('dQw4w9WgXcQ');
    });

    it('1.3 should extract video ID from embed, shorts, live, and mobile formats', () => {
      expect(YouTubeService.extractVideoId('https://www.youtube.com/embed/dQw4w9WgXcQ')).toBe('dQw4w9WgXcQ');
      expect(YouTubeService.extractVideoId('https://www.youtube.com/shorts/dQw4w9WgXcQ')).toBe('dQw4w9WgXcQ');
      expect(YouTubeService.extractVideoId('https://www.youtube.com/live/dQw4w9WgXcQ')).toBe('dQw4w9WgXcQ');
      expect(YouTubeService.extractVideoId('https://m.youtube.com/watch?v=dQw4w9WgXcQ')).toBe('dQw4w9WgXcQ');
      expect(YouTubeService.extractVideoId('https://www.youtube.com/v/dQw4w9WgXcQ')).toBe('dQw4w9WgXcQ');
    });

    it('1.4 should extract video ID from raw 11-character strings and angle-bracketed URLs', () => {
      expect(YouTubeService.extractVideoId('dQw4w9WgXcQ')).toBe('dQw4w9WgXcQ');
      expect(YouTubeService.extractVideoId('  dQw4w9WgXcQ  ')).toBe('dQw4w9WgXcQ');
      expect(YouTubeService.extractVideoId('<https://youtu.be/dQw4w9WgXcQ>')).toBe('dQw4w9WgXcQ');
      expect(YouTubeService.extractVideoId('<https://www.youtube.com/watch?v=dQw4w9WgXcQ>')).toBe('dQw4w9WgXcQ');
    });

    it('1.5 should return null for invalid, malformed, or empty inputs', () => {
      expect(YouTubeService.extractVideoId('')).toBeNull();
      expect(YouTubeService.extractVideoId(null)).toBeNull();
      expect(YouTubeService.extractVideoId(undefined)).toBeNull();
      expect(YouTubeService.extractVideoId('not_a_valid_id')).toBeNull();
      expect(YouTubeService.extractVideoId('https://vimeo.com/123456789')).toBeNull();
      expect(YouTubeService.extractVideoId('https://google.com')).toBeNull();
    });

    it('1.6 should generate valid thumbnail URLs', () => {
      expect(YouTubeService.getThumbnailUrl('dQw4w9WgXcQ')).toBe('https://img.youtube.com/vi/dQw4w9WgXcQ/hqdefault.jpg');
      expect(YouTubeService.getThumbnailUrl('dQw4w9WgXcQ', 'maxresdefault')).toBe('https://img.youtube.com/vi/dQw4w9WgXcQ/maxresdefault.jpg');
    });
  });

  // =========================================================================
  // 2. NotificationService (Embeds & DM Dispatcher)
  // =========================================================================
  describe('2. NotificationService Embeds & DM Dispatcher', () => {
    it('2.1 should build rich history embed with all required fields', () => {
      const videoRecord = {
        id: 'test-uuid-123',
        youtubeUrl: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
        youtubeVideoId: 'dQw4w9WgXcQ',
        videoTitle: 'Sonic Unleashed Walkthrough',
        registeredAt: new Date(1700000000000),
        scheduledCalculationAt: new Date(1700432000000)
      };
      const editor = { discordId: 'editor_alice' };
      const actors = [{ discordId: 'actor_bob' }, { discordId: 'actor_charlie' }];

      const embed = NotificationService.buildHistoryEmbed({
        videoRecord,
        editor,
        actors
      });

      expect(embed.data.title).toBe('🎬 Nuevo Video Registrado para Seguimiento');
      expect(embed.data.url).toBe('https://www.youtube.com/watch?v=dQw4w9WgXcQ');
      expect(embed.data.thumbnail?.url).toBe('https://img.youtube.com/vi/dQw4w9WgXcQ/hqdefault.jpg');

      const fields = embed.data.fields;
      expect(fields.some(f => f.name.includes('Editor') && f.value.includes('<@editor_alice>'))).toBe(true);
      expect(fields.some(f => f.name.includes('Actores') && f.value.includes('<@actor_bob>') && f.value.includes('<@actor_charlie>'))).toBe(true);
      expect(fields.some(f => f.name.includes('Estado') && f.value.includes('PENDIENTE'))).toBe(true);
    });

    it('2.2 should dispatch history embed to channel and return sent message', async () => {
      const sentMessages = [];
      const mockChannel = {
        id: 'history_chan_101',
        send: async (payload) => {
          const msg = { id: 'msg_history_999', ...payload };
          sentMessages.push(msg);
          return msg;
        }
      };

      const mockClient = {
        channels: {
          cache: new Map([['history_chan_101', mockChannel]]),
          fetch: async (id) => (id === 'history_chan_101' ? mockChannel : null)
        }
      };

      const result = await NotificationService.sendHistoryEmbed(mockClient, 'history_chan_101', {
        videoRecord: { youtubeVideoId: 'dQw4w9WgXcQ', youtubeUrl: 'https://youtu.be/dQw4w9WgXcQ', videoTitle: 'Test Vid' },
        editor: { discordId: 'ed_1' },
        actors: [{ discordId: 'act_1' }]
      });

      expect(result).not.toBeNull();
      expect(result.id).toBe('msg_history_999');
      expect(sentMessages.length).toBe(1);
    });

    it('2.3 should safely dispatch DMs to editor and actors and handle closed DMs gracefully', async () => {
      const dmSentTo = [];
      const mockUsers = new Map();

      // Open DMs user
      mockUsers.set('user_open_dms', {
        id: 'user_open_dms',
        send: async (payload) => {
          dmSentTo.push('user_open_dms');
          return { id: 'dm_1', ...payload };
        }
      });

      // Closed DMs user (Discord Error 50007)
      mockUsers.set('user_closed_dms', {
        id: 'user_closed_dms',
        send: async () => {
          const error = new Error('Cannot send messages to this user');
          error.code = 50007;
          throw error;
        }
      });

      const mockClient = {
        users: {
          cache: mockUsers,
          fetch: async (id) => mockUsers.get(id) || null
        }
      };

      const result = await NotificationService.sendRegistrationDMs(mockClient, {
        videoRecord: {
          youtubeVideoId: 'dQw4w9WgXcQ',
          youtubeUrl: 'https://youtu.be/dQw4w9WgXcQ',
          videoTitle: 'Sonic Speedrun'
        },
        editor: { discordId: 'user_open_dms' },
        actors: [{ discordId: 'user_closed_dms' }],
        scheduledDate: new Date(Date.now() + 5 * 86400000),
        waitDays: 5
      });

      expect(result.sent).toContain('user_open_dms');
      expect(result.failed).toContain('user_closed_dms');
      expect(dmSentTo).toContain('user_open_dms');
    });
  });

  // =========================================================================
  // 3. VideoService Business Logic & Database Operations
  // =========================================================================
  describe('3. VideoService Registration, Scheduling & Persistence', () => {
    it('3.1 should successfully register a video with valid editor and actors', async () => {
      await TalentService.upsertTalent({ discordId: 'ed_main', role: 'EDITOR', paypal: 'ed@main.com' });
      await TalentService.upsertTalent({ discordId: 'act_1', role: 'ACTOR', paypal: 'act1@mail.com' });

      const video = await VideoService.registerVideo({
        youtubeUrl: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
        editorDiscordId: 'ed_main',
        actorDiscordIds: ['act_1'],
        title: 'Sonic Forces Full Playthrough'
      });

      expect(video.id).toBeDefined();
      expect(video.youtubeVideoId).toBe('dQw4w9WgXcQ');
      expect(video.youtubeUrl).toBe('https://www.youtube.com/watch?v=dQw4w9WgXcQ');
      expect(video.videoTitle).toBe('Sonic Forces Full Playthrough');
      expect(video.editorId).toBe('ed_main');
      expect(video.status).toBe('PENDING');
      expect(video.participants.length).toBe(1);
      expect(video.participants[0].talentId).toBe('act_1');

      // Verify in Database directly
      const inDb = await prisma.videoRecord.findUnique({
        where: { id: video.id },
        include: { participants: true, editor: true }
      });
      expect(inDb).not.toBeNull();
      expect(inDb.editor.discordId).toBe('ed_main');
      expect(inDb.participants.length).toBe(1);
    });

    it('3.2 should calculate scheduledCalculationAt based on active Config.waitDays', async () => {
      await TalentService.upsertTalent({ discordId: 'ed_wait', role: 'EDITOR', paypal: 'ed@wait.com' });
      await TalentService.upsertTalent({ discordId: 'act_wait', role: 'ACTOR', paypal: 'act@wait.com' });

      // Default waitDays is 5
      const fixedNow = new Date('2026-09-01T12:00:00.000Z');
      const videoDefault = await VideoService.registerVideo({
        youtubeUrl: 'https://youtu.be/vid_default5',
        editorDiscordId: 'ed_wait',
        actorDiscordIds: ['act_wait'],
        registeredAt: fixedNow
      });

      const expected5Days = new Date(fixedNow.getTime() + 5 * 24 * 60 * 60 * 1000);
      expect(videoDefault.scheduledCalculationAt.getTime()).toBe(expected5Days.getTime());

      // Update Config to 3 waitDays
      await ConfigService.updateConfig('waitDays', 3);

      const video3Days = await VideoService.registerVideo({
        youtubeUrl: 'https://youtu.be/vid_custom3',
        editorDiscordId: 'ed_wait',
        actorDiscordIds: ['act_wait'],
        registeredAt: fixedNow
      });

      const expected3Days = new Date(fixedNow.getTime() + 3 * 24 * 60 * 60 * 1000);
      expect(video3Days.scheduledCalculationAt.getTime()).toBe(expected3Days.getTime());
    });

    it('3.3 should support multi-actor registrations (3+ actors) with junction table rows', async () => {
      await TalentService.upsertTalent({ discordId: 'editor_multi', role: 'EDITOR', paypal: 'ed@multi.com' });
      await TalentService.upsertTalent({ discordId: 'act_a', role: 'ACTOR', paypal: 'a@mail.com' });
      await TalentService.upsertTalent({ discordId: 'act_b', role: 'ACTOR', paypal: 'b@mail.com' });
      await TalentService.upsertTalent({ discordId: 'act_c', role: 'ACTOR', paypal: 'c@mail.com' });
      await TalentService.upsertTalent({ discordId: 'act_d', role: 'ACTOR', paypal: 'd@mail.com' });

      const video = await VideoService.registerVideo({
        youtubeUrl: 'https://youtu.be/vid_multi_actors',
        editorDiscordId: 'editor_multi',
        actorDiscordIds: ['<@act_a>', '<@!act_b>', 'act_c', 'act_d'],
        title: 'Multi Actor Epic Dub'
      });

      expect(video.participants.length).toBe(4);

      const participantsInDb = await prisma.videoParticipant.findMany({
        where: { videoId: video.id }
      });
      expect(participantsInDb.length).toBe(4);
      const participantIds = participantsInDb.map(p => p.talentId);
      expect(participantIds).toContain('act_a');
      expect(participantIds).toContain('act_b');
      expect(participantIds).toContain('act_c');
      expect(participantIds).toContain('act_d');
    });

    it('3.4 should reject video registration if mentioned editor is not in Talent DB', async () => {
      await TalentService.upsertTalent({ discordId: 'act_exist', role: 'ACTOR', paypal: 'act@exist.com' });

      await expect(
        VideoService.registerVideo({
          youtubeUrl: 'https://youtu.be/dQw4w9WgXcQ',
          editorDiscordId: 'unregistered_editor',
          actorDiscordIds: ['act_exist']
        })
      ).rejects.toThrow('no está registrado en el sistema');
    });

    it('3.5 should reject video registration if one or more actors are not in Talent DB', async () => {
      await TalentService.upsertTalent({ discordId: 'ed_ok', role: 'EDITOR', paypal: 'ed@ok.com' });
      await TalentService.upsertTalent({ discordId: 'act_ok', role: 'ACTOR', paypal: 'act@ok.com' });

      await expect(
        VideoService.registerVideo({
          youtubeUrl: 'https://youtu.be/dQw4w9WgXcQ',
          editorDiscordId: 'ed_ok',
          actorDiscordIds: ['act_ok', 'missing_actor_1', 'missing_actor_2']
        })
      ).rejects.toThrow(/Los siguientes actores no están registrados:.*missing_actor_1.*missing_actor_2/);
    });

    it('3.6 should reject video registration with invalid YouTube URL', async () => {
      await TalentService.upsertTalent({ discordId: 'ed_ok2', role: 'EDITOR', paypal: 'ed@ok2.com' });

      await expect(
        VideoService.registerVideo({
          youtubeUrl: 'invalid_url_format',
          editorDiscordId: 'ed_ok2',
          actorDiscordIds: []
        })
      ).rejects.toThrow('no corresponde a un video válido de YouTube');
    });

    it('3.7 should retrieve pending videos ordered by scheduled date (getPendingVideos)', async () => {
      await TalentService.upsertTalent({ discordId: 'ed_p', role: 'EDITOR', paypal: 'ed@p.com' });
      await TalentService.upsertTalent({ discordId: 'act_p', role: 'ACTOR', paypal: 'act@p.com' });

      const t1 = new Date('2026-09-01T10:00:00.000Z');
      const t2 = new Date('2026-09-02T10:00:00.000Z');

      const vid1 = await VideoService.registerVideo({
        youtubeUrl: 'https://youtu.be/video_pending_1',
        editorDiscordId: 'ed_p',
        actorDiscordIds: ['act_p'],
        registeredAt: t2 // later
      });

      const vid2 = await VideoService.registerVideo({
        youtubeUrl: 'https://youtu.be/video_pending_2',
        editorDiscordId: 'ed_p',
        actorDiscordIds: ['act_p'],
        registeredAt: t1 // earlier
      });

      const pending = await VideoService.getPendingVideos();
      expect(pending.length).toBe(2);
      expect(pending[0].id).toBe(vid2.id); // earlier first
      expect(pending[1].id).toBe(vid1.id);
    });

    it('3.8 should retrieve video by UUID or YouTube Video ID (getVideoById)', async () => {
      await TalentService.upsertTalent({ discordId: 'ed_get', role: 'EDITOR', paypal: 'ed@get.com' });

      const created = await VideoService.registerVideo({
        youtubeUrl: 'https://youtu.be/lookup_11ch',
        editorDiscordId: 'ed_get',
        actorDiscordIds: [],
        title: 'Lookup Video'
      });

      const byUuid = await VideoService.getVideoById(created.id);
      expect(byUuid).not.toBeNull();
      expect(byUuid.videoTitle).toBe('Lookup Video');

      const byYtId = await VideoService.getVideoById('lookup_11ch');
      expect(byYtId).not.toBeNull();
      expect(byYtId.id).toBe(created.id);

      const notFound = await VideoService.getVideoById('non_existent');
      expect(notFound).toBeNull();
    });

    it('3.9 should cascade delete video participants when video is deleted (deleteVideo)', async () => {
      await TalentService.upsertTalent({ discordId: 'ed_del', role: 'EDITOR', paypal: 'ed@del.com' });
      await TalentService.upsertTalent({ discordId: 'act_del', role: 'ACTOR', paypal: 'act@del.com' });

      const created = await VideoService.registerVideo({
        youtubeUrl: 'https://youtu.be/to_be_deleted',
        editorDiscordId: 'ed_del',
        actorDiscordIds: ['act_del']
      });

      const partCountBefore = await prisma.videoParticipant.count({ where: { videoId: created.id } });
      expect(partCountBefore).toBe(1);

      await VideoService.deleteVideo(created.id);

      const videoAfter = await VideoService.getVideoById(created.id);
      expect(videoAfter).toBeNull();

      const partCountAfter = await prisma.videoParticipant.count({ where: { videoId: created.id } });
      expect(partCountAfter).toBe(0);
    });

    it('3.10 should successfully register video without editor (editorDiscordId = null)', async () => {
      await TalentService.upsertTalent({ discordId: 'actor_solo', role: 'ACTOR', paypal: 'solo@mail.com' });

      const video = await VideoService.registerVideo({
        youtubeUrl: 'https://youtu.be/dQw4w9WgXcQ',
        editorDiscordId: null,
        actorDiscordIds: ['actor_solo'],
        title: 'Video Solo Actores'
      });

      expect(video).not.toBeNull();
      expect(video.editorId).toBeNull();
      expect(video.participants.length).toBe(1);
      expect(video.participants[0].talentId).toBe('actor_solo');

      const inDb = await prisma.videoRecord.findUnique({
        where: { id: video.id }
      });
      expect(inDb.editorId).toBeNull();
    });
  });
});
