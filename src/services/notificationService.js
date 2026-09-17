import { ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder } from 'discord.js';
import { EMBED_COLORS, DEFAULT_CONFIG } from '../config/constants.js';
import { YouTubeService } from './youtubeService.js';
import { PayoutService } from './payoutService.js';
import { generatePaypalPaymentLink, generateBinancePaymentLink } from '../utils/validators.js';

/**
 * Notification Service
 * Manages rich embed creation and safe DM dispatching across the system.
 */
export class NotificationService {
  /**
   * Builds the rich embed posted to HISTORY_CHANNEL_ID upon video registration.
   *
   * @param {Object} params
   * @param {Object} params.videoRecord - Database VideoRecord
   * @param {Object} params.editor - Editor Talent record or { discordId }
   * @param {Array<Object>} params.actors - List of Actor Talent records or [{ discordId }]
   * @param {Object} [params.youtubeDetails] - Metadata { title, thumbnailUrl, viewCount }
   * @param {Object} [params.config] - Current Config { currency, waitDays }
   * @returns {EmbedBuilder}
   */
  static buildHistoryEmbed({ videoRecord, editor, actors = [], youtubeDetails, config }) {
    const videoId = videoRecord?.youtubeVideoId || videoRecord?.videoId || YouTubeService.extractVideoId(videoRecord?.youtubeUrl) || 'video';
    const title = youtubeDetails?.title || videoRecord?.videoTitle || videoRecord?.title || `YouTube Video (${videoId})`;
    const videoUrl = videoRecord?.youtubeUrl || `https://www.youtube.com/watch?v=${videoId}`;
    const thumbnailUrl = youtubeDetails?.thumbnailUrl || YouTubeService.getThumbnailUrl(videoId);
    const scheduledDate = videoRecord?.scheduledCalculationAt || videoRecord?.scheduledDate || new Date();
    const scheduledUnix = Math.floor(new Date(scheduledDate).getTime() / 1000);
    const registeredDate = videoRecord?.registeredAt || videoRecord?.createdAt || new Date();
    const registeredUnix = Math.floor(new Date(registeredDate).getTime() / 1000);

    const editorId = editor?.discordId || editor?.talentId || editor?.id || (typeof editor === 'string' && editor !== 'N/A' ? editor : null);
    const editorDisplay = editorId ? `<@${editorId}>` : '*Ninguno / No asignado*';
    const actorsDisplay = actors && actors.length > 0
      ? actors.map(a => `<@${a.discordId || a.talentId || a.id || a}>`).join(', ')
      : '*Sin actores especificados*';

    const embed = new EmbedBuilder()
      .setTitle('🎬 Nuevo Video Registrado para Seguimiento')
      .setURL(videoUrl)
      .setColor(EMBED_COLORS.PRIMARY)
      .setThumbnail(thumbnailUrl)
      .addFields(
        {
          name: '📺 Video',
          value: `[${title}](${videoUrl})`,
          inline: false
        },
        {
          name: '✂️ Editor',
          value: editorDisplay,
          inline: true
        },
        {
          name: '🎭 Actores Participantes',
          value: actorsDisplay,
          inline: true
        },
        {
          name: '📅 Fecha de Registro',
          value: `<t:${registeredUnix}:F> (<t:${registeredUnix}:R>)`,
          inline: false
        },
        {
          name: '⏳ Fecha Programada de Liquidación',
          value: `<t:${scheduledUnix}:F> (<t:${scheduledUnix}:R>)`,
          inline: false
        },
        {
          name: '📊 Estado Actual',
          value: '`⏳ PENDIENTE` *(Esperando cumplimiento de plazo)*',
          inline: false
        }
      )
      .setFooter({ text: 'Sonic Gestión Bot • Historial Oficial' })
      .setTimestamp();

    return embed;
  }

