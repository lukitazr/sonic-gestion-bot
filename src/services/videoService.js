import { prisma } from '../database/prisma.js';
import { TalentService } from './talentService.js';
import { ConfigService } from './configService.js';
import { YouTubeService } from './youtubeService.js';
import { NotificationService } from './notificationService.js';

/**
 * Video Service
 * Handles video registration, participant relationship mapping, due date calculation,
 * embed history publishing, and participant notifications.
 */
export class VideoService {
  /**
   * Registers a new YouTube video for performance tracking and settlement calculation.
   *
   * @param {Object} params
   * @param {string} params.youtubeUrl - Full YouTube URL or 11-char video ID
   * @param {string} params.editorDiscordId - Mention or Discord Snowflake ID of the editor
   * @param {string[]|string} params.actorDiscordIds - Mention(s) or Discord Snowflake ID(s) of the actor(s)
   * @param {Object} [params.client] - Discord client instance for notifications
   * @param {string} [params.title] - Optional video title override
   * @param {Date|number} [params.registeredAt] - Optional registration timestamp override
   * @returns {Promise<import('@prisma/client').VideoRecord>}
   */
  static async registerVideo({
    youtubeUrl,
    editorDiscordId,
    actorDiscordIds = [],
    client = null,
    title = null,
    registeredAt = null
  }) {
    // 1. Extract and validate YouTube Video ID
    if (!youtubeUrl || typeof youtubeUrl !== 'string') {
      throw new Error('Debes proporcionar un enlace o ID válido de YouTube.');
    }

    const youtubeVideoId = YouTubeService.extractVideoId(youtubeUrl);
    if (!youtubeVideoId) {
      throw new Error(`El enlace o ID proporcionado ('${youtubeUrl}') no corresponde a un video válido de YouTube.`);
    }

    // 2. Normalize and validate Editor (Optional)
    let cleanEditorId = null;
    let editorTalent = null;
    if (editorDiscordId && typeof editorDiscordId === 'string') {
      const candidateId = editorDiscordId.replace(/^<@!?/, '').replace(/>$/, '').trim();
      if (candidateId) {
        editorTalent = await TalentService.getTalent(candidateId);
        if (!editorTalent) {
          throw new Error(`El editor <@${candidateId}> no está registrado en el sistema. Debe usar !registro primero.`);
        }
        cleanEditorId = candidateId;
      }
    }

    // 3. Normalize and validate Actors
    const rawActorIds = Array.isArray(actorDiscordIds)
      ? actorDiscordIds
      : [actorDiscordIds];

    const cleanActorIds = [];
    for (const raw of rawActorIds) {
      if (!raw || typeof raw !== 'string') continue;
      const clean = raw.replace(/^<@!?/, '').replace(/>$/, '').trim();
      if (clean && !cleanActorIds.includes(clean)) {
        cleanActorIds.push(clean);
      }
    }

    // Al menos debe haber un editor o al menos un actor
    if (!cleanEditorId && cleanActorIds.length === 0) {
      throw new Error('Debes especificar al menos a un participante (editor o actor) para registrar el video.');
    }

    let actorTalents = [];
    if (cleanActorIds.length > 0) {
      actorTalents = await TalentService.getTalents(cleanActorIds);
      const foundActorIds = new Set(actorTalents.map(t => t.discordId));
      const missingActorIds = cleanActorIds.filter(id => !foundActorIds.has(id));

      if (missingActorIds.length > 0) {
        const missingMentions = missingActorIds.map(id => `<@${id}>`).join(', ');
        throw new Error(`Los siguientes actores no están registrados: ${missingMentions}. Deben usar !registro primero.`);
      }
    }

    // 4. Query active system configuration for waitDays
    const config = await ConfigService.getConfig();
    const waitDays = Number.isInteger(config.waitDays) && config.waitDays > 0 ? config.waitDays : 5;

    // 5. Calculate scheduling dates
    const now = registeredAt ? new Date(registeredAt) : new Date();
    const scheduledCalculationAt = new Date(now.getTime() + (waitDays * 24 * 60 * 60 * 1000));

    // 6. Resolve video metadata / title
    let finalTitle = title;
    let youtubeDetails = null;
    try {
      youtubeDetails = await YouTubeService.getVideoDetails(youtubeVideoId);
      if (!finalTitle && youtubeDetails?.title) {
        finalTitle = youtubeDetails.title;
      }
    } catch {
      // Fallback title if offline/mock
    }

    if (!finalTitle) {
      finalTitle = `YouTube Video (${youtubeVideoId})`;
    }

    const canonicalUrl = `https://www.youtube.com/watch?v=${youtubeVideoId}`;

    // 7. Persist VideoRecord and VideoParticipant junction rows in SQLite
    const videoRecord = await prisma.videoRecord.create({
      data: {
        youtubeUrl: canonicalUrl,
        youtubeVideoId,
        videoTitle: finalTitle,
        editorId: cleanEditorId,
        registeredAt: now,
        scheduledCalculationAt,
        status: 'PENDING',
        participants: {
          create: cleanActorIds.map(actorId => ({
            talentId: actorId,
            role: 'ACTOR'
          }))
        }
      },
      include: {
        editor: true,
        participants: {
          include: {
            talent: true
          }
        }
      }
    });

    // 8. Dispatch History Embed & Participant DMs
    if (client) {
      const historyChannelId = config.historyChannelId || client.historyChannelId || process.env.HISTORY_CHANNEL_ID;
      if (historyChannelId) {
        const historyMessage = await NotificationService.sendHistoryEmbed(
          client,
          historyChannelId,
          {
            videoRecord,
            editor: editorTalent,
            actors: actorTalents,
            youtubeDetails: youtubeDetails || { title: finalTitle, thumbnailUrl: YouTubeService.getThumbnailUrl(youtubeVideoId) },
            config
          }
        );

        if (historyMessage?.id) {
          await prisma.videoRecord.update({
            where: { id: videoRecord.id },
            data: { historyMessageId: historyMessage.id }
          }).catch(err => console.warn('[VideoService] No se pudo guardar historyMessageId:', err));
        }
      }

      // Safe DM dispatching to editor and actors
      await NotificationService.sendRegistrationDMs(client, {
        videoRecord,
        editor: editorTalent,
        actors: actorTalents,
        scheduledDate: scheduledCalculationAt,
        waitDays
      }).catch(err => console.warn('[VideoService] Error en envío de DMs:', err));
    }

    return videoRecord;
  }

