import { describe, it, expect, beforeEach, afterAll } from 'bun:test';
import { prisma } from '../../src/database/prisma.js';
import { ConfigService } from '../../src/services/configService.js';
import { TalentService } from '../../src/services/talentService.js';
import { YouTubeService } from '../../src/services/youtubeService.js';
import setCanalCmd from '../../commands/admin/setcanal.js';
import registrarVideoCmd from '../../commands/video/registrarvideo.js';
import interactionEvent from '../../events/server/interactionCreate.js';

describe('YouTube Channel Setup & 25-Video Interactive Registration Flow', () => {
  beforeEach(async () => {
    await prisma.videoParticipant.deleteMany({});
    await prisma.videoRecord.deleteMany({});
    await prisma.talent.deleteMany({});
    await prisma.config.deleteMany({});
    await ConfigService.init();
    YouTubeService.clearMocks();
  });

  afterAll(async () => {
    await prisma.videoParticipant.deleteMany({});
    await prisma.videoRecord.deleteMany({});
    await prisma.talent.deleteMany({});
    await prisma.config.deleteMany({});
    await prisma.$disconnect();
  });

  it('should set YouTube channel in database via set-canal command', async () => {
    YouTubeService.setMockChannel('@SonicOfficial', {
      channelId: 'UC_SONIC_CHANNEL_01',
      title: 'Sonic The Hedgehog Oficial',
      url: 'https://www.youtube.com/@SonicOfficial'
    });

    let replyPayload = null;
    const mockMessage = {
      author: { id: 'admin_user_1', tag: 'Admin#0001' },
      member: { permissions: { has: () => true } },
      reply: async (payload) => {
        replyPayload = payload;
        return payload;
      }
    };

    await setCanalCmd.run(null, mockMessage, ['https://www.youtube.com/@SonicOfficial'], '!');

    expect(replyPayload).not.toBeNull();
    expect(replyPayload.embeds[0].data.title).toContain('Canal de YouTube Vinculado');

    const config = await ConfigService.getConfig();
    expect(config.youtubeChannelId).toBe('UC_SONIC_CHANNEL_01');
    expect(config.youtubeChannelTitle).toBe('Sonic The Hedgehog Oficial');
    expect(config.youtubeChannelUrl).toBe('https://www.youtube.com/@SonicOfficial');
  });

  it('should reject non-admin users executing set-canal', async () => {
    let replyPayload = null;
    const mockMessage = {
      author: { id: 'regular_user_1', tag: 'User#0001' },
      member: { permissions: { has: () => false } },
      reply: async (payload) => {
        replyPayload = payload;
        return payload;
      }
    };

    await setCanalCmd.run(null, mockMessage, ['@AnyChannel'], '!');

    expect(replyPayload).not.toBeNull();
    const replyText = typeof replyPayload === 'string' ? replyPayload : (replyPayload.content || '');
    expect(replyText).toContain('permisos');

    const config = await ConfigService.getConfig();
    expect(config.youtubeChannelId).toBeNull();
  });

  it('should display the latest 25 videos in StringSelectMenuBuilder when channel is configured', async () => {
    // 1. Configure channel
    await ConfigService.setYoutubeChannel({
      channelId: 'UC_TEST_25_VIDS',
      title: 'Canal Oficial de Prueba',
      url: 'https://youtube.com/@CanalPrueba'
    });

    // 2. Mock 25 recent videos
    const mockVideos = [];
    for (let i = 1; i <= 25; i++) {
      mockVideos.push({
        videoId: `VID_TEST_${String(i).padStart(3, '0')}`,
        title: `Episodio ${i} - Aventura Sonic`,
        publishedAt: new Date(Date.now() - i * 3600000).toISOString(),
        viewCount: 10000 * i
      });
    }
    YouTubeService.setMockChannelVideos('UC_TEST_25_VIDS', mockVideos);

    let replyPayload = null;
    const mockMessage = {
      author: { id: 'admin_user_1', tag: 'Admin#0001' },
      member: { permissions: { has: () => true } },
      reply: async (payload) => {
        replyPayload = payload;
        return payload;
      }
    };

    await registrarVideoCmd.run(null, mockMessage, [], '!');

    expect(replyPayload).not.toBeNull();
    expect(replyPayload.embeds.length).toBe(1);
    expect(replyPayload.embeds[0].data.title).toContain('Registro de Video');

    // Components: Row 0 has StringSelectMenu with 25 videos; Row 1 has buttons (Start URL and Exit)
    expect(replyPayload.components.length).toBe(2);

    const videoSelectComponent = replyPayload.components[0].components[0];
    expect(videoSelectComponent.data.custom_id).toContain('vidreg_select_recent_video');
    expect(videoSelectComponent.options.length).toBe(25);
    expect(videoSelectComponent.options[0].data.value).toBe('VID_TEST_001');

    const buttonRow = replyPayload.components[1].components;
    expect(buttonRow.length).toBe(2);
    expect(buttonRow[0].data.custom_id).toContain('vidreg_btn_start');
    expect(buttonRow[1].data.custom_id).toContain('vidreg_btn_exit');
  });

  it('should handle "Salir" button and cancel the video registration interaction', async () => {
    let updatePayload = null;
    const mockInteraction = {
      isButton: () => true,
      customId: 'vidreg_btn_exit:user_test_exit',
      user: { id: 'user_test_exit' },
      memberPermissions: { has: () => true },
      update: async (payload) => {
        updatePayload = payload;
        return payload;
      }
    };

    await interactionEvent.run(null, mockInteraction);

    expect(updatePayload).not.toBeNull();
    expect(updatePayload.embeds[0].data.title).toContain('Registro Finalizado');
    expect(updatePayload.components).toEqual([]);
  });

  it('should restrict talent options to ONLY registered database talents and gate persistence behind confirmation button', async () => {
    // 1. Setup registered talents in DB
    const actor1 = await TalentService.upsertTalent({
      discordId: 'registered_actor_111',
      role: 'ACTOR',
      paypal: 'actor1@paypal.me'
    });
    const actor2 = await TalentService.upsertTalent({
      discordId: 'registered_actor_222',
      role: 'ACTOR',
      paypal: 'actor2@paypal.me'
    });
    const editor1 = await TalentService.upsertTalent({
      discordId: 'registered_editor_333',
      role: 'EDITOR',
      paypal: 'editor1@paypal.me'
    });

    const testVideoId = 'dQw4w9WgXcQ';
    YouTubeService.setMockVideo(testVideoId, {
      title: 'Capítulo Especial Sonic',
      viewCount: 150000,
      thumbnailUrl: `https://img.youtube.com/vi/${testVideoId}/hqdefault.jpg`
    });

    // 2. Select recent video from select menu
    let selectVideoReply = null;
    const mockSelectVideoInteraction = {
      isButton: () => false,
      isChannelSelectMenu: () => false,
      isUserSelectMenu: () => false,
      isStringSelectMenu: () => true,
      customId: 'vidreg_select_recent_video:admin_reg_user',
      user: { id: 'admin_reg_user' },
      memberPermissions: { has: () => true },
      values: [testVideoId],
      update: async (payload) => {
        selectVideoReply = payload;
        return payload;
      },
      reply: async (p) => p
    };

    await interactionEvent.run(null, mockSelectVideoInteraction);

    expect(selectVideoReply).not.toBeNull();
    expect(selectVideoReply.embeds[0].data.title).toContain('Paso 2: Selecciona los Talentos');

    // 3 components: Actor StringSelectMenu, Editor StringSelectMenu, Confirm/Cancel ButtonRow
    expect(selectVideoReply.components.length).toBe(3);

    const actorSelect = selectVideoReply.components[0].components[0];
    const editorSelect = selectVideoReply.components[1].components[0];
    const buttonsRow = selectVideoReply.components[2].components;

    // Verify talent options contain ONLY the 3 registered talents
    const actorOptionValues = actorSelect.options.map(o => o.data.value);
    expect(actorOptionValues).toContain(actor1.discordId);
    expect(actorOptionValues).toContain(actor2.discordId);
    expect(actorOptionValues).not.toContain('unregistered_random_user_999');

    // Verify Confirm Button is initially disabled because no participants are selected yet
    const confirmBtnInitial = buttonsRow[0];
    expect(confirmBtnInitial.data.disabled).toBe(true);

    // Extract draftId from actor select customId
    const draftId = actorSelect.data.custom_id.replace('vidreg_select_registered_actors:', '');

    // 3. Select Actor in StringSelectMenu
    let actorSelectReply = null;
    const mockActorSelectInteraction = {
      isButton: () => false,
      isChannelSelectMenu: () => false,
      isUserSelectMenu: () => false,
      isStringSelectMenu: () => true,
      customId: `vidreg_select_registered_actors:${draftId}`,
      user: { id: 'admin_reg_user' },
      memberPermissions: { has: () => true },
      values: [actor1.discordId, actor2.discordId],
      update: async (payload) => {
        actorSelectReply = payload;
        return payload;
      },
      reply: async (p) => p
    };

    await interactionEvent.run(null, mockActorSelectInteraction);

    // After choosing actors, confirm button is now enabled
    expect(actorSelectReply).not.toBeNull();
    const confirmBtnAfterActors = actorSelectReply.components[2].components[0];
    expect(confirmBtnAfterActors.data.disabled).toBe(false);

    // CRITICAL: Verify video is NOT yet saved in database before confirmation button is clicked
    let videoInDb = await prisma.videoRecord.findFirst({
      where: { youtubeVideoId: testVideoId }
    });
    expect(videoInDb).toBeNull();

    // 4. Select Editor in StringSelectMenu
    let editorSelectReply = null;
    const mockEditorSelectInteraction = {
      isButton: () => false,
      isChannelSelectMenu: () => false,
      isUserSelectMenu: () => false,
      isStringSelectMenu: () => true,
      customId: `vidreg_select_registered_editor:${draftId}`,
      user: { id: 'admin_reg_user' },
      memberPermissions: { has: () => true },
      values: [editor1.discordId],
      update: async (payload) => {
        editorSelectReply = payload;
        return payload;
      },
      reply: async (p) => p
    };

    await interactionEvent.run(null, mockEditorSelectInteraction);

    // Still NOT saved to database
    videoInDb = await prisma.videoRecord.findFirst({
      where: { youtubeVideoId: testVideoId }
    });
    expect(videoInDb).toBeNull();

    // 5. Click the Confirmation Button (vidreg_btn_confirm)
    let confirmReply = null;
    const mockConfirmInteraction = {
      isButton: () => true,
      isChannelSelectMenu: () => false,
      isUserSelectMenu: () => false,
      isStringSelectMenu: () => false,
      customId: `vidreg_btn_confirm:${draftId}`,
      user: { id: 'admin_reg_user' },
      memberPermissions: { has: () => true },
      update: async (payload) => {
        confirmReply = payload;
        return payload;
      },
      reply: async (p) => {
        confirmReply = p;
        return p;
      }
    };

    await interactionEvent.run(null, mockConfirmInteraction);

    expect(confirmReply).not.toBeNull();
    expect(confirmReply.embeds[0].data.title).toContain('Video Registrado Exitosamente');
    expect(confirmReply.components).toEqual([]);

    // 6. Now verify the record IS saved in SQLite with participants and editor
    videoInDb = await prisma.videoRecord.findFirst({
      where: { youtubeVideoId: testVideoId },
      include: { participants: true, editor: true }
    });

    expect(videoInDb).not.toBeNull();
    expect(videoInDb.editorId).toBe(editor1.discordId);
    expect(videoInDb.participants.length).toBe(2);
    const participantTalentIds = videoInDb.participants.map(p => p.talentId);
    expect(participantTalentIds).toContain(actor1.discordId);
    expect(participantTalentIds).toContain(actor2.discordId);
  });
});