  /**
   * Dispatches the history embed to the specified history channel.
   *
   * @param {Object} client - Discord Client
   * @param {string} channelId - History Channel Snowflake ID
   * @param {Object} payload - { videoRecord, editor, actors, youtubeDetails, config }
   * @returns {Promise<Object | null>} - Sent message or null
   */
  static async sendHistoryEmbed(client, channelId, payload) {
    if (!client || !channelId) return null;

    try {
      let channel = null;

      if (client.channels?.cache?.has(channelId)) {
        channel = client.channels.cache.get(channelId);
      } else if (typeof client.channels?.fetch === 'function') {
        channel = await client.channels.fetch(channelId).catch(() => null);
      } else if (typeof client.getChannel === 'function') {
        channel = client.getChannel(channelId);
      }

      if (!channel || typeof channel.send !== 'function') {
        console.warn(`[NotificationService] No se pudo encontrar el canal de historial con ID: ${channelId}`);
        return null;
      }

      const embed = this.buildHistoryEmbed(payload);
      return await channel.send({ embeds: [embed] });
    } catch (error) {
      console.error(`[NotificationService] Error enviando ficha al canal de historial (${channelId}):`, error);
      return null;
    }
  }

  /**
   * Builds the private registration DM embed sent to an assigned participant.
   *
   * @param {Object} params
   * @param {Object} params.videoRecord - Database video record
   * @param {'EDITOR'|'ACTOR'} params.role
   * @param {Date|number} params.scheduledDate
   * @param {number} [params.waitDays=5]
   * @returns {EmbedBuilder}
   */
  static buildRegistrationDMEmbed({ videoRecord, role, scheduledDate, waitDays = 5 }) {
    const videoId = videoRecord?.youtubeVideoId || videoRecord?.videoId || YouTubeService.extractVideoId(videoRecord?.youtubeUrl) || 'video';
    const title = videoRecord?.videoTitle || videoRecord?.title || `YouTube Video (${videoId})`;
    const videoUrl = videoRecord?.youtubeUrl || `https://www.youtube.com/watch?v=${videoId}`;
    const thumbnailUrl = YouTubeService.getThumbnailUrl(videoId);
    const scheduledUnix = Math.floor(new Date(scheduledDate).getTime() / 1000);
    const roleLabel = role === 'EDITOR' ? '🎬 Editor' : '🎭 Actor';

    return new EmbedBuilder()
      .setTitle('🎬 Video Registrado en Sonic Gestión')
      .setURL(videoUrl)
      .setColor(EMBED_COLORS.SUCCESS)
      .setThumbnail(thumbnailUrl)
      .setDescription(
        `¡Hola! Has sido asignado como **${roleLabel}** en un nuevo video registrado en el sistema.`
      )
      .addFields(
        {
          name: '📺 Video Asignado',
          value: `[${title}](${videoUrl})`,
          inline: false
        },
        {
          name: '🎭 Tu Rol Asignado',
          value: `**${roleLabel}**`,
          inline: true
        },
        {
          name: '⏳ Liquidación Programada',
          value: `<t:${scheduledUnix}:F> (<t:${scheduledUnix}:R>)`,
          inline: true
        },
        {
          name: 'ℹ️ Información',
          value: `Tu pago se calculará automáticamente transcurrido el periodo de **${waitDays} días** consultando las vistas del video en YouTube.`,
          inline: false
        }
      )
      .setFooter({ text: 'Sonic Gestión Bot • Notificaciones Privadas' })
      .setTimestamp();
  }

  /**
   * Dispatches direct messages to participants (editor and actors) upon registration.
   *
   * @param {Object} client - Discord client
   * @param {Object} params
   * @param {Object} params.videoRecord
   * @param {Object} [params.editor]
   * @param {Array<Object>} [params.actors=[]]
   * @param {Date|number} params.scheduledDate
   * @param {number} [params.waitDays=5]
   * @returns {Promise<{ sent: string[], failed: string[] }>}
   */
  static async sendRegistrationDMs(client, { videoRecord, editor, actors = [], scheduledDate, waitDays = 5 }) {
    const results = { sent: [], failed: [] };
    if (!client) return results;

    const targetDate = scheduledDate || videoRecord?.scheduledCalculationAt || new Date();
    const recipients = [];

    const editorId = editor?.discordId || editor?.talentId || editor?.id || (typeof editor === 'string' && editor !== 'N/A' ? editor : null);
    if (editorId) {
      recipients.push({ discordId: editorId, role: 'EDITOR' });
    }

    if (Array.isArray(actors)) {
      for (const actor of actors) {
        const actorId = actor.discordId || actor.talentId || actor.id || actor;
        if (actorId && !recipients.some(r => r.discordId === actorId)) {
          recipients.push({ discordId: actorId, role: 'ACTOR' });
        }
      }
    }

    for (const recipient of recipients) {
      try {
        let user = null;

        if (client.users?.cache?.has(recipient.discordId)) {
          user = client.users.cache.get(recipient.discordId);
        } else if (typeof client.users?.fetch === 'function') {
          user = await client.users.fetch(recipient.discordId).catch(() => null);
        } else if (typeof client.getUser === 'function') {
          user = client.getUser(recipient.discordId);
        }

        if (!user || typeof user.send !== 'function') {
          results.failed.push(recipient.discordId);
          continue;
        }

        const embed = this.buildRegistrationDMEmbed({
          videoRecord,
          role: recipient.role,
          scheduledDate: targetDate,
          waitDays
        });

        await user.send({ embeds: [embed] });
        results.sent.push(recipient.discordId);
      } catch (err) {
        if (err.code === 50007 || err.message?.includes('Cannot send messages')) {
          console.warn(`[NotificationService] El usuario <@${recipient.discordId}> tiene los DMs cerrados. Notificación omitida.`);
        } else {
          console.warn(`[NotificationService] No se pudo enviar DM a <@${recipient.discordId}>:`, err.message || err);
        }
        results.failed.push(recipient.discordId);
      }
    }

    return results;
  }

