import { ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder } from 'discord.js';
import { prisma } from '../database/prisma.js';
import { ConfigService } from './configService.js';
import { SchedulerService } from './schedulerService.js';
import { YouTubeService } from './youtubeService.js';
import { PayoutService } from './payoutService.js';
import { EMBED_COLORS, DEFAULT_CONFIG } from '../config/constants.js';
import { generatePaypalPaymentLink, generateBinancePaymentLink } from '../utils/validators.js';

export const DAYS_OF_WEEK = [
  'Domingo',
  'Lunes',
  'Martes',
  'Miércoles',
  'Jueves',
  'Viernes',
  'Sábado'
];

/**
 * Parses day of week input string or integer into 0-6 (0 = Domingo).
 * @param {string|number} input
 * @returns {number|null}
 */
export function parseDayOfWeek(input) {
  if (input === undefined || input === null) return null;
  if (typeof input === 'number' && Number.isInteger(input) && input >= 0 && input <= 6) {
    return input;
  }
  const str = String(input).trim().toLowerCase();
  if (/^[0-6]$/.test(str)) return Number(str);
  if (str.startsWith('dom')) return 0;
  if (str.startsWith('lun')) return 1;
  if (str.startsWith('mar')) return 2;
  if (str.startsWith('mie') || str.startsWith('mié')) return 3;
  if (str.startsWith('jue')) return 4;
  if (str.startsWith('vie')) return 5;
  if (str.startsWith('sab') || str.startsWith('sáb')) return 6;
  return null;
}

/**
 * Weekly Summary Service
 * Compiles weekly calculated video settlements, forces same-day mature calculations,
 * and builds paginated Discord embeds with direct payment links and @everyone mentions.
 */
export class WeeklySummaryService {
  /**
   * Evaluates and settles all pending videos whose scheduled calculation date falls on the SAME calendar day
   * as the reference date (i.e. scheduledCalculationAt <= end of reference day).
   * 
   * Pending videos maturing on subsequent days (> endOfDay) remain strictly in PENDING state.
   *
   * @param {Object} [client=null] - Optional Discord Client
   * @param {Date} [referenceDate=new Date()] - Reference date (typically current date/time)
   * @returns {Promise<Array<Object>>} List of settled videos
   */
  static async settleSameDayPendingVideos(client = null, referenceDate = new Date()) {
    const refDate = referenceDate instanceof Date ? referenceDate : new Date(referenceDate);
    const endOfDay = new Date(refDate);
    endOfDay.setHours(23, 59, 59, 999);

    const sameDayPending = await prisma.videoRecord.findMany({
      where: {
        status: 'PENDING',
        scheduledCalculationAt: {
          lte: endOfDay
        }
      },
      include: {
        editor: true,
        participants: {
          include: {
            talent: true
          }
        }
      },
      orderBy: {
        scheduledCalculationAt: 'asc'
      }
    });

    const settledResults = [];

    for (const video of sameDayPending) {
      try {
        const result = await SchedulerService.settleVideo(video.id, client);
        settledResults.push(result);
      } catch (err) {
        console.warn(`[WeeklySummaryService] No se pudo pre-liquidar el video ${video.id} del mismo día:`, err.message || err);
      }
    }

    return settledResults;
  }

  /**
   * Fetches all videos calculated within the weekly window (by default past 7 days up to end of reference day).
   *
   * @param {Date} [referenceDate=new Date()] - Reference date
   * @param {number} [daysLookback=7] - Number of days to include in the weekly report
   * @returns {Promise<Array<Object>>}
   */
  static async getWeeklyCalculatedVideos(referenceDate = new Date(), daysLookback = 7) {
    const refDate = referenceDate instanceof Date ? referenceDate : new Date(referenceDate);
    const endOfDay = new Date(refDate);
    endOfDay.setHours(23, 59, 59, 999);

    const windowStart = new Date(refDate.getTime() - daysLookback * 24 * 60 * 60 * 1000);
    windowStart.setHours(0, 0, 0, 0);

    return await prisma.videoRecord.findMany({
      where: {
        status: { in: ['CALCULATED', 'PAID'] },
        calculatedAt: {
          gte: windowStart,
          lte: endOfDay
        }
      },
      include: {
        editor: true,
        participants: {
          include: {
            talent: true
          }
        }
      },
      orderBy: {
        calculatedAt: 'desc'
      }
    });
  }

