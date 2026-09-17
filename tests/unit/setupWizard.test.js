import { describe, it, expect, beforeEach, afterAll } from 'bun:test';
import { prisma } from '../../src/database/prisma.js';
import { ConfigService } from '../../src/services/configService.js';
import { YouTubeService } from '../../src/services/youtubeService.js';
import setupCmd from '../../commands/admin/setup.js';
import interactionEvent, { setupSessions, getOrCreateSetupSession } from '../../events/server/interactionCreate.js';
import { InteractionType, ChannelType, PermissionFlagsBits } from 'discord.js';

describe('Interactive Setup Wizard (!setup)', () => {
  beforeEach(async () => {
    await prisma.config.deleteMany({});
    await ConfigService.init();
    setupSessions.clear();
    YouTubeService.clearMocks();
  });

  afterAll(async () => {
    await prisma.config.deleteMany({});
    await prisma.$disconnect();
  });

  it('1. should conform to command structure and reject non-admin users', async () => {
    expect(setupCmd.name).toBe('setup');
    expect(setupCmd.aliases).toContain('config-setup');
    expect(setupCmd.aliases).toContain('wizard');
    expect(setupCmd.permisos).toContain(PermissionFlagsBits.Administrator);

    let replyPayload = null;
    const nonAdminMsg = {
      author: { id: 'regular_user_1', tag: 'User#0001' },
      member: { permissions: { has: () => false } },
      reply: async (payload) => {
        replyPayload = payload;
        return payload;
      }
    };

    await setupCmd.run(null, nonAdminMsg, [], '!');

    expect(replyPayload).not.toBeNull();
    const replyText = typeof replyPayload === 'string' ? replyPayload : (replyPayload.content || '');
    expect(replyText).toContain('permisos');
  });

  it('2. should display welcome embed and entrypoint buttons on !setup with admin permissions', async () => {
    let replyPayload = null;
    const adminMsg = {
      author: { id: 'admin_user_1', tag: 'Admin#0001' },
      member: { permissions: { has: () => true } },
      reply: async (payload) => {
        replyPayload = payload;
        return payload;
      }
    };

    await setupCmd.run(null, adminMsg, [], '!');

    expect(replyPayload).not.toBeNull();
    expect(replyPayload.embeds[0].data.title).toContain('Asistente de Configuración Integral');
    expect(replyPayload.components.length).toBe(1);

    const buttons = replyPayload.components[0].components;
    expect(buttons.length).toBe(2);
    expect(buttons[0].data.custom_id).toContain('setup_btn_step:prefix');
    expect(buttons[1].data.custom_id).toContain('setup_btn_cancel');
  });

  it('3. should navigate across all 7 wizard steps seamlessly', async () => {
    const authorId = 'admin_nav_user';

    const testStep = async (targetStep, expectedTitle) => {
      let updatePayload = null;
      const mockInteraction = {
        isButton: () => true,
        isChannelSelectMenu: () => false,
        isUserSelectMenu: () => false,
        isStringSelectMenu: () => false,
        customId: `setup_btn_step:${targetStep}:${authorId}`,
        user: { id: authorId },
        memberPermissions: { has: () => true },
        update: async (payload) => {
          updatePayload = payload;
          return payload;
        },
        reply: async (p) => p
      };

      await interactionEvent.run(null, mockInteraction);
      expect(updatePayload).not.toBeNull();
      expect(updatePayload.embeds[0].data.title).toContain(expectedTitle);
      return updatePayload;
    };

    // Step 1: Prefix
    await testStep('prefix', 'Paso 1/6');
    // Step 2: Channels
    await testStep('channels', 'Paso 2/6');
    // Step 3: YouTube
    await testStep('youtube', 'Paso 3/6');
    // Step 4: Base Rates
    await testStep('rates', 'Paso 4/6');
    // Step 5: Bonuses
    await testStep('bonuses', 'Paso 5/6');
    // Step 6: General
    await testStep('general', 'Paso 6/6');
    // Step 7: Summary
    const summaryPayload = await testStep('summary', 'Resumen Final');
    expect(summaryPayload.components[0].components[0].data.custom_id).toContain('setup_btn_save');
  });

  it('4. should update session draft through channel selects and modal submissions', async () => {
    const authorId = 'admin_edit_user';
    const session = await getOrCreateSetupSession(authorId);

    // 4.1 Update Channels via ChannelSelectMenu
    const mockChannelSelect = {
      isButton: () => false,
      isChannelSelectMenu: () => true,
      isUserSelectMenu: () => false,
      isStringSelectMenu: () => false,
      customId: `setup_select_channel_history:${authorId}`,
      user: { id: authorId },
      memberPermissions: { has: () => true },
      values: ['111222333444555666'],
      update: async (p) => p
    };
    await interactionEvent.run(null, mockChannelSelect);
    expect(session.data.historyChannelId).toBe('111222333444555666');

    const mockAdminChannelSelect = {
      isButton: () => false,
      isChannelSelectMenu: () => true,
      isUserSelectMenu: () => false,
      isStringSelectMenu: () => false,
      customId: `setup_select_channel_admin:${authorId}`,
      user: { id: authorId },
      memberPermissions: { has: () => true },
      values: ['999888777666555444'],
      update: async (p) => p
    };
    await interactionEvent.run(null, mockAdminChannelSelect);
    expect(session.data.adminChannelId).toBe('999888777666555444');

    // 4.2 Update Prefix via Modal Submit
    const mockPrefixModal = {
      isButton: () => false,
      isChannelSelectMenu: () => false,
      isUserSelectMenu: () => false,
      isStringSelectMenu: () => false,
      type: InteractionType.ModalSubmit,
      customId: `setup_submit_prefix:${authorId}`,
      user: { id: authorId },
      memberPermissions: { has: () => true },
      fields: {
        getTextInputValue: (f) => '?'
      },
      update: async (p) => p
    };
    await interactionEvent.run(null, mockPrefixModal);
    expect(session.data.prefix).toBe('?');

    // 4.3 Update YouTube Channel via Modal Submit
    YouTubeService.setMockChannel('@SonicOfficial', {
      channelId: 'UC_MOCK_SONIC_CHANNEL',
      title: 'Canal Oficial de Sonic',
      url: 'https://www.youtube.com/@SonicOfficial'
    });

    const mockYtModal = {
      isButton: () => false,
      isChannelSelectMenu: () => false,
      isUserSelectMenu: () => false,
      isStringSelectMenu: () => false,
      type: InteractionType.ModalSubmit,
      customId: `setup_submit_youtube:${authorId}`,
      user: { id: authorId },
      memberPermissions: { has: () => true },
      fields: {
        getTextInputValue: (f) => '@SonicOfficial'
      },
      update: async (p) => p
    };
    await interactionEvent.run(null, mockYtModal);
    expect(session.data.youtubeChannelId).toBe('UC_MOCK_SONIC_CHANNEL');
    expect(session.data.youtubeChannelTitle).toBe('Canal Oficial de Sonic');

    // 4.4 Update Base Rates via Modal Submit
    const mockRatesModal = {
      isButton: () => false,
      isChannelSelectMenu: () => false,
      isUserSelectMenu: () => false,
      isStringSelectMenu: () => false,
      type: InteractionType.ModalSubmit,
      customId: `setup_submit_rates:${authorId}`,
      user: { id: authorId },
      memberPermissions: { has: () => true },
      fields: {
        getTextInputValue: (f) => (f === 'actor_base_input' ? '40' : '200')
      },
      update: async (p) => p
    };
    await interactionEvent.run(null, mockRatesModal);
    expect(session.data.actorBase).toBe(40);
    expect(session.data.editorBase).toBe(200);

    // 4.5 Update Bonuses via Modal Submit
    const mockBonusesModal = {
      isButton: () => false,
      isChannelSelectMenu: () => false,
      isUserSelectMenu: () => false,
      isStringSelectMenu: () => false,
      type: InteractionType.ModalSubmit,
      customId: `setup_submit_bonuses:${authorId}`,
      user: { id: authorId },
      memberPermissions: { has: () => true },
      fields: {
        getTextInputValue: (f) => {
          if (f === 'threshold1_input') return '600000';
          if (f === 'bonus1_input') return '35';
          if (f === 'threshold2_input') return '1200000';
          if (f === 'bonus2_input') return '45';
          return '0';
        }
      },
      update: async (p) => p
    };
    await interactionEvent.run(null, mockBonusesModal);
    expect(session.data.threshold1).toBe(600000);
    expect(session.data.bonus1).toBe(35);
    expect(session.data.threshold2).toBe(1200000);
    expect(session.data.bonus2).toBe(45);

    // 4.6 Update General (Currency and WaitDays) via Modal Submit
    const mockGeneralModal = {
      isButton: () => false,
      isChannelSelectMenu: () => false,
      isUserSelectMenu: () => false,
      isStringSelectMenu: () => false,
      type: InteractionType.ModalSubmit,
      customId: `setup_submit_general:${authorId}`,
      user: { id: authorId },
      memberPermissions: { has: () => true },
      fields: {
        getTextInputValue: (f) => (f === 'currency_input' ? 'USD' : '7')
      },
      update: async (p) => p
    };
    await interactionEvent.run(null, mockGeneralModal);
    expect(session.data.currency).toBe('USD');
    expect(session.data.waitDays).toBe(7);

    // 4.7 Save All to Database via Confirm Button
    let saveReply = null;
    const mockSaveButton = {
      isButton: () => true,
      isChannelSelectMenu: () => false,
      isUserSelectMenu: () => false,
      isStringSelectMenu: () => false,
      customId: `setup_btn_save:${authorId}`,
      user: { id: authorId },
      memberPermissions: { has: () => true },
      update: async (payload) => {
        saveReply = payload;
        return payload;
      },
      reply: async (p) => p
    };

    await interactionEvent.run(null, mockSaveButton);

    expect(saveReply).not.toBeNull();
    expect(saveReply.embeds[0].data.title).toContain('Configuración Integral Aplicada Exitosamente');
    expect(setupSessions.has(authorId)).toBe(false);

    // 4.8 Verify SQLite Database state matches all customized values
    const configInDb = await prisma.config.findFirst();
    expect(configInDb.prefix).toBe('?');
    expect(configInDb.historyChannelId).toBe('111222333444555666');
    expect(configInDb.adminChannelId).toBe('999888777666555444');
    expect(configInDb.youtubeChannelId).toBe('UC_MOCK_SONIC_CHANNEL');
    expect(configInDb.actorBase).toBe(40);
    expect(configInDb.editorBase).toBe(200);
    expect(configInDb.threshold1).toBe(600000);
    expect(configInDb.bonus1).toBe(35);
    expect(configInDb.threshold2).toBe(1200000);
    expect(configInDb.bonus2).toBe(45);
    expect(configInDb.currency).toBe('USD');
    expect(configInDb.waitDays).toBe(7);
    expect(ConfigService.getPrefix()).toBe('?');
  });

  it('5. should handle cancel button and terminate wizard without altering database', async () => {
    const authorId = 'admin_cancel_user';
    const session = await getOrCreateSetupSession(authorId);
    session.data.prefix = 'X'; // Modify draft

    let cancelReply = null;
    const mockCancelInteraction = {
      isButton: () => true,
      isChannelSelectMenu: () => false,
      isUserSelectMenu: () => false,
      isStringSelectMenu: () => false,
      customId: `setup_btn_cancel:${authorId}`,
      user: { id: authorId },
      memberPermissions: { has: () => true },
      update: async (payload) => {
        cancelReply = payload;
        return payload;
      }
    };

    await interactionEvent.run(null, mockCancelInteraction);

    expect(cancelReply).not.toBeNull();
    expect(cancelReply.embeds[0].data.title).toContain('Asistente Cancelado');
    expect(setupSessions.has(authorId)).toBe(false);

    const configInDb = await prisma.config.findFirst();
    expect(configInDb.prefix).toBe('!'); // Unchanged
  });
});

