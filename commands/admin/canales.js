import {
  EmbedBuilder,
  PermissionFlagsBits,
  ActionRowBuilder,
  ChannelSelectMenuBuilder,
  ChannelType,
  ButtonBuilder,
  ButtonStyle
} from 'discord.js';
import { ConfigService } from '../../src/services/configService.js';
import { EMBED_COLORS } from '../../src/config/constants.js';

export default {
  name: 'canales',
  aliases: [
    'set-canales', 'config-canales', 'setcanales', 'canales-config',
    'canal', 'canales-bot', 'config-canal', 'configcanales',
    'setup-canales', 'setupcanales', 'channels', 'channel',
    'set-channels', 'setchannels', 'config-channels', 'channel-config', 'configchannels'
  ],
  desc: 'Interfaz interactiva para configurar los canales de historial y administración en la base de datos.',
  permisos: [PermissionFlagsBits.Administrator],
  permisos_bot: [PermissionFlagsBits.SendMessages, PermissionFlagsBits.EmbedLinks],
  run: async (client, message, args, prefix) => {
    const currentPrefix = prefix || '!';

    try {
      const config = await ConfigService.getConfig();

      const historyChannelId = config.historyChannelId || process.env.HISTORY_CHANNEL_ID;
      const adminChannelId = config.adminChannelId || process.env.ADMIN_CHANNEL_ID;
      const weeklyChannelId = config.weeklySummaryChannelId || config.adminChannelId || process.env.WEEKLY_SUMMARY_CHANNEL_ID || process.env.ADMIN_CHANNEL_ID;

      const historyDisplay = historyChannelId ? `<#${historyChannelId}> (\`${historyChannelId}\`)` : '*No configurado (usando .env o no asignado)*';
      const adminDisplay = adminChannelId ? `<#${adminChannelId}> (\`${adminChannelId}\`)` : '*No configurado (usando .env o no asignado)*';
      const weeklyDisplay = config.weeklySummaryChannelId
        ? `<#${config.weeklySummaryChannelId}> (\`${config.weeklySummaryChannelId}\`)`
        : adminChannelId
          ? `<#${adminChannelId}> *(Heredado de Canal de Administración)*`
          : '*No configurado (hereda de Canal de Administración)*';

      const embed = new EmbedBuilder()
        .setTitle('📢 Configuración de Canales del Sistema')
        .setDescription(
          `Configura directamente los canales de destino del bot seleccionándolos en los menús inferiores.\n` +
          `Los cambios se guardan permanentemente en la **base de datos SQLite** sin necesidad de editar variables de entorno ni reiniciar el bot.`
        )
        .setColor(EMBED_COLORS.PRIMARY)
        .addFields(
          {
            name: '📜 Canal de Historial (Fichas de Registro)',
            value: historyDisplay,
            inline: false
          },
          {
            name: '👑 Canal de Administración (Órdenes de Pago)',
            value: adminDisplay,
            inline: false
          },
          {
            name: '📊 Canal de Resumen Semanal (Desglose y Ping @everyone)',
            value: weeklyDisplay,
            inline: false
          }
        )
        .setFooter({ text: `Sonic Gestión Bot • Administración | Usa ${currentPrefix}canales para reabrir este panel` })
        .setTimestamp();

      // Menu 1: Selección de Canal de Historial
      const historySelectMenu = new ChannelSelectMenuBuilder()
        .setCustomId(`cfg_select_history:${message.author.id}`)
        .setPlaceholder('📜 Selecciona el Canal de Historial de Videos...')
        .setChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement);

      // Menu 2: Selección de Canal de Administración
      const adminSelectMenu = new ChannelSelectMenuBuilder()
        .setCustomId(`cfg_select_admin:${message.author.id}`)
        .setPlaceholder('👑 Selecciona el Canal de Administración (Pagos)...')
        .setChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement);

      // Menu 3: Selección de Canal de Resumen Semanal
      const weeklySelectMenu = new ChannelSelectMenuBuilder()
        .setCustomId(`cfg_select_weekly:${message.author.id}`)
        .setPlaceholder('📊 Selecciona el Canal de Resumen Semanal...')
        .setChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement);

      const row1 = new ActionRowBuilder().addComponents(historySelectMenu);
      const row2 = new ActionRowBuilder().addComponents(adminSelectMenu);
      const row3 = new ActionRowBuilder().addComponents(weeklySelectMenu);

      const buttonRow = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId(`cfg_refresh_channels:${message.author.id}`)
          .setLabel('Actualizar Vista')
          .setEmoji('🔄')
          .setStyle(ButtonStyle.Secondary)
      );

      return message.reply({
        embeds: [embed],
        components: [row1, row2, row3, buttonRow]
      });
    } catch (error) {
      console.error('Error in canales command:', error);
      return message.reply(`❌ Ocurrió un error al cargar la configuración de canales: ${error.message}`);
    }
  }
};