  /**
   * Builds a single page embed for the paginated weekly summary.
   *
   * @param {Object} params
   * @param {Array<Object>} params.videos - Full list of calculated videos in the weekly window
   * @param {number} [params.page=1] - 1-based current page index
   * @param {Object} [params.config=DEFAULT_CONFIG] - System configuration
   * @returns {EmbedBuilder}
   */
  static buildWeeklySummaryPage({ videos = [], page = 1, config = DEFAULT_CONFIG }) {
    const currency = config?.currency || DEFAULT_CONFIG.currency || 'MXN';
    const totalVideos = videos.length;
    const totalPages = Math.max(1, totalVideos);
    const safePage = Math.min(Math.max(1, page), totalPages);

    // Calculate weekly aggregate totals across all videos
    const totalWeekPayout = videos.reduce((acc, v) => acc + (v.totalAmount || 0), 0);
    const totalWeekViews = videos.reduce((acc, v) => acc + (v.finalViews || 0), 0);

    const embed = new EmbedBuilder()
      .setTitle('📊 Resumen Semanal de Liquidaciones & Pagos')
      .setColor(EMBED_COLORS.GOLD)
      .setFooter({
        text: `Sonic Gestión • Página ${safePage} de ${totalPages} • Total Acumulado: $${totalWeekPayout.toFixed(2)} ${currency}`
      })
      .setTimestamp();

    if (totalVideos === 0) {
      embed.setDescription(
        '🗓️ **No se registraron liquidaciones en el periodo semanal actual.**\n\n' +
        'Todos los videos pendientes aún no han cumplido sus días de espera configurados o ya han sido archivados.'
      );
      embed.addFields(
        {
          name: '📈 Métricas Generales',
          value: `• **Videos Calculados:** 0\n• **Vistas Totales:** 0\n• **Monto Total:** $0.00 ${currency}`,
          inline: false
        }
      );
      return embed;
    }

    const video = videos[safePage - 1];
    const videoId = video?.youtubeVideoId || YouTubeService.extractVideoId(video?.youtubeUrl) || 'N/A';
    const videoUrl = video?.youtubeUrl || (videoId !== 'N/A' ? `https://youtu.be/${videoId}` : 'N/A');
    const thumbnailUrl = videoId !== 'N/A' ? YouTubeService.getThumbnailUrl(videoId) : null;
    const isPaid = video?.status === 'PAID';
    const statusBadge = isPaid ? '`💰 PAGADO`' : '`📝 CALCULADO`';

    // Summary banner field
    embed.setDescription(
      `📢 **Desglose Semanal Oficial de Videos y Pagos**\n` +
      `💰 **Total Semana:** \`$${totalWeekPayout.toFixed(2)} ${currency}\`  |  👁️ **Vistas Semana:** \`${totalWeekViews.toLocaleString()}\`  |  🎬 **Videos:** \`${totalVideos}\`\n\n` +
      `Mostrando video **${safePage} de ${totalVideos}**:`
    );

    if (thumbnailUrl) {
      embed.setThumbnail(thumbnailUrl);
    }

    // Video details field
    const calcDateUnix = video.calculatedAt ? Math.floor(new Date(video.calculatedAt).getTime() / 1000) : null;
    const calcText = calcDateUnix ? `<t:${calcDateUnix}:F> (<t:${calcDateUnix}:R>)` : 'Reciente';

    embed.addFields(
      {
        name: `📺 Video [${safePage}/${totalVideos}]: ${video.videoTitle || `Video ${videoId}`}`,
        value: `🔗 **Enlace:** [Ver en YouTube](${videoUrl})\n` +
               `👁️ **Vistas Finales:** \`${(video.finalViews || 0).toLocaleString()}\`\n` +
               `💵 **Monto Total Video:** \`$${(video.totalAmount || 0).toFixed(2)} ${currency}\`\n` +
               `📌 **Estado:** ${statusBadge}\n` +
               `⏱️ **Fecha de Cálculo:** ${calcText}`,
        inline: false
      }
    );

    // Build Monospace Payment Methods block
    let paymentCodeBlock = '```\n=== MÉTODOS DE PAGO ===\n';
    if (video.editor) {
      const edId = video.editor.discordId || video.editorId || 'N/A';
      paymentCodeBlock += `[EDITOR] ${edId}:\n  PayPal: ${video.editor.paypal || 'N/A'}\n  Binance: ${video.editor.binance || 'N/A'}\n\n`;
    }

    if (Array.isArray(video.participants) && video.participants.length > 0) {
      for (const p of video.participants) {
        const talent = p.talent || {};
        const actId = talent.discordId || p.talentId || 'N/A';
        paymentCodeBlock += `[ACTOR] ${actId}:\n  PayPal: ${talent.paypal || 'N/A'}\n  Binance: ${talent.binance || 'N/A'}\n  Monto: $${(p.totalAmount ?? 0).toFixed(2)} ${currency}\n\n`;
      }
    }
    paymentCodeBlock += `TOTAL: $${(video.totalAmount || 0).toFixed(2)} ${currency}\n\`\`\``;

    embed.addFields({
      name: '📋 Datos para Transferencia (Copiar y Pegar)',
      value: paymentCodeBlock,
      inline: false
    });

    // Build Direct Checkout Links
    const checkoutLinks = [];
    if (video.editor) {
      const edId = video.editor.discordId || video.editorId;
      // Editor amount is totalAmount minus participants or calculate from participants
      const participantsSum = (video.participants || []).reduce((acc, p) => acc + (p.totalAmount || 0), 0);
      const editorTotal = Math.max(0, (video.totalAmount || 0) - participantsSum);

      const editorPpLink = generatePaypalPaymentLink(video.editor.paypal, editorTotal, currency);
      const editorBnbLink = generateBinancePaymentLink(video.editor.binance, editorTotal, currency);

      const parts = [];
      if (editorPpLink) parts.push(`[🔗 PayPal ($${editorTotal.toFixed(2)} ${currency})](${editorPpLink})`);
      if (editorBnbLink) parts.push(`[⚡ Binance Pay](${editorBnbLink})`);

      checkoutLinks.push(`**🎬 Editor (<@${edId}>):**\n${parts.length > 0 ? parts.join(' • ') : '*Sin enlaces directos*'}`);
    }

    if (Array.isArray(video.participants) && video.participants.length > 0) {
      for (const p of video.participants) {
        const talent = p.talent || {};
        const actId = talent.discordId || p.talentId;
        const actTotal = p.totalAmount || 0;

        const actPpLink = generatePaypalPaymentLink(talent.paypal, actTotal, currency);
        const actBnbLink = generateBinancePaymentLink(talent.binance, actTotal, currency);

        const parts = [];
        if (actPpLink) parts.push(`[🔗 PayPal ($${actTotal.toFixed(2)} ${currency})](${actPpLink})`);
        if (actBnbLink) parts.push(`[⚡ Binance Pay](${actBnbLink})`);

        checkoutLinks.push(`**🎭 Actor (<@${actId}>):**\n${parts.length > 0 ? parts.join(' • ') : '*Sin enlaces directos*'}`);
      }
    }

    if (checkoutLinks.length > 0) {
      embed.addFields({
        name: '💳 Enlaces de Pago Rápido',
        value: checkoutLinks.join('\n\n'),
        inline: false
      });
    }

    return embed;
  }