  /**
   * Constructs the administrative payment order embed dispatched to ADMIN_CHANNEL_ID.
   *
   * @param {Object} settlement
   * @param {number} settlement.views - Reached YouTube view count
   * @param {Object} settlement.config - System configuration
   * @param {Object} [settlement.editor] - { talent, payout }
   * @param {Array<Object>} settlement.actors - [{ talent, payout }]
   * @param {number} settlement.totalPayout - Grand total payout
   * @param {Object} [settlement.videoRecord] - Video record
   * @returns {EmbedBuilder}
   */
  static buildAdminPaymentOrder(settlement) {
    const { views = 0, config = DEFAULT_CONFIG, editor, actors = [], totalPayout = 0, videoRecord } = settlement;
    const currency = config?.currency || DEFAULT_CONFIG.currency || 'MXN';

    const videoId = videoRecord?.youtubeVideoId || videoRecord?.videoId || YouTubeService.extractVideoId(videoRecord?.youtubeUrl) || 'N/A';
    const title = videoRecord?.videoTitle || videoRecord?.title || `Video ${videoId}`;
    const videoUrl = videoRecord?.youtubeUrl || (videoId !== 'N/A' ? `https://youtu.be/${videoId}` : 'N/A');
    const thumbnailUrl = videoId !== 'N/A' ? YouTubeService.getThumbnailUrl(videoId) : null;

    // Format 1-click copy-pastable monospace payment blocks
    const hasEditor = Boolean(editor && (editor.talent || editor.discordId || editor.id));
    const editorTalent = hasEditor ? (editor.talent || editor) : null;
    const editorPayout = hasEditor ? (editor.payout || { base: 0, totalBonus: 0, total: 0 }) : null;
    const editorDiscordId = editorTalent ? (editorTalent.discordId || editorTalent.id || 'N/A') : null;

    let paymentCodeBlock = '```\n=== MÉTODOS DE PAGO ===\n';
    if (hasEditor && editorDiscordId) {
      paymentCodeBlock += `[EDITOR] ${editorDiscordId}:\n  PayPal: ${editorTalent.paypal || 'N/A'}\n  Binance: ${editorTalent.binance || 'N/A'}\n  Monto: $${editorPayout.total} ${currency}\n\n`;
    }

    if (Array.isArray(actors)) {
      for (const a of actors) {
        const actorTalent = a?.talent || a || {};
        const actorPayout = a?.payout || { base: 0, totalBonus: 0, total: 0 };
        const actorDiscordId = actorTalent.discordId || actorTalent.id || 'N/A';

        paymentCodeBlock += `[ACTOR] ${actorDiscordId}:\n  PayPal: ${actorTalent.paypal || 'N/A'}\n  Binance: ${actorTalent.binance || 'N/A'}\n  Monto: $${actorPayout.total} ${currency}\n\n`;
      }
    }

    paymentCodeBlock += `TOTAL GENERAL: $${totalPayout} ${currency}\n\`\`\``;

    // Generate Direct Checkout Quick Links
    const checkoutLinks = [];

    // Editor checkout links
    if (hasEditor && editorDiscordId) {
      const editorPpLink = generatePaypalPaymentLink(editorTalent.paypal, editorPayout.total, currency);
      const editorBnbLink = generateBinancePaymentLink(editorTalent.binance, editorPayout.total, currency);

      const editorLinkParts = [];
      if (editorPpLink) editorLinkParts.push(`[🔗 Pagar en PayPal ($${editorPayout.total} ${currency})](${editorPpLink})`);
      if (editorBnbLink) editorLinkParts.push(`[⚡ Pagar en Binance Pay](${editorBnbLink})`);

      checkoutLinks.push(`**🎬 Editor (<@${editorDiscordId}>):**\n${editorLinkParts.length > 0 ? editorLinkParts.join(' • ') : '*Sin links de pago directos disponibles*'}`);
    }

    // Actors checkout links
    if (Array.isArray(actors) && actors.length > 0) {
      for (const a of actors) {
        const actorTalent = a?.talent || a || {};
        const actorPayout = a?.payout || { base: 0, totalBonus: 0, total: 0 };
        const actorDiscordId = actorTalent.discordId || actorTalent.id || 'N/A';

        const actorPpLink = generatePaypalPaymentLink(actorTalent.paypal, actorPayout.total, currency);
        const actorBnbLink = generateBinancePaymentLink(actorTalent.binance, actorPayout.total, currency);

        const actorLinkParts = [];
        if (actorPpLink) actorLinkParts.push(`[🔗 Pagar en PayPal ($${actorPayout.total} ${currency})](${actorPpLink})`);
        if (actorBnbLink) actorLinkParts.push(`[⚡ Pagar en Binance Pay](${actorBnbLink})`);

        checkoutLinks.push(`**🎭 Actor (<@${actorDiscordId}>):**\n${actorLinkParts.length > 0 ? actorLinkParts.join(' • ') : '*Sin links de pago directos disponibles*'}`);
      }
    }

    const isPaid = videoRecord?.status === 'PAID';
    const statusText = isPaid
      ? '`💰 PAGADO` *(Transferencias realizadas)*'
      : '`📝 CALCULADO` *(Listo para procesar pago)*';

    const embed = new EmbedBuilder()
      .setTitle('💰 Orden de Pago y Liquidación de Video')
      .setColor(isPaid ? EMBED_COLORS.SUCCESS : EMBED_COLORS.GOLD)
      .addFields(
        {
          name: '📺 Video',
          value: videoUrl !== 'N/A' ? videoUrl : `https://youtu.be/${videoId}`
        },
        {
          name: '📊 Vistas Finales',
          value: `${Number(views).toLocaleString()} vistas`
        },
        {
          name: '💵 Total Liquidado',
          value: `$${totalPayout} ${currency}`
        },
        {
          name: '📋 Desglose y Cuentas',
          value: paymentCodeBlock
        },
        {
          name: '⚡ Enlaces Directos de Checkout (Pago Rápido)',
          value: checkoutLinks.join('\n\n')
        },
        {
          name: '📌 Estado',
          value: statusText,
          inline: false
        }
      )
      .setFooter({ text: `Sonic Gestión • ID: ${videoRecord?.id || videoId}` })
      .setTimestamp(videoRecord?.calculatedAt ? new Date(videoRecord.calculatedAt) : new Date());

    if (thumbnailUrl) {
      embed.setThumbnail(thumbnailUrl);
    }

    return embed;
  }

