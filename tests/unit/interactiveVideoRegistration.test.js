import { describe, it, expect, beforeEach, afterAll } from 'bun:test';
import registrarVideoCmd from '../../commands/video/registrarvideo.js';
import interactionEvent from '../../events/server/interactionCreate.js';
import { TalentService } from '../../src/services/talentService.js';
import { VideoService } from '../../src/services/videoService.js';
import { prisma } from '../../src/database/prisma.js';
import { InteractionType, PermissionFlagsBits } from 'discord.js';

describe('Video Registration GUI (Buttons, Modals & UserSelectMenu)', () => {
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

  it('should present the interactive start GUI when !registrar-video is invoked with no arguments', async () => {
    let replyPayload = null;
    const mockMessage = {
      author: { id: 'moderator_user_1', tag: 'Mod#0001' },
      member: { permissions: { has: () => true } },
      reply: async (payload) => {
        replyPayload = payload;
        return payload;
      }
    };

    await registrarVideoCmd.run(null, mockMessage, [], '!');

    expect(replyPayload).not.toBeNull();
    expect(replyPayload.embeds.length).toBe(1);
    expect(replyPayload.embeds[0].data.title).toContain('Registro de Video para Liquidación');
    expect(replyPayload.components.length).toBe(1);
    expect(replyPayload.components[0].components[0].data.custom_id).toContain('vidreg_btn_start');
  });

  it('should show modal when clicking vidreg_btn_start button', async () => {
    let modalShown = null;
    const mockInteraction = {
      isButton: () => true,
      customId: 'vidreg_btn_start:moderator_user_1',
      user: { id: 'moderator_user_1' },
      memberPermissions: { has: () => true },
      showModal: async (modal) => {
        modalShown = modal;
        return modal;
      },
      reply: async (p) => p
    };

    await interactionEvent.run(null, mockInteraction);

    expect(modalShown).not.toBeNull();
    expect(modalShown.data.custom_id).toContain('vidreg_submit_url');
  });

  it('should process YouTube URL modal submission and present participant select menus', async () => {
    let replyPayload = null;
    const mockModalInteraction = {
      isButton: () => false,
      isChannelSelectMenu: () => false,
      isUserSelectMenu: () => false,
      type: InteractionType.ModalSubmit,
      customId: 'vidreg_submit_url:moderator_user_1',
      user: { id: 'moderator_user_1' },
      fields: {
        getTextInputValue: (f) => 'https://www.youtube.com/watch?v=dQw4w9WgXcQ'
      },
      reply: async (payload) => {
        replyPayload = payload;
        return payload;
      }
    };

    await interactionEvent.run(null, mockModalInteraction);

    expect(replyPayload).not.toBeNull();
    expect(replyPayload.embeds[0].data.title).toContain('Paso 2: Selecciona los Talentos');
    expect(replyPayload.components.length).toBe(3);
  });

  it('should register video and save to database when actors are selected in UserSelectMenu', async () => {
    await TalentService.upsertTalent({ discordId: 'actor_gui_1', role: 'ACTOR', paypal: 'a1@gui.com' });
    await TalentService.upsertTalent({ discordId: 'actor_gui_2', role: 'ACTOR', paypal: 'a2@gui.com' });

    let updatePayload = null;
    const mockSelectInteraction = {
      isButton: () => false,
      isChannelSelectMenu: () => false,
      isUserSelectMenu: () => true,
      customId: 'vidreg_select_actors:moderator_user_1:dQw4w9WgXcQ',
      user: { id: 'moderator_user_1' },
      memberPermissions: { has: () => true },
      values: ['actor_gui_1', 'actor_gui_2'],
      update: async (payload) => {
        updatePayload = payload;
        return payload;
      },
      reply: async (p) => p
    };

    await interactionEvent.run(null, mockSelectInteraction);

    expect(updatePayload).not.toBeNull();
    expect(updatePayload.embeds[0].data.title).toContain('Video Registrado Exitosamente');

    const videoInDb = await prisma.videoRecord.findFirst({
      where: { youtubeVideoId: 'dQw4w9WgXcQ' },
      include: { participants: true }
    });

    expect(videoInDb).not.toBeNull();
    expect(videoInDb.editorId).toBeNull();
    expect(videoInDb.participants.length).toBe(2);
  });
});