  /**
   * Builds the pagination component ActionRow.
   *
   * @param {number} currentPage - 1-indexed current page
   * @param {number} totalPages - Total pages
   * @returns {Array<ActionRowBuilder>}
   */
  static buildWeeklySummaryComponents(currentPage = 1, totalPages = 1) {
    const prevPage = Math.max(1, currentPage - 1);
    const nextPage = Math.min(totalPages, currentPage + 1);

    const prevBtn = new ButtonBuilder()
      .setCustomId(`summary_page:prev:${prevPage}`)
      .setLabel('⬅️ Anterior')
      .setStyle(ButtonStyle.Primary)
      .setDisabled(currentPage <= 1);

    const pageIndicator = new ButtonBuilder()
      .setCustomId(`summary_page:info:${currentPage}`)
      .setLabel(`Página ${currentPage} / ${totalPages}`)
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(true);

    const nextBtn = new ButtonBuilder()
      .setCustomId(`summary_page:next:${nextPage}`)
      .setLabel('Siguiente ➡️')
      .setStyle(ButtonStyle.Primary)
      .setDisabled(currentPage >= totalPages);

    const row = new ActionRowBuilder().addComponents(prevBtn, pageIndicator, nextBtn);
    return [row];
  }

  /**
   * Dispatches the paginated weekly summary directly to a specific user's Direct Message (DM).
   * OPTIONAL feature that can be enabled globally or invoked on demand.
   *
   * @param {Object} client - Discord Client
   * @param {string} userId - Target Discord User Snowflake ID
   * @param {Object} [options={}]
   * @param {Date} [options.referenceDate=new Date()]
   * @param {Array<Object>} [options.videos=null]
   * @param {Object} [options.config=null]
   * @returns {Promise<{ success: boolean, messageId?: string, error?: string, user?: Object }>}
   */
  static async sendWeeklySummaryDM(client, userId, options = {}) {
    if (!client || !userId) {
      return { success: false, error: 'Cliente o ID de usuario no proporcionado.' };
    }

    try {
      const cleanUserId = String(userId).replace(/^<@!?/, '').replace(/>$/, '').trim();
      let targetUser = null;

      if (client.users?.cache?.has(cleanUserId)) {
        targetUser = client.users.cache.get(cleanUserId);
      } else if (typeof client.users?.fetch === 'function') {
        targetUser = await client.users.fetch(cleanUserId).catch(() => null);
      }

      if (!targetUser || typeof targetUser.send !== 'function') {
        return { success: false, error: `No se pudo encontrar al usuario con ID ${cleanUserId}` };
      }

      const referenceDate = options.referenceDate || new Date();
      const config = options.config || await ConfigService.getConfig();
      const videos = options.videos || await this.getWeeklyCalculatedVideos(referenceDate);

      const totalPages = Math.max(1, videos.length);
      const pageEmbed = this.buildWeeklySummaryPage({
        videos,
        page: 1,
        config
      });
      const components = this.buildWeeklySummaryComponents(1, totalPages);

      const sentDM = await targetUser.send({
        content: '📩 **[Resumen Semanal de Liquidaciones]** Aquí tienes el reporte semanal oficial y los datos de pago:',
        embeds: [pageEmbed],
        components
      });

      return {
        success: true,
        messageId: sentDM?.id,
        user: targetUser
      };
    } catch (err) {
      console.warn(`[WeeklySummaryService] Error enviando DM de resumen a ${userId}:`, err.message || err);
      return {
        success: false,
        error: err.code === 50007 ? 'El usuario tiene los mensajes directos cerrados.' : err.message
      };
    }
  }