  /**
   * Builds the action row components for an admin payment order.
   * @param {Object} videoRecord
   * @param {boolean} [isPaid=false]
   * @param {string} [paidByTag=null]
   * @returns {ActionRowBuilder[]}
   */
  static buildAdminPaymentComponents(videoRecord, isPaid = false, paidByTag = null) {
    const paid = isPaid || videoRecord?.status === 'PAID';
    const videoId = videoRecord?.id || videoRecord?.youtubeVideoId || 'unknown';

    let label = 'Marcar como Pagado';
    if (paid) {
      label = paidByTag ? `Pagado (${paidByTag})`.slice(0, 80) : 'Pagado';
    }

    const button = new ButtonBuilder()
      .setCustomId(paid ? `order_btn_paid_done:${videoId}` : `order_btn_mark_paid:${videoId}`)
      .setLabel(label)
      .setEmoji(paid ? '✅' : '💰')
      .setStyle(paid ? ButtonStyle.Secondary : ButtonStyle.Success)
      .setDisabled(paid);

    return [new ActionRowBuilder().addComponents(button)];
  }

  /**
   * Dispatches the Admin Payment Order embed to the specified admin channel.
   *
   * @param {Object} client - Discord Client
   * @param {string} channelId - Admin Channel Snowflake ID
   * @param {Object} settlementData - Video settlement payload
   * @returns {Promise<Object | null>} - Sent Discord Message or null
   */
  static async sendAdminPaymentOrder(client, channelId, settlementData) {
    if (!client || !channelId) return null;

    try {
      let channel = null;

      if (client.channels?.cache?.has(channelId)) {
        channel = client.channels.cache.get(channelId);
      } else if (typeof client.channels?.fetch === 'function') {
        channel = await client.channels.fetch(channelId).catch(() => null);
      } else if (typeof client.getChannel === 'function') {
        channel = client.getChannel(channelId);
      }

      if (!channel || typeof channel.send !== 'function') {
        console.warn(`[NotificationService] No se pudo encontrar el canal de administración con ID: ${channelId}`);
        return null;
      }

      const embed = this.buildAdminPaymentOrder(settlementData);
      const components = this.buildAdminPaymentComponents(
        settlementData?.videoRecord,
        settlementData?.videoRecord?.status === 'PAID'
      );

      return await channel.send({ embeds: [embed], components });
    } catch (error) {
      console.error(`[NotificationService] Error enviando orden de pago al canal admin (${channelId}):`, error);
      return null;
    }
  }

