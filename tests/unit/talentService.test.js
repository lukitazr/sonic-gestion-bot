import { describe, it, expect, beforeEach, afterAll } from 'bun:test';
import { TalentService } from '../../src/services/talentService.js';
import {
  isValidEmail,
  isValidBinance,
  normalizeRole,
  isValidRole,
  validateTalentInput,
  parseRegistroArgs
} from '../../src/utils/validators.js';
import { prisma } from '../../src/database/prisma.js';

describe('TalentService & Validators (Unit & Integration Tests)', () => {
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

  describe('1. Validators & Utility Functions', () => {
    it('1.1 should validate correct and incorrect email addresses', () => {
      expect(isValidEmail('user@test.com')).toBe(true);
      expect(isValidEmail('actor.name+tag@sub.domain.org')).toBe(true);
      expect(isValidEmail('valid_paypal@gmail.com')).toBe(true);

      expect(isValidEmail('')).toBe(false);
      expect(isValidEmail(null)).toBe(false);
      expect(isValidEmail(undefined)).toBe(false);
      expect(isValidEmail('plainaddress')).toBe(false);
      expect(isValidEmail('@missinguser.com')).toBe(false);
      expect(isValidEmail('user@.com')).toBe(false);
      expect(isValidEmail('user@domain')).toBe(false);
      expect(isValidEmail('user space@domain.com')).toBe(false);
    });

    it('1.2 should validate Binance identifiers (IDs, emails, crypto handles)', () => {
      expect(isValidBinance('12345678')).toBe(true);
      expect(isValidBinance('9876543210')).toBe(true);
      expect(isValidBinance('binance_user@domain.com')).toBe(true);
      expect(isValidBinance('BNB_ACTOR_PAY')).toBe(true);
      expect(isValidBinance('crypto-wallet-address-01')).toBe(true);

      expect(isValidBinance('')).toBe(false);
      expect(isValidBinance('ab')).toBe(false); // too short
      expect(isValidBinance(null)).toBe(false);
      expect(isValidBinance(undefined)).toBe(false);
      expect(isValidBinance('invalid char$*!#')).toBe(false);
    });

    it('1.3 should normalize and validate ACTOR and EDITOR roles', () => {
      expect(normalizeRole('ACTOR')).toBe('ACTOR');
      expect(normalizeRole('actor')).toBe('ACTOR');
      expect(normalizeRole('  Actor  ')).toBe('ACTOR');
      expect(normalizeRole('EDITOR')).toBe('EDITOR');
      expect(normalizeRole('editor')).toBe('EDITOR');
      expect(normalizeRole(' Editor ')).toBe('EDITOR');

      expect(isValidRole('ACTOR')).toBe(true);
      expect(isValidRole('editor')).toBe(true);
      expect(isValidRole('OTHER')).toBe(false);
      expect(isValidRole('')).toBe(false);
      expect(isValidRole(null)).toBe(false);

      expect(() => normalizeRole('DIRECTOR')).toThrow('Rol inválido');
      expect(() => normalizeRole('')).toThrow('El rol es obligatorio');
      expect(() => normalizeRole(null)).toThrow('El rol es obligatorio');
    });

    it('1.4 should validate full talent input payloads', () => {
      // Valid complete payload
      const valid = validateTalentInput({
        discordId: '123456789012345678',
        role: 'actor',
        paypal: 'actor@mail.com',
        binance: 'BNB123456'
      });
      expect(valid.discordId).toBe('123456789012345678');
      expect(valid.role).toBe('ACTOR');
      expect(valid.paypal).toBe('actor@mail.com');
      expect(valid.binance).toBe('BNB123456');

      // Valid single payment method (PayPal only)
      const paypalOnly = validateTalentInput({
        discordId: '123',
        role: 'EDITOR',
        paypal: 'editor@mail.com'
      });
      expect(paypalOnly.paypal).toBe('editor@mail.com');
      expect(paypalOnly.binance).toBeUndefined();

      // Valid single payment method (Binance only)
      const binanceOnly = validateTalentInput({
        discordId: '123',
        role: 'ACTOR',
        binance: '99887766'
      });
      expect(binanceOnly.binance).toBe('99887766');

      // Errors
      expect(() => validateTalentInput({ discordId: '', role: 'ACTOR', paypal: 'a@b.com' }))
        .toThrow('El ID de Discord del talento es obligatorio');
      expect(() => validateTalentInput({ discordId: '123', role: 'INVALID', paypal: 'a@b.com' }))
        .toThrow('Rol inválido');
      expect(() => validateTalentInput({ discordId: '123', role: 'ACTOR', paypal: 'notanemail' }))
        .toThrow('formato de correo electrónico válido');
      expect(() => validateTalentInput({ discordId: '123', role: 'ACTOR', binance: '!!' }))
        .toThrow('no es válido');
      expect(() => validateTalentInput({ discordId: '123', role: 'ACTOR' }))
        .toThrow('Debes proporcionar al menos un método de pago');
    });

    it('1.5 should parse command arguments in various formats', () => {
      // Flag syntax: !registro ACTOR paypal user@mail.com binance 123456
      const p1 = parseRegistroArgs(['ACTOR', 'paypal', 'user@mail.com', 'binance', '123456'], 'author1');
      expect(p1.targetDiscordId).toBe('author1');
      expect(p1.role).toBe('ACTOR');
      expect(p1.paypal).toBe('user@mail.com');
      expect(p1.binance).toBe('123456');

      // Mention with admin: !registro <@999888> EDITOR paypal ed@mail.com
      const p2 = parseRegistroArgs(['<@999888>', 'EDITOR', 'paypal', 'ed@mail.com'], 'admin1', true);
      expect(p2.targetDiscordId).toBe('999888');
      expect(p2.role).toBe('EDITOR');
      expect(p2.paypal).toBe('ed@mail.com');

      // Positional: !registro ACTOR actor@gmail.com BNB_PAY_ID
      const p3 = parseRegistroArgs(['ACTOR', 'actor@gmail.com', 'BNB_PAY_ID'], 'author2');
      expect(p3.targetDiscordId).toBe('author2');
      expect(p3.role).toBe('ACTOR');
      expect(p3.paypal).toBe('actor@gmail.com');
      expect(p3.binance).toBe('BNB_PAY_ID');

      // Positional: !registro EDITOR editor@gmail.com
      const p4 = parseRegistroArgs(['EDITOR', 'editor@gmail.com'], 'author3');
      expect(p4.targetDiscordId).toBe('author3');
      expect(p4.role).toBe('EDITOR');
      expect(p4.paypal).toBe('editor@gmail.com');
      expect(p4.binance).toBeUndefined();
    });
  });

  describe('2. TalentService CRUD Operations', () => {
    it('2.1 should create new ACTOR talent with both payment methods', async () => {
      const talent = await TalentService.upsertTalent({
        discordId: 'actor_alice',
        role: 'ACTOR',
        paypal: 'alice@paypal.com',
        binance: 'BINANCE_ALICE'
      });

      expect(talent.discordId).toBe('actor_alice');
      expect(talent.role).toBe('ACTOR');
      expect(talent.paypal).toBe('alice@paypal.com');
      expect(talent.binance).toBe('BINANCE_ALICE');

      const inDb = await prisma.talent.findUnique({ where: { discordId: 'actor_alice' } });
      expect(inDb).not.toBeNull();
      expect(inDb.role).toBe('ACTOR');
    });

    it('2.2 should create new EDITOR talent with PayPal only', async () => {
      const talent = await TalentService.upsertTalent({
        discordId: 'editor_bob',
        role: 'EDITOR',
        paypal: 'bob@editor.com'
      });

      expect(talent.discordId).toBe('editor_bob');
      expect(talent.role).toBe('EDITOR');
      expect(talent.paypal).toBe('bob@editor.com');
      expect(talent.binance).toBeNull();
    });

    it('2.3 should update existing talent without overwriting non-supplied fields', async () => {
      // 1. Initial creation
      await TalentService.upsertTalent({
        discordId: 'talent_charlie',
        role: 'ACTOR',
        paypal: 'charlie_initial@mail.com',
        binance: 'BNB_CHARLIE'
      });

      // 2. Update PayPal only
      const updated1 = await TalentService.upsertTalent({
        discordId: 'talent_charlie',
        paypal: 'charlie_updated@mail.com'
      });

      expect(updated1.paypal).toBe('charlie_updated@mail.com');
      expect(updated1.binance).toBe('BNB_CHARLIE'); // preserved!
      expect(updated1.role).toBe('ACTOR'); // preserved!

      // 3. Update role to EDITOR
      const updated2 = await TalentService.upsertTalent({
        discordId: 'talent_charlie',
        role: 'EDITOR'
      });

      expect(updated2.role).toBe('EDITOR');
      expect(updated2.paypal).toBe('charlie_updated@mail.com'); // preserved!
      expect(updated2.binance).toBe('BNB_CHARLIE'); // preserved!

      // 4. Update Binance only
      const updated3 = await TalentService.upsertTalent({
        discordId: 'talent_charlie',
        binance: 'BNB_CHARLIE_NEW'
      });

      expect(updated3.binance).toBe('BNB_CHARLIE_NEW');
      expect(updated3.paypal).toBe('charlie_updated@mail.com');
      expect(updated3.role).toBe('EDITOR');

      // Verify only 1 row exists in DB
      const count = await prisma.talent.count();
      expect(count).toBe(1);
    });

    it('2.4 should retrieve talent by discordId (getTalent)', async () => {
      await TalentService.upsertTalent({
        discordId: 'talent_lookup',
        role: 'ACTOR',
        paypal: 'lookup@mail.com'
      });

      const found = await TalentService.getTalent('talent_lookup');
      expect(found).not.toBeNull();
      expect(found.discordId).toBe('talent_lookup');
      expect(found.role).toBe('ACTOR');

      const notFound = await TalentService.getTalent('non_existent');
      expect(notFound).toBeNull();

      const nullArg = await TalentService.getTalent(null);
      expect(nullArg).toBeNull();
    });

    it('2.5 should batch retrieve talents by discordIds (getTalents)', async () => {
      await TalentService.upsertTalent({ discordId: 't1', role: 'ACTOR', paypal: 't1@mail.com' });
      await TalentService.upsertTalent({ discordId: 't2', role: 'EDITOR', paypal: 't2@mail.com' });
      await TalentService.upsertTalent({ discordId: 't3', role: 'ACTOR', binance: 'BNB_T3' });

      const batch = await TalentService.getTalents(['t1', 't3', 'missing_id']);
      expect(batch.length).toBe(2);
      expect(batch.some(t => t.discordId === 't1')).toBe(true);
      expect(batch.some(t => t.discordId === 't3')).toBe(true);
      expect(batch.some(t => t.discordId === 't2')).toBe(false);

      const emptyBatch = await TalentService.getTalents([]);
      expect(emptyBatch).toEqual([]);

      const nullBatch = await TalentService.getTalents(null);
      expect(nullBatch).toEqual([]);
    });

    it('2.6 should delete talent by discordId (deleteTalent)', async () => {
      await TalentService.upsertTalent({ discordId: 'to_delete', role: 'ACTOR', paypal: 'del@mail.com' });
      
      const deleted = await TalentService.deleteTalent('to_delete');
      expect(deleted).not.toBeNull();
      expect(deleted.discordId).toBe('to_delete');

      const verify = await TalentService.getTalent('to_delete');
      expect(verify).toBeNull();

      // Deleting again or non-existent returns null without crashing
      const reDelete = await TalentService.deleteTalent('to_delete');
      expect(reDelete).toBeNull();
    });

    it('2.7 should list all talents (getAllTalents)', async () => {
      await TalentService.upsertTalent({ discordId: 'all_1', role: 'ACTOR', paypal: 'a1@mail.com' });
      await TalentService.upsertTalent({ discordId: 'all_2', role: 'EDITOR', paypal: 'a2@mail.com' });

      const all = await TalentService.getAllTalents();
      expect(all.length).toBe(2);
      expect(all.some(t => t.discordId === 'all_1')).toBe(true);
      expect(all.some(t => t.discordId === 'all_2')).toBe(true);
    });
  });
});