  /**
   * Retrieves all videos currently in PENDING status, ordered by scheduled calculation date.
   * @returns {Promise<Array<import('@prisma/client').VideoRecord>>}
   */
  static async getPendingVideos() {
    return await prisma.videoRecord.findMany({
      where: {
        status: 'PENDING'
      },
      orderBy: {
        scheduledCalculationAt: 'asc'
      },
      include: {
        editor: true,
        participants: {
          include: {
            talent: true
          }
        }
      }
    });
  }

  /**
   * Retrieves a single video record by internal UUID or YouTube Video ID.
   * @param {string} idOrVideoId
   * @returns {Promise<import('@prisma/client').VideoRecord | null>}
   */
  static async getVideoById(idOrVideoId) {
    if (!idOrVideoId || typeof idOrVideoId !== 'string') return null;
    const cleanId = idOrVideoId.trim();

    return await prisma.videoRecord.findFirst({
      where: {
        OR: [
          { id: cleanId },
          { youtubeVideoId: cleanId }
        ]
      },
      include: {
        editor: true,
        participants: {
          include: {
            talent: true
          }
        }
      }
    });
  }

  /**
   * Retrieves all video records with optional status filter.
   * @param {Object} [options]
   * @param {string} [options.status] - 'PENDING' | 'CALCULATED' | 'PAID'
   * @param {number} [options.limit=50]
   * @param {number} [options.offset=0]
   * @returns {Promise<Array<import('@prisma/client').VideoRecord>>}
   */
  static async getAllVideos({ status, limit = 50, offset = 0 } = {}) {
    const where = {};
    if (status && typeof status === 'string') {
      where.status = status.toUpperCase();
    }

    return await prisma.videoRecord.findMany({
      where,
      take: limit,
      skip: offset,
      orderBy: {
        registeredAt: 'desc'
      },
      include: {
        editor: true,
        participants: {
          include: {
            talent: true
          }
        }
      }
    });
  }

  /**
   * Marks a CALCULATED video record as PAID.
   * @param {string} idOrVideoId - UUID or YouTube Video ID
   * @returns {Promise<import('@prisma/client').VideoRecord>}
   */
  static async markVideoAsPaid(idOrVideoId) {
    if (!idOrVideoId || typeof idOrVideoId !== 'string') {
      throw new Error('Debe proporcionar un ID interno o ID de YouTube válido.');
    }

    const video = await this.getVideoById(idOrVideoId);
    if (!video) {
      throw new Error(`No se encontró ningún video con el identificador '${idOrVideoId}'.`);
    }

    if (video.status === 'PENDING') {
      throw new Error(`El video '${video.videoTitle || video.youtubeVideoId}' aún no ha sido calculado (Estado: PENDING). Debe liquidarse primero.`);
    }

    if (video.status === 'PAID') {
      return video;
    }

    return await prisma.videoRecord.update({
      where: { id: video.id },
      data: { status: 'PAID' },
      include: {
        editor: true,
        participants: {
          include: {
            talent: true
          }
        }
      }
    });
  }

  /**
   * Deletes a video record and its associated participant records (cascade).
   * @param {string} idOrVideoId
   * @returns {Promise<import('@prisma/client').VideoRecord | null>}
   */
  static async deleteVideo(idOrVideoId) {
    if (!idOrVideoId || typeof idOrVideoId !== 'string') return null;
    const existing = await this.getVideoById(idOrVideoId);
    if (!existing) return null;

    return await prisma.videoRecord.delete({
      where: { id: existing.id }
    });
  }
}

export default VideoService;
