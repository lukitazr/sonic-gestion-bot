import { describe, it, expect, beforeEach, afterAll } from 'bun:test';
import { PermissionFlagsBits } from 'discord.js';
import adminRegistroCmd, {
  buildAdminTalentSelectEmbed,
  buildAdminTalentSelectRows,
  buildAdminTalentCardEmbed,
  buildAdminTalentCardRows
} from '../../commands/admin/registrartalento.js';
import { TalentService } from '../../src/services/talentService.js';
import interactionCreateEvent from '../../events/server/interactionCreate.js';
import { prisma } from '../../src/database/prisma.js';

describe('Admin Talent Registration GUI (admin-registro)', () => {
  const adminId = 'admin_snowflake_999';
  const talentUserA = 'talent_snowflake_111';
  const talentUserB = 'talent_snowflake_222';

  beforeEach(async () => {
    await prisma.videoParticipant.deleteMany();
    await prisma.videoRecord.deleteMany();
    await prisma.talent.deleteMany();
  });

  afterAll(async () => {
    await prisma.videoParticipant.deleteMany();
    await prisma.videoRecord.deleteMany();
    await prisma.talent.deleteMany();
  });

  it('1. should conform to command structure with Administrator permissions and aliases', () => {
    expect(adminRegistroCmd.name).toBe('admin-registro');
    expect(adminRegistroCmd.permisos).toContain(PermissionFlagsBits.Administrator);
    expect(adminRegistroCmd.aliases).toContain('adminregistro');
    expect(adminRegistroCmd.aliases).toContain('reg-talento');
    expect(adminRegistroCmd.aliases).toContain('admin-talento');
    expect(typeof adminRegistroCmd.run).toBe('function');
  });

  it('2. should display user selection menu when invoked without arguments', async () => {
    let replyPayload = null;
    const mockMessage = {
      author: { id: adminId },
      reply: async (payload) => {
        replyPayload = payload;
        return payload;
      }
    };

    await adminRegistroCmd.run({}, mockMessage, [], '!');

    expect(replyPayload).not.toBeNull();
    const embed = replyPayload.embeds[0];
    expect(embed.data.title).toContain('Registro Administrativo de Talentos');
    expect(replyPayload.components.length).toBeGreaterThan(0);
    // Contains UserSelectMenu
    const menu = replyPayload.components[0].components[0];
    expect(menu.data.custom_id).toContain('admreg_select_user');
  });

  it('3. should display talent card directly when target user is mentioned', async () => {
    // Seed existing talent
    await TalentService.upsertTalent({
      discordId: talentUserA,
      role: 'ACTOR',
      paypal: 'actor@domain.com',
      binance: '12345678'
    });

    let replyPayload = null;
    const mockMessage = {
      author: { id: adminId },
      reply: async (payload) => {
        replyPayload = payload;
        return payload;
      }
    };

    const mockClient = {
      users: {
        cache: new Map([[talentUserA, { id: talentUserA, username: 'SonicActor', tag: 'SonicActor#0001' }]]),
        fetch: async (id) => ({ id, username: 'SonicActor', tag: 'SonicActor#0001' })
      }
    };

    await adminRegistroCmd.run(mockClient, mockMessage, [`<@!${talentUserA}>`], '!');

    expect(replyPayload).not.toBeNull();
    const embed = replyPayload.embeds[0];
    expect(embed.data.title).toContain('Expediente de Talento');
    expect(embed.data.description).toContain(talentUserA);

    const fullText = embed.data.fields.map(f => f.value).join(' ');
    expect(fullText).toContain('ACTOR');
    expect(fullText).toContain('actor@domain.com');
  });

  it('4. should handle user selection via UserSelectMenu in interactionCreate', async () => {
    let updatePayload = null;
    const mockInteraction = {
      isButton: () => false,
      isChannelSelectMenu: () => false,
      isUserSelectMenu: () => true,
      customId: `admreg_select_user:${adminId}`,
      values: [talentUserB],
      user: { id: adminId },
      memberPermissions: { has: (perm) => perm === PermissionFlagsBits.Administrator },
      update: async (payload) => {
        updatePayload = payload;
        return payload;
      }
    };

    const mockClient = {
      users: {
        cache: new Map(),
        fetch: async (id) => ({ id, username: 'NuevoTalento', tag: 'NuevoTalento#0002' })
      }
    };

    await interactionCreateEvent.run(mockClient, mockInteraction);

    expect(updatePayload).not.toBeNull();
    const embed = updatePayload.embeds[0];
    expect(embed.data.title).toContain('Expediente de Talento: NuevoTalento');
    expect(updatePayload.components.length).toBe(2);
  });

  it('5. should open modal on admreg_open_modal button click', async () => {
    let modalShown = null;
    const mockInteraction = {
      isButton: () => true,
      isChannelSelectMenu: () => false,
      isUserSelectMenu: () => false,
      customId: `admreg_open_modal:${adminId}:${talentUserA}:ACTOR`,
      user: { id: adminId },
      memberPermissions: { has: (perm) => perm === PermissionFlagsBits.Administrator },
      showModal: async (modal) => {
        modalShown = modal;
        return modal;
      }
    };

    await interactionCreateEvent.run({}, mockInteraction);

    expect(modalShown).not.toBeNull();
    expect(modalShown.data.custom_id).toContain(`admreg_submit_form:${adminId}:${talentUserA}`);
  });

  it('6. should reject submission when both PayPal and Binance are empty', async () => {
    let replyPayload = null;
    const mockInteraction = {
      type: 5, // InteractionType.ModalSubmit
      isButton: () => false,
      isChannelSelectMenu: () => false,
      isUserSelectMenu: () => false,
      customId: `admreg_submit_form:${adminId}:${talentUserA}`,
      user: { id: adminId },
      memberPermissions: { has: (perm) => perm === PermissionFlagsBits.Administrator },
      fields: {
        getTextInputValue: (field) => {
          if (field === 'role_val') return 'ACTOR';
          if (field === 'paypal_val') return '';
          if (field === 'binance_val') return '';
          if (field === 'notify_val') return 'NO';
          return '';
        }
      },
      reply: async (payload) => {
        replyPayload = payload;
        return payload;
      }
    };

    await interactionCreateEvent.run({}, mockInteraction);

    expect(replyPayload).not.toBeNull();
    expect(replyPayload.content).toContain('Debes proporcionar al menos un método de pago');
  });

  it('7. should successfully save talent and send DM notification on valid modal submission', async () => {
    let dmSent = false;
    let targetUser = {
      id: talentUserA,
      send: async () => {
        dmSent = true;
        return true;
      }
    };

    const mockClient = {
      users: {
        cache: new Map([[talentUserA, targetUser]]),
        fetch: async () => targetUser
      }
    };

    let updatePayload = null;
    const mockInteraction = {
      type: 5, // ModalSubmit
      isButton: () => false,
      isChannelSelectMenu: () => false,
      isUserSelectMenu: () => false,
      customId: `admreg_submit_form:${adminId}:${talentUserA}`,
      user: { id: adminId },
      memberPermissions: { has: (perm) => perm === PermissionFlagsBits.Administrator },
      fields: {
        getTextInputValue: (field) => {
          if (field === 'role_val') return 'EDITOR';
          if (field === 'paypal_val') return 'editor_pro@gmail.com';
          if (field === 'binance_val') return '88776655';
          if (field === 'notify_val') return 'SI';
          return '';
        }
      },
      update: async (payload) => {
        updatePayload = payload;
        return payload;
      }
    };

    await interactionCreateEvent.run(mockClient, mockInteraction);

    // Verify DB persistence
    const saved = await TalentService.getTalent(talentUserA);
    expect(saved).not.toBeNull();
    expect(saved.role).toBe('EDITOR');
    expect(saved.paypal).toBe('editor_pro@gmail.com');
    expect(saved.binance).toBe('88776655');

    // Verify DM notification
    expect(dmSent).toBe(true);

    // Verify update embed
    expect(updatePayload).not.toBeNull();
    const embed = updatePayload.embeds[0];
    expect(embed.data.title).toContain('Guardado Exitosamente');
  });

  it('8. should delete talent record on admreg_btn_delete', async () => {
    // Seed talent
    await TalentService.upsertTalent({
      discordId: talentUserA,
      role: 'ACTOR',
      paypal: 'delete_me@test.com'
    });

    let updatePayload = null;
    const mockInteraction = {
      isButton: () => true,
      isChannelSelectMenu: () => false,
      isUserSelectMenu: () => false,
      customId: `admreg_btn_delete:${adminId}:${talentUserA}`,
      user: { id: adminId },
      memberPermissions: { has: (perm) => perm === PermissionFlagsBits.Administrator },
      update: async (payload) => {
        updatePayload = payload;
        return payload;
      }
    };

    await interactionCreateEvent.run({}, mockInteraction);

    const checked = await TalentService.getTalent(talentUserA);
    expect(checked).toBeNull();
    expect(updatePayload.embeds[0].data.title).toContain('Expediente Eliminado');
  });
});