  /**
   * Updates an existing admin payment order message to reflect PAID status.
   *
   * @param {Object} client - Discord client
   * @param {string} channelId - Channel ID where the order was sent
   * @param {string} messageId - Message ID of the payment order
   * @param {Object} videoRecord - Updated video record
   * @param {string} [paidByTag=null] - User tag/mention of who marked it as paid
   * @returns {Promise<boolean>}
   */
  static async updateAdminPaymentOrderMessage(client, channelId, messageId, videoRecord, paidByTag = null) {
    if (!client || !channelId || !messageId) return false;

    try {
      let channel = null;
      if (client.channels?.cache?.has(channelId)) {
        channel = client.channels.cache.get(channelId);
      } else if (typeof client.channels?.fetch === 'function') {
        channel = await client.channels.fetch(channelId).catch(() => null);
      } else if (typeof client.getChannel === 'function') {
        channel = client.getChannel(channelId);
      }

      if (!channel) return false;

      let message = null;
      if (channel.messages?.cache?.has(messageId)) {
        message = channel.messages.cache.get(messageId);
      } else if (typeof channel.messages?.fetch === 'function') {
        message = await channel.messages.fetch(messageId).catch(() => null);
      }

      if (!message || typeof message.edit !== 'function') return false;

      const existingEmbed = message.embeds?.[0];
      if (!existingEmbed) return false;

      const embedBuilder = EmbedBuilder.from(existingEmbed);
      embedBuilder.setColor(EMBED_COLORS.SUCCESS);

      const fields = embedBuilder.data.fields || [];
      const updatedFields = fields.map(f => {
        if (f.name === '📌 Estado') {
          return {
            ...f,
            value: `\`💰 PAGADO\` *(Transferencias realizadas${paidByTag ? ` por ${paidByTag}` : ''})*`
          };
        }
        return f;
      });
      embedBuilder.setFields(updatedFields);

      const components = this.buildAdminPaymentComponents(videoRecord, true, paidByTag);
      await message.edit({ embeds: [embedBuilder], components });
      return true;
    } catch (err) {
      console.warn('[NotificationService] No se pudo actualizar el mensaje de orden de pago:', err.message || err);
      return false;
    }
  }

