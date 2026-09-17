import { describe, it, expect, beforeEach, afterAll } from 'bun:test';
import { PermissionFlagsBits } from 'discord.js';
import { TalentService } from '../../src/services/talentService.js';
import {
  isValidEmail,
  isValidBinance,
  normalizeRole,
  isValidRole,
  isValidDiscordId,
  validateTalentInput,
  parseRegistroArgs
} from '../../src/utils/validators.js';
import registroCommand from '../../commands/talent/registro.js';
import miperfilCommand from '../../commands/talent/miperfil.js';
import { prisma } from '../../src/database/prisma.js';

describe('Empirical Forensic Stress Test: Talent Dossier Registry (Milestone 2)', () => {
  beforeEach(async () => {
    await prisma.videoParticipant.deleteMany({});
    await prisma.videoRecord.deleteMany({});
    await prisma.talent.deleteMany({});
  });

  afterAll(async () => {
    await prisma.videoParticipant.deleteMany({});
    await prisma.videoRecord.deleteMany({});
    await prisma.talent.deleteMany({});
    await prisma.$disconnect();
  });

  describe('1. Empirical DB Persistence & SQLite File Verification', () => {
    it('1.1 genuinely persists records to SQLite via Prisma and retrieves raw SQL rows', async () => {
      const created = await TalentService.upsertTalent({
        discordId: 'forensic_user_001',
        role: 'ACTOR',
        paypal: 'forensic@test.com',
        binance: 'BINANCE_FORENSIC_1'
      });

      expect(created.discordId).toBe('forensic_user_001');

      // Direct raw query to verify database engine execution
      const rawRows = await prisma.$queryRaw`SELECT * FROM "Talent" WHERE "discordId" = 'forensic_user_001'`;
      expect(rawRows.length).toBe(1);
      expect(rawRows[0].discordId).toBe('forensic_user_001');
      expect(rawRows[0].role).toBe('ACTOR');
      expect(rawRows[0].paypal).toBe('forensic@test.com');
      expect(rawRows[0].binance).toBe('BINANCE_FORENSIC_1');
    });

    it('1.2 prevents creating profile with no payment method', async () => {
      expect(TalentService.upsertTalent({
        discordId: 'no_pay_user',
        role: 'ACTOR'
      })).rejects.toThrow('Debes proporcionar al menos un método de pago');
    });

    it('1.3 prevents wiping all payment methods during update', async () => {
      await TalentService.upsertTalent({
        discordId: 'wipe_user',
        role: 'ACTOR',
        paypal: 'wipe@test.com'
      });

      expect(TalentService.upsertTalent({
        discordId: 'wipe_user',
        paypal: '',
        binance: null
      })).rejects.toThrow('Debes proporcionar al menos un método de pago');
    });
  });

  describe('2. Validator Adversarial Fuzzing', () => {
    it('2.1 validates diverse email formats and rejects edge anomalies', () => {
      const validEmails = [
        'simple@example.com',
        'very.common@example.com',
        'disposable.style.email.with+symbol@example.com',
        'other.email-with-hyphen@example.com',
        'fully-qualified-domain@example.co.uk',
        'user.name+tag+sorting@example.com',
        'x@example.com'
      ];

      for (const email of validEmails) {
        expect(isValidEmail(email)).toBe(true);
      }

      const invalidEmails = [
        'Abc.example.com',
        'A@b@c@example.com',
        'a"b(c)d,e:f;g<h>i[j\\k]l@example.com',
        'just"not"right@example.com',
        'this is"not\\allowed@example.com',
        'this\\ still\\"not\\\\allowed@example.com',
        '1234567890123456789012345678901234567890123456789012345678901234+x@example.com',
        'i_like_underscore@but_its_not_allowed_in_this_part.example.com',
        'qa[at]example.com',
        'no@domain',
        '@missing-local.org',
        '',
        null,
        undefined,
        12345
      ];

      for (const email of invalidEmails) {
        expect(isValidEmail(email)).toBe(false);
      }
    });

    it('2.2 validates diverse Binance identifiers and rejects invalid strings', () => {
      const validBinance = [
        '123456',              // 6 digit Pay ID
        '9876543210123456',   // 16 digit ID
        'user@binance.com',    // email account
        'BNB_PAY_ID',          // handle
        '0x71C634C2447d33d',   // crypto address
        'binance-user-123',    // hyphenated handle
        'alpha_num_123'
      ];

      for (const b of validBinance) {
        expect(isValidBinance(b)).toBe(true);
      }

      const invalidBinance = [
        '12',                  // too short
        '',
        null,
        undefined,
        'has spaces in it',
        'invalid$symbol',
        'a'.repeat(129)        // too long (> 128)
      ];

      for (const b of invalidBinance) {
        expect(isValidBinance(b)).toBe(false);
      }
    });

    it('2.3 normalizes roles with odd casing and surrounding whitespace', () => {
      expect(normalizeRole('  aCtOr  ')).toBe('ACTOR');
      expect(normalizeRole('\tEdItOr\n')).toBe('EDITOR');
      expect(() => normalizeRole('producer')).toThrow('Rol inválido');
      expect(() => normalizeRole(123)).toThrow('El rol es obligatorio');
    });

    it('2.4 validates Discord Snowflake and alphanumeric IDs', () => {
      expect(isValidDiscordId('123456789012345678')).toBe(true);
      expect(isValidDiscordId('9876543210987654321')).toBe(true);
      expect(isValidDiscordId('test_user_id.1')).toBe(true);
      expect(isValidDiscordId('')).toBe(false);
      expect(isValidDiscordId(null)).toBe(false);
    });
  });

  describe('3. Command Interface Security & Edge Cases', () => {
    it('3.1 rejects non-admin attempt to register other users via nickname mention <@!id>', async () => {
      let repliedText = '';
      const mockMessage = {
        author: { id: 'regular_user', username: 'Regular' },
        member: { permissions: { has: () => false } },
        reply: (payload) => {
          repliedText = typeof payload === 'string' ? payload : payload.content;
          return Promise.resolve(payload);
        }
      };

      await registroCommand.run(null, mockMessage, ['<@!112233445566778899>', 'ACTOR', 'paypal', 'actor@mail.com'], '!');
      expect(repliedText).toContain('No tienes permisos de Administrador');

      // Ensure no talent was created for target
      const targetTalent = await TalentService.getTalent('112233445566778899');
      expect(targetTalent).toBeNull();
    });

    it('3.2 allows admin to register via nickname mention <@!id>', async () => {
      let repliedPayload = null;
      const mockMessage = {
        author: { id: 'admin_user', username: 'Admin' },
        member: { permissions: { has: (p) => p === PermissionFlagsBits.Administrator } },
        reply: (payload) => {
          repliedPayload = payload;
          return Promise.resolve(payload);
        }
      };

      await registroCommand.run(null, mockMessage, ['<@!998877665544332211>', 'EDITOR', 'paypal', 'managed_editor@mail.com'], '!');
      expect(repliedPayload).not.toBeNull();
      expect(repliedPayload.embeds[0].data.description).toContain('998877665544332211');

      const targetTalent = await TalentService.getTalent('998877665544332211');
      expect(targetTalent).not.toBeNull();
      expect(targetTalent.role).toBe('EDITOR');
      expect(targetTalent.paypal).toBe('managed_editor@mail.com');
    });

    it('3.3 handles miperfil lookup with raw snowflake ID or mention', async () => {
      await TalentService.upsertTalent({
        discordId: 'target_snowflake_123',
        role: 'ACTOR',
        paypal: 'snow@mail.com',
        binance: 'BNB_SNOW'
      });

      // Query via raw ID
      let rawPayload = null;
      const mockMsgRaw = {
        author: { id: 'anyone' },
        reply: (p) => { rawPayload = p; return Promise.resolve(p); }
      };

      await miperfilCommand.run(null, mockMsgRaw, ['target_snowflake_123'], '!');
      expect(rawPayload.embeds).toBeDefined();
      expect(rawPayload.embeds[0].data.fields.some(f => f.value.includes('target_snowflake_123'))).toBe(true);

      // Query via mention <@!target_snowflake_123>
      let mentionPayload = null;
      const mockMsgMention = {
        author: { id: 'anyone' },
        reply: (p) => { mentionPayload = p; return Promise.resolve(p); }
      };

      await miperfilCommand.run(null, mockMsgMention, ['<@!target_snowflake_123>'], '!');
      expect(mentionPayload.embeds).toBeDefined();
      expect(mentionPayload.embeds[0].data.fields.some(f => f.value.includes('target_snowflake_123'))).toBe(true);
    });

    it('3.4 verifies all command aliases respond as valid modules', () => {
      expect(registroCommand.aliases).toEqual(expect.arrayContaining(['perfil', 'registrar-talento', 'expediente', 'registrar-expediente']));
      expect(miperfilCommand.aliases).toEqual(expect.arrayContaining(['mi-perfil', 'perfil-ver', 'ver-perfil', 'mi-expediente']));
    });
  });
});