  /**
   * Executes the weekly summary workflow:
   * 1. Forces same-day pending video calculation (if any mature on the reference calendar day).
   * 2. Excludes pending videos maturing in future days.
   * 3. Gathers all weekly calculated videos.
   * 4. Dispatches the paginated embed with @everyone mention to the target channel.
   * 5. Optionally dispatches summary directly to configured user DM (if enabled).
   * 6. Updates lastWeeklySummaryAt timestamp in Config.
   *
   * @param {Object} client - Discord Client
   * @param {Object} [options={}]
   * @param {boolean} [options.force=false] - Force execution regardless of enabled flag
   * @param {string} [options.targetChannelId=null] - Explicit destination channel ID
   * @param {boolean} [options.pingEveryone=true] - Whether to ping @everyone in message content
   * @param {Date} [options.referenceDate=new Date()] - Reference date
   * @param {string} [options.targetDmUserId=null] - Optional specific user ID for DM dispatch
   * @param {boolean} [options.sendDm=true] - Whether to send optional DM if configured
   * @returns {Promise<{ success: boolean, messageId?: string, totalVideos: number, totalPayout: number, totalViews: number, dmResult?: Object, reason?: string }>}
   */
  static async executeWeeklySummary(client, options = {}) {
    const {
      force = false,
      targetChannelId = null,
      pingEveryone = true,
      referenceDate = new Date(),
      targetDmUserId = null,
      sendDm = true
    } = options;

    const config = await ConfigService.getConfig();

    if (!force && !config.weeklySummaryEnabled) {
      return {
        success: false,
        totalVideos: 0,
        totalPayout: 0,
        totalViews: 0,
        reason: 'El resumen semanal está desactivado en la configuración.'
      };
    }

    // Step 1: Pre-calculate any videos that are scheduled to mature on the SAME calendar day
    await this.settleSameDayPendingVideos(client, referenceDate);

    // Step 2: Fetch all calculated videos in the weekly window (excludes pending videos maturing tomorrow or beyond)
    const videos = await this.getWeeklyCalculatedVideos(referenceDate);

    const totalVideos = videos.length;
    const totalPayout = videos.reduce((acc, v) => acc + (v.totalAmount || 0), 0);
    const totalViews = videos.reduce((acc, v) => acc + (v.finalViews || 0), 0);

    // Step 3: Identify target channel
    const channelId = targetChannelId ||
                      config.weeklySummaryChannelId ||
                      config.adminChannelId ||
                      process.env.WEEKLY_SUMMARY_CHANNEL_ID ||
                      process.env.ADMIN_CHANNEL_ID;

    if (!channelId) {
      console.warn('[WeeklySummaryService] No hay un canal configurado para enviar el resumen semanal.');
      return {
        success: false,
        totalVideos,
        totalPayout,
        totalViews,
        reason: 'No hay canal de resumen semanal ni de administración configurado.'
      };
    }

    // Step 4: Resolve Discord channel
    let channel = null;
    if (client) {
      if (client.channels?.cache?.has(channelId)) {
        channel = client.channels.cache.get(channelId);
      } else if (typeof client.channels?.fetch === 'function') {
        channel = await client.channels.fetch(channelId).catch(() => null);
      } else if (typeof client.getChannel === 'function') {
        channel = client.getChannel(channelId);
      }
    }

    if (!channel || typeof channel.send !== 'function') {
      console.warn(`[WeeklySummaryService] No se pudo resolver el canal con ID ${channelId}`);
      return {
        success: false,
        totalVideos,
        totalPayout,
        totalViews,
        reason: `No se pudo encontrar el canal con ID ${channelId}`
      };
    }

    // Step 5: Render initial page (Page 1)
    const totalPages = Math.max(1, totalVideos);
    const pageEmbed = this.buildWeeklySummaryPage({
      videos,
      page: 1,
      config
    });
    const components = this.buildWeeklySummaryComponents(1, totalPages);

    // Step 6: Dispatch with @everyone mention
    const messagePayload = {
      embeds: [pageEmbed],
      components
    };

    if (pingEveryone) {
      messagePayload.content = '@everyone 📢 **¡Atención! Aquí está el Resumen Semanal de Liquidaciones & Pagos:**';
      messagePayload.allowedMentions = { parse: ['everyone'] };
    }

    const sentMessage = await channel.send(messagePayload);

    // Step 7: Optional DM Delivery (feature opcional a un usuario configurable)
    let dmResult = null;
    const resolvedDmUserId = targetDmUserId || (config.weeklySummaryDmEnabled ? config.weeklySummaryDmUserId : null);
    if (resolvedDmUserId && client && sendDm !== false) {
      dmResult = await this.sendWeeklySummaryDM(client, resolvedDmUserId, {
        referenceDate,
        videos,
        config
      });
    }

    // Step 8: Record execution timestamp in SQLite
    const executionTimestamp = referenceDate instanceof Date ? referenceDate : new Date();
    await prisma.config.update({
      where: { id: 1 },
      data: {
        lastWeeklySummaryAt: executionTimestamp
      }
    }).catch(err => console.warn('[WeeklySummaryService] Error guardando lastWeeklySummaryAt:', err));

    await ConfigService.init();

    return {
      success: true,
      messageId: sentMessage?.id,
      totalVideos,
      totalPayout,
      totalViews,
      dmResult
    };
  }
}

export default WeeklySummaryService;
