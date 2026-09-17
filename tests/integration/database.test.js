import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'bun:test';
import { prisma } from '../../src/database/prisma.js';
import { ConfigService } from '../../src/services/configService.js';

describe('Database & Prisma ORM (Integration Tests)', () => {
  beforeAll(async () => {
    ConfigService.invalidateCache();
    // Clean up test data
    await prisma.videoParticipant.deleteMany({});
    await prisma.videoRecord.deleteMany({});
    await prisma.talent.deleteMany({});
    await prisma.config.deleteMany({});
  });

  afterAll(async () => {
    ConfigService.invalidateCache();
    // Final cleanup and disconnect
    await prisma.videoParticipant.deleteMany({});
    await prisma.videoRecord.deleteMany({});
    await prisma.talent.deleteMany({});
    await prisma.config.deleteMany({});
    await prisma.$disconnect();
  });

  describe('Config Model', () => {
    beforeEach(async () => {
      ConfigService.invalidateCache();
    });

    it('1. should auto-seed default config in database', async () => {
      await prisma.config.deleteMany({});
      ConfigService.invalidateCache();
      const config = await ConfigService.init();
      expect(config.id).toBe(1);
      expect(config.actorBase).toBe(25);
      expect(config.editorBase).toBe(125);
      expect(config.threshold1).toBe(500000);
      expect(config.bonus1).toBe(25);
      expect(config.threshold2).toBe(1000000);
      expect(config.bonus2).toBe(25);
      expect(config.currency).toBe('MXN');
      expect(config.waitDays).toBe(5);

      const dbRow = await prisma.config.findUnique({ where: { id: 1 } });
      expect(dbRow).not.toBeNull();
      expect(dbRow.actorBase).toBe(25);
    });

    it('2. should persist rate updates to SQLite', async () => {
      await ConfigService.updateConfig('actor_base', 40);
      const dbRow = await prisma.config.findUnique({ where: { id: 1 } });
      expect(dbRow.actorBase).toBe(40);
    });
  });

  describe('Talent Model', () => {
    it('3. should create actor talent dossier', async () => {
      const talent = await prisma.talent.create({
        data: {
          discordId: '111111111111111111',
          role: 'ACTOR',
          paypal: 'actor1@test.com',
          binance: 'actor1_binance_pay'
        }
      });

      expect(talent.discordId).toBe('111111111111111111');
      expect(talent.role).toBe('ACTOR');
      expect(talent.paypal).toBe('actor1@test.com');
      expect(talent.binance).toBe('actor1_binance_pay');
    });

    it('4. should create editor talent dossier', async () => {
      const editor = await prisma.talent.create({
        data: {
          discordId: '222222222222222222',
          role: 'EDITOR',
          paypal: 'editor@test.com'
        }
      });

      expect(editor.discordId).toBe('222222222222222222');
      expect(editor.role).toBe('EDITOR');
      expect(editor.paypal).toBe('editor@test.com');
      expect(editor.binance).toBeNull();
    });

    it('5. should upsert existing talent with new payment info', async () => {
      const updated = await prisma.talent.upsert({
        where: { discordId: '222222222222222222' },
        update: {
          binance: 'editor_new_binance'
        },
        create: {
          discordId: '222222222222222222',
          role: 'EDITOR',
          binance: 'editor_new_binance'
        }
      });

      expect(updated.binance).toBe('editor_new_binance');
      expect(updated.paypal).toBe('editor@test.com');
    });
  });

  describe('VideoRecord & VideoParticipant Models', () => {
    let videoId;
    const editorDiscordId = '222222222222222222';
    const actor1DiscordId = '111111111111111111';
    let actor2DiscordId = '333333333333333333';

    it('6. should register a video record with editor and participants', async () => {
      // Create second actor
      await prisma.talent.create({
        data: {
          discordId: actor2DiscordId,
          role: 'ACTOR',
          paypal: 'actor2@test.com'
        }
      });

      const scheduledDate = new Date(Date.now() + 5 * 24 * 60 * 60 * 1000);

      const video = await prisma.videoRecord.create({
        data: {
          youtubeUrl: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
          youtubeVideoId: 'dQw4w9WgXcQ',
          videoTitle: 'Sample Video Registration',
          editorId: editorDiscordId,
          scheduledCalculationAt: scheduledDate,
          status: 'PENDING',
          participants: {
            create: [
              { talentId: actor1DiscordId, role: 'ACTOR' },
              { talentId: actor2DiscordId, role: 'ACTOR' }
            ]
          }
        },
        include: {
          editor: true,
          participants: {
            include: { talent: true }
          }
        }
      });

      expect(video.id).toBeDefined();
      videoId = video.id;
      expect(video.youtubeVideoId).toBe('dQw4w9WgXcQ');
      expect(video.status).toBe('PENDING');
      expect(video.editor.discordId).toBe(editorDiscordId);
      expect(video.participants.length).toBe(2);
      expect(video.participants[0].talent.discordId).toBe(actor1DiscordId);
    });

    it('7. should query pending videos scheduled for calculation', async () => {
      // Set scheduledCalculationAt in the past to simulate overdue video
      await prisma.videoRecord.update({
        where: { id: videoId },
        data: {
          scheduledCalculationAt: new Date(Date.now() - 1000)
        }
      });

      const dueVideos = await prisma.videoRecord.findMany({
        where: {
          status: 'PENDING',
          scheduledCalculationAt: {
            lte: new Date()
          }
        },
        include: {
          editor: true,
          participants: {
            include: { talent: true }
          }
        }
      });

      expect(dueVideos.length).toBe(1);
      expect(dueVideos[0].id).toBe(videoId);
    });

    it('8. should update video status and participant calculations (Settlement)', async () => {
      const updated = await prisma.videoRecord.update({
        where: { id: videoId },
        data: {
          status: 'CALCULATED',
          finalViews: 650000,
          totalAmount: 240.0,
          calculatedAt: new Date()
        }
      });

      expect(updated.status).toBe('CALCULATED');
      expect(updated.finalViews).toBe(650000);
      expect(updated.totalAmount).toBe(240.0);
      expect(updated.calculatedAt).not.toBeNull();
    });

    it('9. should cascade delete participants when VideoRecord is deleted without deleting Talents', async () => {
      await prisma.videoRecord.delete({
        where: { id: videoId }
      });

      const remainingParticipants = await prisma.videoParticipant.findMany({
        where: { videoId }
      });
      expect(remainingParticipants.length).toBe(0);

      const editorStillExists = await prisma.talent.findUnique({
        where: { discordId: editorDiscordId }
      });
      expect(editorStillExists).not.toBeNull();
    });
  });
});

