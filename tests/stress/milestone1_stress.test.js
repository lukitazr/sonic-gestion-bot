import { describe, it, expect, beforeEach, afterAll, beforeAll } from 'bun:test';
import { ConfigService } from '../../src/services/configService.js';
import { DEFAULT_CONFIG, CONFIG_KEY_ALIASES, CONFIG_FIELD_META } from '../../src/config/constants.js';
import { prisma } from '../../src/database/prisma.js';
import tarifasCommand from '../../commands/admin/tarifas.js';
import setTarifaCommand from '../../commands/admin/settarifa.js';
import { PermissionFlagsBits } from 'discord.js';

describe('Milestone 1 Empirical Challenger Stress Suite', () => {
  beforeAll(async () => {
    // Reset database to clean state
    await prisma.videoParticipant.deleteMany({});
    await prisma.videoRecord.deleteMany({});
    await prisma.talent.deleteMany({});
    await prisma.config.deleteMany({});
    ConfigService.invalidateCache();
  });

  afterAll(async () => {
    await prisma.videoParticipant.deleteMany({});
    await prisma.videoRecord.deleteMany({});
    await prisma.talent.deleteMany({});
    await prisma.config.deleteMany({});
    ConfigService.invalidateCache();
    await prisma.$disconnect();
  });

  beforeEach(async () => {
    await ConfigService.resetDefaults();
  });

  // =========================================================================
  // 1. CONCURRENCY & CACHE SYNCHRONIZATION STRESS TESTS
  // =========================================================================
  describe('1. Concurrency & Cache Synchronization', () => {
    it('1.1 should handle 50 concurrent init() calls on empty database without duplicate rows', async () => {
      await prisma.config.deleteMany({});
      ConfigService.invalidateCache();

      // Launch 50 simultaneous init calls
      const promises = Array.from({ length: 50 }, () => ConfigService.init());
      const results = await Promise.all(promises);

      expect(results.length).toBe(50);
      for (const res of results) {
        expect(res.id).toBe(1);
        expect(res.actorBase).toBe(DEFAULT_CONFIG.actorBase);
      }

      const totalRows = await prisma.config.count();
      expect(totalRows).toBe(1);
    });

    it('1.2 should handle rapid concurrent updateConfig calls and keep DB in sync', async () => {
      // Rapidly update independent parameters concurrently
      const updates = [
        ConfigService.updateConfig('actor_base', 30.5),
        ConfigService.updateConfig('editor_base', 140.0),
        ConfigService.updateConfig('bono_500k', 35.0),
        ConfigService.updateConfig('bono_1m', 40.0),
        ConfigService.updateConfig('moneda', 'USD'),
        ConfigService.updateConfig('dias_espera', 7)
      ];

      const results = await Promise.all(updates);
      expect(results.length).toBe(6);

      // Verify SQLite row directly
      const dbConfig = await prisma.config.findUnique({ where: { id: 1 } });
      expect(dbConfig).not.toBeNull();
      expect(dbConfig.actorBase).toBe(30.5);
      expect(dbConfig.editorBase).toBe(140.0);
      expect(dbConfig.bonus1).toBe(35.0);
      expect(dbConfig.bonus2).toBe(40.0);
      expect(dbConfig.currency).toBe('USD');
      expect(dbConfig.waitDays).toBe(7);

      // Verify cached config after forceRefresh
      const freshConfig = await ConfigService.getConfig(true);
      expect(freshConfig.actorBase).toBe(30.5);
      expect(freshConfig.editorBase).toBe(140.0);
      expect(freshConfig.currency).toBe('USD');
    });

    it('1.3 should correctly invalidate cache and reload latest state from SQLite', async () => {
      await ConfigService.updateConfig('actor_base', 55.0);

      // Direct DB manipulation bypassing ConfigService
      await prisma.config.update({
        where: { id: 1 },
        data: { actorBase: 88.0 }
      });

      // Without invalidate, cached config returns 55
      const cached = await ConfigService.getConfig();
      expect(cached.actorBase).toBe(55.0);

      // Invalidate cache
      ConfigService.invalidateCache();

      // Now getConfig must fetch fresh 88 from SQLite
      const fresh = await ConfigService.getConfig();
      expect(fresh.actorBase).toBe(88.0);
    });
  });

  // =========================================================================
  // 2. BOUNDARY, NEGATIVE, AND MALFORMED INPUT STRESS TESTS
  // =========================================================================
  describe('2. Boundary, Negative & Malformed Input Handling', () => {
    it('2.1 should reject negative numbers on all numeric fields', async () => {
      const negativeTestCases = [
        ['actor_base', -10],
        ['actor_base', '-0.01'],
        ['editor_base', -50],
        ['bono_500k', -25],
        ['bono_1m', -1],
        ['umbral_1', -500000],
        ['umbral_2', -1000000],
        ['dias_espera', -5],
        ['dias_espera', 0] // min is 1
      ];

      for (const [key, val] of negativeTestCases) {
        expect(ConfigService.updateConfig(key, val)).rejects.toThrow();
      }
    });

    it('2.2 should allow valid zero amounts for base and bonus fees, but reject 0 for thresholds & waitDays', async () => {
      // 0 is valid for fees/bonuses (e.g. volunteer or zero bonus)
      const actorRes = await ConfigService.updateConfig('actor_base', 0);
      expect(actorRes.newValue).toBe(0);

      const editorRes = await ConfigService.updateConfig('editor_base', 0);
      expect(editorRes.newValue).toBe(0);

      const b1Res = await ConfigService.updateConfig('bono_500k', 0);
      expect(b1Res.newValue).toBe(0);

      const b2Res = await ConfigService.updateConfig('bono_1m', 0);
      expect(b2Res.newValue).toBe(0);

      // 0 is invalid for thresholds and waitDays
      expect(ConfigService.updateConfig('umbral_1', 0)).rejects.toThrow();
      expect(ConfigService.updateConfig('umbral_2', 0)).rejects.toThrow();
      expect(ConfigService.updateConfig('dias_espera', 0)).rejects.toThrow();
    });

    it('2.3 should enforce threshold ordering (threshold1 < threshold2) under all boundary permutations', async () => {
      // Setup base thresholds: 500k and 1M
      await ConfigService.updateConfig('umbral_1', 500000);
      await ConfigService.updateConfig('umbral_2', 1000000);

      // Attack: setting threshold1 == threshold2 (1,000,000)
      expect(ConfigService.updateConfig('umbral_1', 1000000)).rejects.toThrow();

      // Attack: setting threshold1 > threshold2 (1,000,001)
      expect(ConfigService.updateConfig('umbral_1', 1000001)).rejects.toThrow();

      // Attack: setting threshold2 == threshold1 (500,000)
      expect(ConfigService.updateConfig('umbral_2', 500000)).rejects.toThrow();

      // Attack: setting threshold2 < threshold1 (499,999)
      expect(ConfigService.updateConfig('umbral_2', 499999)).rejects.toThrow();

      // Valid: threshold1 = 999,999 when threshold2 = 1,000,000
      const validT1 = await ConfigService.updateConfig('umbral_1', 999999);
      expect(validT1.newValue).toBe(999999);

      // Valid: threshold2 = 1,000,001
      const validT2 = await ConfigService.updateConfig('umbral_2', 1000001);
      expect(validT2.newValue).toBe(1000001);
    });

    it('2.4 should reject non-numeric strings, NaN, empty strings, and special characters', async () => {
      const invalidValues = [
        'abc',
        'NaN',
        'undefined',
        'null',
        '--10',
        '$$$25',
        '500k',
        '25abc',
        '100usd',
        '',
        '   ',
        null,
        undefined
      ];

      for (const val of invalidValues) {
        expect(ConfigService.updateConfig('actor_base', val)).rejects.toThrow();
        expect(ConfigService.updateConfig('umbral_1', val)).rejects.toThrow();
      }
    });

    it('2.5 should reject prototype pollution keys and unknown parameter attacks', async () => {
      const maliciousKeys = [
        '__proto__',
        'constructor',
        'prototype',
        'toString',
        'valueOf',
        'DROP TABLE Config;',
        'admin_override',
        'secret_fee'
      ];

      for (const key of maliciousKeys) {
        expect(ConfigService.updateConfig(key, 50)).rejects.toThrow(/Parámetro desconocido/);
      }
    });

    it('2.6 should round float values to 2 decimal places properly', async () => {
      const res = await ConfigService.updateConfig('actor_base', 33.3333333);
      expect(res.newValue).toBe(33.33);

      const res2 = await ConfigService.updateConfig('editor_base', 125.999);
      expect(res2.newValue).toBe(126.0);
    });

    it('2.7 should test all defined aliases across every field in CONFIG_KEY_ALIASES', async () => {
      for (const [alias, normalizedField] of Object.entries(CONFIG_KEY_ALIASES)) {
        const meta = CONFIG_FIELD_META[normalizedField];
        let testVal;
        if (meta.type === 'int') {
          testVal = normalizedField === 'threshold2' ? 2000000 : (normalizedField === 'threshold1' ? 300000 : 6);
        } else if (meta.type === 'float') {
          testVal = 42.5;
        } else if (meta.type === 'channel') {
          testVal = '123456789012345678';
        } else {
          testVal = 'EUR';
        }

        const res = await ConfigService.updateConfig(alias, testVal);
        expect(res.key).toBe(normalizedField);
      }
    });
  });

  // =========================================================================
  // 3. PRISMA SCHEMA & SQLITE INTEGRITY STRESS TESTS
  // =========================================================================
  describe('3. SQLite & Prisma Model Integrity', () => {
    it('3.1 should enforce unique constraint on VideoParticipant (videoId + talentId)', async () => {
      const talent = await prisma.talent.create({
        data: { discordId: 'actor_stress_1', role: 'ACTOR' }
      });

      const video = await prisma.videoRecord.create({
        data: {
          youtubeUrl: 'https://youtube.com/watch?v=stress_test1',
          youtubeVideoId: 'stress_test1',
          editorId: talent.discordId,
          scheduledCalculationAt: new Date(Date.now() + 86400000)
        }
      });

      // First participant insertion must succeed
      await prisma.videoParticipant.create({
        data: {
          videoId: video.id,
          talentId: talent.discordId,
          role: 'ACTOR'
        }
      });

      // Duplicate participant insertion must be rejected by SQLite @@unique constraint
      let threwUnique = false;
      try {
        await prisma.videoParticipant.create({
          data: {
            videoId: video.id,
            talentId: talent.discordId,
            role: 'ACTOR'
          }
        });
      } catch (err) {
        threwUnique = true;
      }
      expect(threwUnique).toBe(true);
    });

    it('3.2 should enforce foreign key constraint when referencing non-existent talent in VideoRecord', async () => {
      let threwFk = false;
      try {
        await prisma.videoRecord.create({
          data: {
            youtubeUrl: 'https://youtube.com/watch?v=ghost_editor',
            youtubeVideoId: 'ghost_editor',
            editorId: 'non_existent_talent_id_99999',
            scheduledCalculationAt: new Date()
          }
        });
      } catch (err) {
        threwFk = true;
      }
      expect(threwFk).toBe(true);
    });

    it('3.3 should enforce cascade deletion of participants when VideoRecord is deleted', async () => {
      const editor = await prisma.talent.create({
        data: { discordId: 'cascade_editor', role: 'EDITOR' }
      });
      const actor1 = await prisma.talent.create({
        data: { discordId: 'cascade_actor1', role: 'ACTOR' }
      });
      const actor2 = await prisma.talent.create({
        data: { discordId: 'cascade_actor2', role: 'ACTOR' }
      });

      const video = await prisma.videoRecord.create({
        data: {
          youtubeUrl: 'https://youtube.com/watch?v=cascade_vid',
          youtubeVideoId: 'cascade_vid',
          editorId: editor.discordId,
          scheduledCalculationAt: new Date(),
          participants: {
            create: [
              { talentId: actor1.discordId, role: 'ACTOR' },
              { talentId: actor2.discordId, role: 'ACTOR' }
            ]
          }
        }
      });

      expect(await prisma.videoParticipant.count({ where: { videoId: video.id } })).toBe(2);

      // Delete video
      await prisma.videoRecord.delete({ where: { id: video.id } });

      // Participants must be automatically cleaned up via cascade
      expect(await prisma.videoParticipant.count({ where: { videoId: video.id } })).toBe(0);

      // Talents must still exist intact
      expect(await prisma.talent.count({ where: { discordId: { in: ['cascade_editor', 'cascade_actor1', 'cascade_actor2'] } } })).toBe(3);
    });

    it('3.4 should support querying 100 bulk video records indexed by status and scheduledCalculationAt', async () => {
      const editor = await prisma.talent.upsert({
        where: { discordId: 'bulk_editor' },
        update: {},
        create: { discordId: 'bulk_editor', role: 'EDITOR' }
      });

      const now = Date.now();
      const records = [];

      for (let i = 0; i < 100; i++) {
        const isOverdue = i < 40;
        records.push({
          youtubeUrl: `https://youtube.com/watch?v=bulk_${i}`,
          youtubeVideoId: `bulk_${i}`,
          editorId: editor.discordId,
          status: isOverdue ? 'PENDING' : (i < 70 ? 'CALCULATED' : 'PAID'),
          scheduledCalculationAt: new Date(now + (isOverdue ? -10000 : 100000))
        });
      }

      await prisma.videoRecord.createMany({ data: records });

      // Fast indexed query for overdue pending videos
      const duePending = await prisma.videoRecord.findMany({
        where: {
          status: 'PENDING',
          scheduledCalculationAt: { lte: new Date() }
        }
      });

      expect(duePending.length).toBe(40);
    });
  });

  // =========================================================================
  // 4. ADMIN COMMAND ADVERSARIAL EXECUTION STRESS TESTS
  // =========================================================================
  describe('4. Admin Commands Adversarial Execution', () => {
    it('4.1 should enforce Administrator permission guard on both commands', () => {
      expect(tarifasCommand.permisos).toContain(PermissionFlagsBits.Administrator);
      expect(setTarifaCommand.permisos).toContain(PermissionFlagsBits.Administrator);
    });

    it('4.2 set-tarifa should handle 0 arguments, 1 argument, and extra spaces gracefully', async () => {
      let replyData = null;
      const mockMsg = {
        reply: (p) => { replyData = p; return Promise.resolve(p); }
      };

      // 0 args
      await setTarifaCommand.run(null, mockMsg, [], '!');
      expect(replyData.embeds[0].data.title).toContain('Uso Incorrecto');

      // 1 arg
      await setTarifaCommand.run(null, mockMsg, ['actor_base'], '!');
      expect(replyData.embeds[0].data.title).toContain('Uso Incorrecto');

      // 2 args with whitespace
      await setTarifaCommand.run(null, mockMsg, ['  actor_base  ', '  45  '], '!');
      expect(replyData.embeds[0].data.title).toContain('Tarifa Actualizada');
      const conf = await ConfigService.getConfig();
      expect(conf.actorBase).toBe(45);
    });

    it('4.3 set-tarifa should catch and format domain errors without crashing', async () => {
      let replyData = null;
      const mockMsg = {
        reply: (p) => { replyData = p; return Promise.resolve(p); }
      };

      // Invalid field
      await setTarifaCommand.run(null, mockMsg, ['campo_falso', '100'], '!');
      expect(replyData).toContain('Error al actualizar');

      // Invalid negative value
      await setTarifaCommand.run(null, mockMsg, ['actor_base', '-50'], '!');
      expect(replyData).toContain('Error al actualizar');

      // Inverted threshold
      await setTarifaCommand.run(null, mockMsg, ['umbral_1', '2000000'], '!');
      expect(replyData).toContain('Error al actualizar');
    });

    it('4.4 tarifas command should generate comprehensive embed with all active rates and formatting', async () => {
      let replyData = null;
      const mockMsg = {
        reply: (p) => { replyData = p; return Promise.resolve(p); }
      };

      await tarifasCommand.run(null, mockMsg, [], '!');
      expect(replyData.embeds).toBeDefined();
      const embed = replyData.embeds[0].data;

      expect(embed.title).toContain('Configuración Dinámica');
      expect(embed.fields.length).toBeGreaterThanOrEqual(6);
      expect(embed.fields.some(f => f.name.includes('Tarifa Base - Actor'))).toBe(true);
      expect(embed.fields.some(f => f.name.includes('Tarifa Base - Editor'))).toBe(true);
      expect(embed.fields.some(f => f.name.includes('Moneda'))).toBe(true);
      expect(embed.fields.some(f => f.name.includes('Umbral 1'))).toBe(true);
      expect(embed.fields.some(f => f.name.includes('Umbral 2'))).toBe(true);
      expect(embed.fields.some(f => f.name.includes('Plazo'))).toBe(true);
    });
  });
});
