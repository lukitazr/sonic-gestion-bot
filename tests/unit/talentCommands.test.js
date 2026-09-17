import { describe, it, expect, beforeEach, afterAll } from 'bun:test';
import { PermissionFlagsBits } from 'discord.js';
import registroCommand from '../../commands/talent/registro.js';
import miperfilCommand from '../../commands/talent/miperfil.js';
import { TalentService } from '../../src/services/talentService.js';
import { prisma } from '../../src/database/prisma.js';

describe('Talent Discord Commands (Unit & Execution Tests)', () => {
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

  describe('1. registro Command Definition & Execution', () => {
    it('1.1 should match discord-bot-architecture command structure', () => {
      expect(registroCommand.name).toBe('registro');
      expect(registroCommand.aliases).toContain('perfil');
      expect(registroCommand.aliases).toContain('registrar-talento');
      expect(registroCommand.aliases).toContain('expediente');
      expect(registroCommand.aliases).toContain('registrar-expediente');
      expect(typeof registroCommand.run).toBe('function');
    });

    it('1.2 should show usage guide embed when no arguments are provided', async () => {
      let repliedPayload = null;
      const mockMessage = {
        author: { id: 'user_123', username: 'TestUser' },
        member: { permissions: { has: () => false } },
        reply: (payload) => {
          repliedPayload = payload;
          return Promise.resolve(payload);
        }
      };

      await registroCommand.run(null, mockMessage, [], '!');
      expect(repliedPayload).not.toBeNull();
      expect(repliedPayload.embeds).toBeDefined();
      expect(repliedPayload.embeds[0].data.title).toContain('Registro de Expediente');
    });

    it('1.3 should block non-admin from registering profile for other users', async () => {
      let repliedText = null;
      const mockMessage = {
        author: { id: 'regular_user', username: 'Regular' },
        member: { permissions: { has: (perm) => false } },
        reply: (payload) => {
          repliedText = typeof payload === 'string' ? payload : payload.content;
          return Promise.resolve(payload);
        }
      };

      await registroCommand.run(null, mockMessage, ['<@999888777>', 'ACTOR', 'paypal', 'test@mail.com'], '!');
      expect(repliedText).toContain('No tienes permisos de Administrador');
    });

    it('1.4 should allow self-registration as ACTOR with PayPal', async () => {
      let repliedPayload = null;
      const mockMessage = {
        author: { id: 'actor_alice_1', username: 'Alice' },
        member: { permissions: { has: () => false } },
        reply: (payload) => {
          repliedPayload = payload;
          return Promise.resolve(payload);
        }
      };

      await registroCommand.run(null, mockMessage, ['ACTOR', 'paypal', 'alice@paypal.com'], '!');
      expect(repliedPayload).not.toBeNull();
      expect(repliedPayload.embeds).toBeDefined();

      const embedData = repliedPayload.embeds[0].data;
      expect(embedData.title).toContain('Expediente de Talento Guardado');
      expect(embedData.fields.some(f => f.name.includes('Rol') && f.value.includes('ACTOR'))).toBe(true);
      expect(embedData.fields.some(f => f.name.includes('PayPal') && f.value.includes('alice@paypal.com'))).toBe(true);

      const dbTalent = await TalentService.getTalent('actor_alice_1');
      expect(dbTalent).not.toBeNull();
      expect(dbTalent.role).toBe('ACTOR');
      expect(dbTalent.paypal).toBe('alice@paypal.com');
    });

    it('1.5 should allow admin to register profile for a mentioned user', async () => {
      let repliedPayload = null;
      const mockMessage = {
        author: { id: 'admin_1', username: 'AdminMaster' },
        member: { permissions: { has: (perm) => perm === PermissionFlagsBits.Administrator } },
        reply: (payload) => {
          repliedPayload = payload;
          return Promise.resolve(payload);
        }
      };

      await registroCommand.run(null, mockMessage, ['<@555666777>', 'EDITOR', 'paypal', 'editor_managed@mail.com', 'binance', '998877'], '!');
      expect(repliedPayload).not.toBeNull();
      const embedData = repliedPayload.embeds[0].data;
      expect(embedData.description).toContain('555666777');

      const dbTalent = await TalentService.getTalent('555666777');
      expect(dbTalent).not.toBeNull();
      expect(dbTalent.role).toBe('EDITOR');
      expect(dbTalent.paypal).toBe('editor_managed@mail.com');
      expect(dbTalent.binance).toBe('998877');
    });

    it('1.6 should reject registration with invalid email format', async () => {
      let repliedText = null;
      const mockMessage = {
        author: { id: 'user_bad_email', username: 'BadEmail' },
        member: { permissions: { has: () => false } },
        reply: (payload) => {
          repliedText = typeof payload === 'string' ? payload : payload.content;
          return Promise.resolve(payload);
        }
      };

      await registroCommand.run(null, mockMessage, ['ACTOR', 'paypal', 'not_an_email@bad'], '!');
      expect(repliedText).toContain('Error');
      expect(repliedText).toContain('correo electrónico válido');
    });

    it('1.7 should reject registration with missing payment methods on new talent', async () => {
      let repliedText = null;
      const mockMessage = {
        author: { id: 'user_no_pay', username: 'NoPay' },
        member: { permissions: { has: () => false } },
        reply: (payload) => {
          repliedText = typeof payload === 'string' ? payload : payload.content;
          return Promise.resolve(payload);
        }
      };

      await registroCommand.run(null, mockMessage, ['ACTOR'], '!');
      expect(repliedText).toContain('Debes proporcionar al menos un método de pago');
    });

    it('1.8 should allow updating an existing profile with new payment methods', async () => {
      await TalentService.upsertTalent({
        discordId: 'updater_user',
        role: 'ACTOR',
        paypal: 'orig_pay@mail.com'
      });

      let repliedPayload = null;
      const mockMessage = {
        author: { id: 'updater_user', username: 'Updater' },
        member: { permissions: { has: () => false } },
        reply: (payload) => {
          repliedPayload = payload;
          return Promise.resolve(payload);
        }
      };

      await registroCommand.run(null, mockMessage, ['binance', 'BNB_UPDATED_WALLET'], '!');
      expect(repliedPayload).not.toBeNull();
      expect(repliedPayload.embeds[0].data.title).toContain('Expediente de Talento Guardado');

      const updated = await TalentService.getTalent('updater_user');
      expect(updated.binance).toBe('BNB_UPDATED_WALLET');
      expect(updated.paypal).toBe('orig_pay@mail.com'); // kept!
      expect(updated.role).toBe('ACTOR'); // kept!
    });
  });

  describe('2. miperfil Command Definition & Execution', () => {
    it('2.1 should match discord-bot-architecture command structure', () => {
      expect(miperfilCommand.name).toBe('miperfil');
      expect(miperfilCommand.aliases).toContain('mi-perfil');
      expect(miperfilCommand.aliases).toContain('perfil-ver');
      expect(miperfilCommand.aliases).toContain('ver-perfil');
      expect(miperfilCommand.aliases).toContain('mi-expediente');
      expect(typeof miperfilCommand.run).toBe('function');
    });

    it('2.2 should display informational embed when self has no registered profile', async () => {
      let repliedPayload = null;
      const mockMessage = {
        author: { id: 'unregistered_user', username: 'Anon' },
        reply: (payload) => {
          repliedPayload = payload;
          return Promise.resolve(payload);
        }
      };

      await miperfilCommand.run(null, mockMessage, [], '!');
      expect(repliedPayload).not.toBeNull();
      expect(repliedPayload.embeds).toBeDefined();
      expect(repliedPayload.embeds[0].data.title).toContain('Sin Expediente Registrado');
      expect(repliedPayload.embeds[0].data.description).toContain('!registro');
    });

    it('2.3 should display error when inspecting another unregistered user', async () => {
      let repliedText = null;
      const mockMessage = {
        author: { id: 'viewer_user', username: 'Viewer' },
        reply: (payload) => {
          repliedText = typeof payload === 'string' ? payload : payload.content;
          return Promise.resolve(payload);
        }
      };

      await miperfilCommand.run(null, mockMessage, ['<@888999000>'], '!');
      expect(repliedText).toContain('no cuenta con un expediente de talento registrado');
    });

    it('2.4 should display full profile embed for registered user', async () => {
      await TalentService.upsertTalent({
        discordId: 'registered_star',
        role: 'EDITOR',
        paypal: 'star_editor@youtube.com',
        binance: 'BINANCE_STAR_99'
      });

      let repliedPayload = null;
      const mockMessage = {
        author: { id: 'registered_star', username: 'StarEditor' },
        reply: (payload) => {
          repliedPayload = payload;
          return Promise.resolve(payload);
        }
      };

      await miperfilCommand.run(null, mockMessage, [], '!');
      expect(repliedPayload).not.toBeNull();
      expect(repliedPayload.embeds).toBeDefined();

      const embedData = repliedPayload.embeds[0].data;
      expect(embedData.title).toContain('Expediente de Talento');
      expect(embedData.fields.some(f => f.name.includes('Rol') && f.value.includes('EDITOR'))).toBe(true);
      expect(embedData.fields.some(f => f.name.includes('PayPal') && f.value.includes('star_editor@youtube.com'))).toBe(true);
      expect(embedData.fields.some(f => f.name.includes('Binance') && f.value.includes('BINANCE_STAR_99'))).toBe(true);
    });

    it('2.5 should allow checking another user profile via mention', async () => {
      await TalentService.upsertTalent({
        discordId: 'actor_target_99',
        role: 'ACTOR',
        paypal: 'target_actor@mail.com',
        binance: null
      });

      let repliedPayload = null;
      const mockMessage = {
        author: { id: 'other_viewer', username: 'Viewer' },
        reply: (payload) => {
          repliedPayload = payload;
          return Promise.resolve(payload);
        }
      };

      await miperfilCommand.run(null, mockMessage, ['<@actor_target_99>'], '!');
      expect(repliedPayload).not.toBeNull();
      const embedData = repliedPayload.embeds[0].data;
      expect(embedData.title).toContain('Expediente de Talento');
      expect(embedData.description).toContain('actor_target_99');
      expect(embedData.fields.some(f => f.name.includes('Rol') && f.value.includes('ACTOR'))).toBe(true);
    });
  });
});
