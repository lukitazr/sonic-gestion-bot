import { describe, it, expect, beforeEach, afterAll } from 'bun:test';
import tarifasCmd from '../../commands/admin/tarifas.js';
import interactionEvent from '../../events/server/interactionCreate.js';
import { ConfigService } from '../../src/services/configService.js';
import { prisma } from '../../src/database/prisma.js';
import { InteractionType, PermissionFlagsBits } from 'discord.js';

describe('Tarifas Interactive GUI & Multi-Parameter Configuration', () => {
  beforeEach(async () => {
    await prisma.config.deleteMany({});
    await ConfigService.init();
  });

  afterAll(async () => {
    await prisma.config.deleteMany({});
    await prisma.$disconnect();
  });

  it('should render !tarifas with embed and interactive action buttons for editing', async () => {
    let replyPayload = null;
    const mockMessage = {
      author: { id: 'admin_user_99', tag: 'Admin#0099' },
      member: { permissions: { has: () => true } },
      reply: async (payload) => {
        replyPayload = payload;
        return payload;
      }
    };

    await tarifasCmd.run(null, mockMessage, [], '!');

    expect(replyPayload).not.toBeNull();
    expect(replyPayload.embeds.length).toBe(1);
    expect(replyPayload.embeds[0].data.title).toContain('Configuración Dinámica de Tarifas');
    expect(replyPayload.components.length).toBe(2);
    expect(replyPayload.components[0].components[0].data.custom_id).toContain('cfg_modal_rates');
    expect(replyPayload.components[0].components[1].data.custom_id).toContain('cfg_modal_bonuses');
    expect(replyPayload.components[1].components[0].data.custom_id).toContain('cfg_modal_waitdays');
    expect(replyPayload.components[1].components[1].data.custom_id).toContain('cfg_refresh_rates');
  });

  it('should present multi-field modal when clicking cfg_modal_rates button', async () => {
    let modalShown = null;
    const mockInteraction = {
      isButton: () => true,
      customId: 'cfg_modal_rates:admin_user_99',
      user: { id: 'admin_user_99' },
      memberPermissions: { has: () => true },
      showModal: async (modal) => {
        modalShown = modal;
        return modal;
      },
      reply: async (p) => p
    };

    await interactionEvent.run(null, mockInteraction);

    expect(modalShown).not.toBeNull();
    expect(modalShown.data.custom_id).toContain('cfg_submit_rates');
    expect(modalShown.components.length).toBe(3); // actor, editor, currency
  });

  it('should update multiple rate fields at once via modal submission', async () => {
    let updatePayload = null;
    const mockModalSubmit = {
      isButton: () => false,
      isChannelSelectMenu: () => false,
      isUserSelectMenu: () => false,
      type: InteractionType.ModalSubmit,
      customId: 'cfg_submit_rates:admin_user_99',
      user: { id: 'admin_user_99' },
      memberPermissions: { has: () => true },
      fields: {
        getTextInputValue: (field) => {
          if (field === 'actor_base') return '35.5';
          if (field === 'editor_base') return '160.0';
          if (field === 'currency') return 'USD';
          return '';
        }
      },
      update: async (payload) => {
        updatePayload = payload;
        return payload;
      },
      reply: async (p) => p
    };

    await interactionEvent.run(null, mockModalSubmit);

    expect(updatePayload).not.toBeNull();
    const config = await ConfigService.getConfig(true);
    expect(config.actorBase).toBe(35.5);
    expect(config.editorBase).toBe(160.0);
    expect(config.currency).toBe('USD');
  });

  it('should update thresholds and bonuses via cfg_submit_bonuses modal', async () => {
    let updatePayload = null;
    const mockModalSubmit = {
      isButton: () => false,
      isChannelSelectMenu: () => false,
      isUserSelectMenu: () => false,
      type: InteractionType.ModalSubmit,
      customId: 'cfg_submit_bonuses:admin_user_99',
      user: { id: 'admin_user_99' },
      memberPermissions: { has: () => true },
      fields: {
        getTextInputValue: (field) => {
          if (field === 'threshold1') return '600000';
          if (field === 'bonus1') return '30';
          if (field === 'threshold2') return '1200000';
          if (field === 'bonus2') return '40';
          return '';
        }
      },
      update: async (payload) => {
        updatePayload = payload;
        return payload;
      },
      reply: async (p) => p
    };

    await interactionEvent.run(null, mockModalSubmit);

    expect(updatePayload).not.toBeNull();
    const config = await ConfigService.getConfig(true);
    expect(config.threshold1).toBe(600000);
    expect(config.bonus1).toBe(30.0);
    expect(config.threshold2).toBe(1200000);
    expect(config.bonus2).toBe(40.0);
  });
});