  /**
   * Builds the private settlement DM embed sent to an individual participant.
   *
   * @param {Object} params
   * @param {Object} params.talent - Participant talent record
   * @param {Object} params.payout - Talent payout details
   * @param {number} params.views - Reached YouTube view count
   * @param {Object} params.config - System configuration
   * @param {Object} [params.videoRecord] - Video record
   * @returns {EmbedBuilder}
   */
  static buildSettlementDM({ talent = {}, payout = {}, views = 0, config = DEFAULT_CONFIG, videoRecord = {} }) {
    const currency = config?.currency || DEFAULT_CONFIG.currency || 'MXN';
    const videoTitle = videoRecord?.videoTitle || videoRecord?.title || videoRecord?.youtubeVideoId || videoRecord?.videoId || 'YouTube Video';
    const videoId = videoRecord?.youtubeVideoId || videoRecord?.videoId || YouTubeService.extractVideoId(videoRecord?.youtubeUrl) || null;
    const videoUrl = videoRecord?.youtubeUrl || (videoId ? `https://www.youtube.com/watch?v=${videoId}` : null);
    const thumbnailUrl = videoId ? YouTubeService.getThumbnailUrl(videoId) : null;

    const baseAmount = Number(payout.base || 0);
    const bonus1 = Number(payout.bonus1 || 0);
    const bonus2 = Number(payout.bonus2 || 0);
    const totalBonus = Number(payout.totalBonus || (bonus1 + bonus2));
    const total = Number(payout.total || (baseAmount + totalBonus));

    const roleName = payout.role === 'EDITOR' ? '🎬 Editor' : '🎭 Actor';

    // Direct payment links for talent profile preview
    const talentPpLink = generatePaypalPaymentLink(talent.paypal, total, currency);
    const talentBnbLink = generateBinancePaymentLink(talent.binance, total, currency);
    const linksDisplay = [];
    if (talentPpLink) linksDisplay.push(`[🔗 Enlace PayPal](${talentPpLink})`);
    if (talentBnbLink) linksDisplay.push(`[⚡ Enlace Binance](${talentBnbLink})`);

    const accountsFieldText = `\`\`\`\nPayPal:  ${talent.paypal || 'Sin registrar'}\nBinance: ${talent.binance || 'Sin registrar'}\n\`\`\`` +
      (linksDisplay.length > 0 ? `\n${linksDisplay.join(' • ')}` : '');

    const embed = new EmbedBuilder()
      .setTitle('🎉 Liquidación de Video Completada')
      .setColor(EMBED_COLORS.SUCCESS)
      .setDescription(
        `¡Hola! Se ha completado el período de seguimiento de **5 días** para tu video y se ha calculado tu liquidación final.`
      )
      .addFields(
        {
          name: '📺 Video',
          value: videoUrl ? `[${videoTitle}](${videoUrl})` : videoTitle,
          inline: false
        },
        {
          name: '📊 Vistas Registradas (5 días)',
          value: `${Number(views).toLocaleString()} vistas`,
          inline: true
        },
        {
          name: '🎭 Rol',
          value: roleName,
          inline: true
        },
        {
          name: '💵 Tarifa Base',
          value: `$${baseAmount} ${currency}`,
          inline: true
        },
        {
          name: '🌟 Bonos Obtenidos',
          value: `$${totalBonus} ${currency} (500k: $${bonus1} | 1M: $${bonus2})`,
          inline: false
        },
        {
          name: '💰 Total a Transferir',
          value: `**$${total} ${currency}**`,
          inline: false
        },
        {
          name: '💳 Cuentas Registradas',
          value: accountsFieldText,
          inline: false
        },
        {
          name: 'ℹ️ Estado del Pago',
          value: 'La orden de pago ha sido generada y remitida a la administración con enlaces de checkout directo. Tu transferencia será realizada a la brevedad posible según las cuentas indicadas.',
          inline: false
        }
      )
      .setFooter({ text: 'Sonic Gestión Bot • Notificaciones de Liquidación' })
      .setTimestamp();

    if (thumbnailUrl) {
      embed.setThumbnail(thumbnailUrl);
    }

    return embed;
  }

