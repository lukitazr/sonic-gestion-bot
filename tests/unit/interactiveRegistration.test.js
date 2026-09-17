import { describe, it, expect, beforeEach, afterAll } from 'bun:test';
import { InteractionType } from 'discord.js';
import interactionEvent from '../../events/server/interactionCreate.js';
import { TalentService } from '../../src/services/talentService.js';
import { prisma } from '../../src/database/prisma.js';

describe('GUI Interactive Registration (Buttons & Modals)', () => {
  beforeEach(async () => {
    await prisma.talent.deleteMany({});
  });

  afterAll(async () => {
    await prisma.talent.deleteMany({});
    await prisma.$disconnect();
  });

  it('should handle button click to select ACTOR and present payment buttons', async () => {
    let updatePayload = null;
    const mockButtonInteraction = {
      isButton: () => true,
      customId: 'reg_role_actor:user_gui_1',
      user: { id: 'user_gui_1' },
      update: async (payload) => {
        updatePayload = payload;
        return payload;
      },
      reply: async (payload) => payload
    };

    await interactionEvent.run(null, mockButtonInteraction);

    expect(updatePayload).not.toBeNull();
    expect(updatePayload.embeds[0].data.title).toContain('Paso 2: Métodos de Pago');
    expect(updatePayload.embeds[0].data.title).toContain('ACTOR');
    expect(updatePayload.components[0].components.some(c => c.data.label.includes('PayPal'))).toBe(true);
    expect(updatePayload.components[0].components.some(c => c.data.label.includes('Binance'))).toBe(true);
  });

  it('should handle button click to select EDITOR and present payment buttons', async () => {
    let updatePayload = null;
    const mockButtonInteraction = {
      isButton: () => true,
      customId: 'reg_role_editor:user_gui_2',
      user: { id: 'user_gui_2' },
      update: async (payload) => {
        updatePayload = payload;
        return payload;
      },
      reply: async (payload) => payload
    };

    await interactionEvent.run(null, mockButtonInteraction);

    expect(updatePayload).not.toBeNull();
    expect(updatePayload.embeds[0].data.title).toContain('EDITOR');
  });

  it('should reject interaction from unauthorized user', async () => {
    let replyPayload = null;
    const mockButtonInteraction = {
      isButton: () => true,
      customId: 'reg_role_actor:user_owner',
      user: { id: 'user_intruder' },
      reply: async (payload) => {
        replyPayload = payload;
        return payload;
      }
    };

    await interactionEvent.run(null, mockButtonInteraction);

    expect(replyPayload).not.toBeNull();
    expect(replyPayload.content).toContain('Solo el usuario que inició el registro');
  });

  it('should process PayPal modal submission and save profile to database', async () => {
    let updatePayload = null;
    const mockModalInteraction = {
      isButton: () => false,
      type: InteractionType.ModalSubmit,
      customId: 'reg_submit_paypal:ACTOR:user_modal_pay',
      user: { id: 'user_modal_pay' },
      fields: {
        getTextInputValue: (field) => 'https://paypal.me/lukitazr'
      },
      update: async (payload) => {
        updatePayload = payload;
        return payload;
      },
      reply: async (payload) => payload
    };

    await interactionEvent.run(null, mockModalInteraction);

    expect(updatePayload).not.toBeNull();
    expect(updatePayload.embeds[0].data.title).toContain('Expediente Guardado Exitosamente');

    const saved = await TalentService.getTalent('user_modal_pay');
    expect(saved).not.toBeNull();
    expect(saved.role).toBe('ACTOR');
    expect(saved.paypal).toBe('https://paypal.me/lukitazr');
  });

  it('should process Binance modal submission and save profile to database', async () => {
    let updatePayload = null;
    const mockModalInteraction = {
      isButton: () => false,
      type: InteractionType.ModalSubmit,
      customId: 'reg_submit_binance:EDITOR:user_modal_bnb',
      user: { id: 'user_modal_bnb' },
      fields: {
        getTextInputValue: (field) => '88776655'
      },
      update: async (payload) => {
        updatePayload = payload;
        return payload;
      },
      reply: async (payload) => payload
    };

    await interactionEvent.run(null, mockModalInteraction);

    expect(updatePayload).not.toBeNull();
    expect(updatePayload.embeds[0].data.title).toContain('Expediente Guardado Exitosamente');

    const saved = await TalentService.getTalent('user_modal_bnb');
    expect(saved).not.toBeNull();
    expect(saved.role).toBe('EDITOR');
    expect(saved.binance).toBe('88776655');
  });
});