  /**
   * Safely dispatches private settlement DMs to editor and all participating actors.
   * Gracefully catches closed DMs (Discord 50007).
   *
   * @param {Object} client - Discord Client
   * @param {Object} settlementData - Complete settlement payload
   * @returns {Promise<{ sent: string[], failed: string[] }>}
   */
  static async sendSettlementDMs(client, settlementData) {
    const results = { sent: [], failed: [] };
    if (!client) return results;

    const { editor, actors = [], views, config, videoRecord } = settlementData;

    const targets = [];
    if (editor?.talent) {
      targets.push({
        talent: editor.talent,
        payout: editor.payout
      });
    }

    if (Array.isArray(actors)) {
      for (const a of actors) {
        if (a?.talent) {
          targets.push({
            talent: a.talent,
            payout: a.payout
          });
        }
      }
    }

    for (const target of targets) {
      const discordId = target.talent.discordId || target.talent.id;
      if (!discordId) continue;

      try {
        let user = null;

        if (client.users?.cache?.has(discordId)) {
          user = client.users.cache.get(discordId);
        } else if (typeof client.users?.fetch === 'function') {
          user = await client.users.fetch(discordId).catch(() => null);
        } else if (typeof client.getUser === 'function') {
          user = client.getUser(discordId);
        }

        if (!user || typeof user.send !== 'function') {
          results.failed.push(discordId);
          continue;
        }

        const embed = this.buildSettlementDM({
          talent: target.talent,
          payout: target.payout,
          views,
          config,
          videoRecord
        });

        await user.send({ embeds: [embed] });
        results.sent.push(discordId);
      } catch (err) {
        if (err.code === 50007 || err.message?.includes('Cannot send messages')) {
          console.warn(`[NotificationService] El talento <@${discordId}> tiene los DMs cerrados. Liquidación enviada al admin pero no por DM.`);
        } else {
          console.warn(`[NotificationService] Error enviando DM de liquidación a <@${discordId}>:`, err.message || err);
        }
        results.failed.push(discordId);
      }
    }

    return results;
  }

  /**
   * Builds the private payment completion DM embed sent to an individual participant when marked as PAID.
   *
   * @param {Object} params
   * @param {Object} params.talent - Participant talent record
   * @param {Object} params.payout - Talent payout details
   * @param {number} params.views - Reached YouTube view count
   * @param {Object} params.config - System configuration
   * @param {Object} [params.videoRecord] - Video record
   * @param {string} [params.adminDisplay] - Administrator name or mention
   * @returns {EmbedBuilder}
   */
  static buildPaymentCompletedDM({ talent = {}, payout = {}, views = 0, config = DEFAULT_CONFIG, videoRecord = {}, adminDisplay = 'Administración' }) {
    const currency = config?.currency || DEFAULT_CONFIG.currency || 'MXN';
    const videoTitle = videoRecord?.videoTitle || videoRecord?.title || videoRecord?.youtubeVideoId || videoRecord?.videoId || 'Video de YouTube';
    const videoId = videoRecord?.youtubeVideoId || videoRecord?.videoId || YouTubeService.extractVideoId(videoRecord?.youtubeUrl) || null;
    const videoUrl = videoRecord?.youtubeUrl || (videoId ? `https://www.youtube.com/watch?v=${videoId}` : null);
    const thumbnailUrl = videoId ? YouTubeService.getThumbnailUrl(videoId) : null;

    const baseAmount = Number(payout.base || 0);
    const bonus1 = Number(payout.bonus1 || 0);
    const bonus2 = Number(payout.bonus2 || 0);
    const totalBonus = Number(payout.totalBonus || (bonus1 + bonus2));
    const total = Number(payout.total || (baseAmount + totalBonus));

    const roleName = payout.role === 'EDITOR' ? '🎬 Editor' : '🎭 Actor';

    const embed = new EmbedBuilder()
      .setTitle('🎉 ¡Pago Realizado! - Liquidación de Video')
      .setColor(EMBED_COLORS.SUCCESS)
      .setDescription(
        `¡Hola! La administración ha completado y transferido tu pago por la realización del video **[${videoTitle}](${videoUrl || 'https://youtube.com'})**.`
      )
      .addFields(
        {
          name: '📺 Video',
          value: videoUrl ? `[${videoTitle}](${videoUrl})` : videoTitle,
          inline: false
        },
        {
          name: '📊 Vistas Finales (5 días)',
          value: `${Number(views).toLocaleString()} vistas`,
          inline: true
        },
        {
          name: '🎭 Tu Rol',
          value: roleName,
          inline: true
        },
        {
          name: '💵 Tarifa Base',
          value: `$${baseAmount} ${currency}`,
          inline: true
        },
        {
          name: '🌟 Bonos por Vistas',
          value: `$${totalBonus} ${currency} (500k: $${bonus1} | 1M: $${bonus2})`,
          inline: false
        },
        {
          name: '💰 Monto Total Transferido',
          value: `**$${total} ${currency}**`,
          inline: false
        },
        {
          name: '💳 Cuenta de Destino',
          value: `\`\`\`\nPayPal:  ${talent.paypal || 'No registrada'}\nBinance: ${talent.binance || 'No registrada'}\n\`\`\``,
          inline: false
        },
        {
          name: '📌 Estado del Pago',
          value: `\`💰 PAGADO / TRANSFERIDO\` *(Confirmado por ${adminDisplay})*`,
          inline: false
        },
        {
          name: 'ℹ️ Soporte',
          value: 'Por favor verifica la acreditación de tus fondos. Si tienes alguna duda sobre el depósito, contacta al equipo de administración.',
          inline: false
        }
      )
      .setFooter({ text: 'Sonic Gestión Bot • Notificación de Pago Completado' })
      .setTimestamp();

    if (thumbnailUrl) {
      embed.setThumbnail(thumbnailUrl);
    }

    return embed;
  }

  /**
   * Safely dispatches payment completion direct messages to all participants (editor and actors)
   * when an administrator marks the video as PAID.
   *
   * @param {Object} client - Discord Client
   * @param {Object} params
   * @param {Object} params.videoRecord - Database VideoRecord with editor and participants
   * @param {Object|string} [params.adminUser=null] - Discord user or tag
   * @param {Object} [params.config=null] - System configuration
   * @returns {Promise<{ sent: string[], failed: string[] }>}
   */
  static async sendPaymentCompletionDMs(client, { videoRecord, adminUser = null, config = null }) {
    const results = { sent: [], failed: [] };
    if (!client || !videoRecord) return results;

    const activeConfig = config || DEFAULT_CONFIG;
    const views = videoRecord.finalViews ?? 0;
    const adminDisplay = adminUser ? (adminUser.tag || adminUser.username || String(adminUser)) : 'Administración';

    // Target recipients: editor + all actors
    const targets = [];

    // Editor
    if (videoRecord.editorId && videoRecord.editor) {
      const editorPayout = PayoutService.calculateTalentPayout('EDITOR', views, activeConfig);
      targets.push({
        talent: videoRecord.editor,
        payout: editorPayout
      });
    }

    // Actors
    if (Array.isArray(videoRecord.participants)) {
      for (const p of videoRecord.participants) {
        const talent = p.talent || { discordId: p.talentId };
        const actorPayout = (p.baseAmount != null && p.totalAmount != null)
          ? {
            role: 'ACTOR',
            base: p.baseAmount,
            bonus1: (p.bonusAmount && views >= (activeConfig.threshold1 || 500000)) ? (activeConfig.bonus1 || 25) : 0,
            bonus2: (p.bonusAmount && views >= (activeConfig.threshold2 || 1000000)) ? (activeConfig.bonus2 || 25) : 0,
            totalBonus: p.bonusAmount ?? 0,
            total: p.totalAmount ?? 0
          }
          : PayoutService.calculateTalentPayout('ACTOR', views, activeConfig);

        targets.push({
          talent,
          payout: actorPayout
        });
      }
    }

    for (const target of targets) {
      const discordId = target.talent?.discordId || target.talent?.id;
      if (!discordId) continue;

      try {
        let user = null;
        if (client.users?.cache?.has(discordId)) {
          user = client.users.cache.get(discordId);
        } else if (typeof client.users?.fetch === 'function') {
          user = await client.users.fetch(discordId).catch(() => null);
        } else if (typeof client.getUser === 'function') {
          user = client.getUser(discordId);
        }

        if (!user || typeof user.send !== 'function') {
          results.failed.push(discordId);
          continue;
        }

        const embed = this.buildPaymentCompletedDM({
          talent: target.talent,
          payout: target.payout,
          views,
          config: activeConfig,
          videoRecord,
          adminDisplay
        });

        await user.send({ embeds: [embed] });
        results.sent.push(discordId);
      } catch (err) {
        if (err.code === 50007 || err.message?.includes('Cannot send messages')) {
          console.warn(`[NotificationService] El talento <@${discordId}> tiene los DMs cerrados. Notificación omitida.`);
        } else {
          console.warn(`[NotificationService] Error enviando DM de pago completado a <@${discordId}>:`, err.message || err);
        }
        results.failed.push(discordId);
      }
    }

    return results;
  }
}

export default NotificationService;
