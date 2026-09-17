import {
  EmbedBuilder,
  PermissionFlagsBits,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle
} from 'discord.js';
import { ConfigService } from '../../src/services/configService.js';
import { YouTubeService } from '../../src/services/youtubeService.js';
import { EMBED_COLORS } from '../../src/config/constants.js';

export default {
  name: 'set-canal',
  aliases: [
    'setcanal', 'canal-yt', 'canalyt', 'set-canal-yt', 'setcanalyt',
    'youtube-canal', 'youtubecanal', 'set-youtube', 'setyoutube',
    'config-canal-yt', 'configcanalyt', 'yt-canal', 'ytcanal',
    'youtube-channel', 'set-channel-yt', 'canal-youtube', 'canalyoutube'
  ],
  desc: 'Configura el canal de YouTube predeterminado para el selector interactivo de los últimos 25 videos.',
  permisos: [PermissionFlagsBits.Administrator],
  permisos_bot: [PermissionFlagsBits.SendMessages, PermissionFlagsBits.EmbedLinks],
  run: async (client, message, args, prefix) => {
    if (message.member && !message.member.permissions?.has(PermissionFlagsBits.Administrator)) {
      return message.reply('❌ No tienes los permisos necesarios para ejecutar este comando (Requiere Administrador).');
    }

    const currentPrefix = prefix || '!';

    // 1. Si NO se proporcionan argumentos, mostrar la interfaz con el estado actual
    if (!args || args.length === 0) {
      try {
        const config = await ConfigService.getConfig();

        const channelDisplay = config.youtubeChannelUrl
          ? `**[${config.youtubeChannelTitle || 'Canal de YouTube'}](${config.youtubeChannelUrl})**\n\`ID: ${config.youtubeChannelId || 'No disponible'}\``
          : '*No hay ningún canal de YouTube vinculado actualmente.*';

        const embed = new EmbedBuilder()
          .setTitle('📺 Configuración de Canal de YouTube')
          .setColor(EMBED_COLORS.PRIMARY)
          .setDescription(
            `Vincula el canal de YouTube oficial para que el comando \`${currentPrefix}registrar-video\` despliegue automáticamente los últimos **25 videos más recientes** en un menú desplegable.\n\n` +
            `**Canal Configurado:**\n${channelDisplay}\n\n` +
            `**Sintaxis por comando:**\n\`${currentPrefix}set-canal <url_del_canal_o_handle>\`\n` +
            `*(Ejemplos: \`${currentPrefix}set-canal https://www.youtube.com/@SonicChannel\`, \`${currentPrefix}set-canal @SonicTheHedgehog\` o con ID \`UC...\`)*`
          )
          .setFooter({ text: `Sonic Gestión Bot • Usa ${currentPrefix}set-canal <link> para actualizar` })
          .setTimestamp();

        const row = new ActionRowBuilder().addComponents(
          new ButtonBuilder()
            .setCustomId(`cfg_btn_modal_channel:${message.author.id}`)
            .setLabel('Introducir Canal de YouTube')
            .setEmoji('✏️')
            .setStyle(ButtonStyle.Primary)
        );

        if (config.youtubeChannelId) {
          row.addComponents(
            new ButtonBuilder()
              .setCustomId(`cfg_btn_unlink_channel:${message.author.id}`)
              .setLabel('Desvincular Canal')
              .setEmoji('🗑️')
              .setStyle(ButtonStyle.Danger)
          );
        }

        return message.reply({ embeds: [embed], components: [row] });
      } catch (err) {
        console.error('Error in set-canal command (no args):', err);
        return message.reply(`❌ Error al consultar la configuración de canal: ${err.message}`);
      }
    }

    // 2. Si se suministra un argumento con la URL o handle del canal
    const rawInput = args.join(' ').trim();

    try {
      const channel = await YouTubeService.getChannelDetails(rawInput);

      await ConfigService.setYoutubeChannel({
        channelId: channel.channelId,
        url: channel.url,
        title: channel.title
      });

      const successEmbed = new EmbedBuilder()
        .setTitle('✅ Canal de YouTube Vinculado Exitosamente')
        .setColor(EMBED_COLORS.SUCCESS)
        .setDescription(
          `Se ha configurado el canal oficial de YouTube para el sistema.\n\n` +
          `A partir de ahora, cuando un administrador use \`${currentPrefix}registrar-video\`, el bot consultará los **últimos 25 videos** de este canal en orden cronológico inverso para seleccionarlos directamente.`
        )
        .addFields(
          {
            name: '📺 Canal de YouTube',
            value: `**[${channel.title}](${channel.url})**`,
            inline: true
          },
          {
            name: '🆔 ID de Canal',
            value: `\`${channel.channelId}\``,
            inline: true
          },
          {
            name: '📋 Lista de Subidas',
            value: `\`${channel.uploadsPlaylistId}\``,
            inline: true
          }
        )
        .setFooter({ text: `Configurado por ${message.author?.tag || 'Admin'}` })
        .setTimestamp();

      return message.reply({ embeds: [successEmbed] });
    } catch (error) {
      console.error('Error setting YouTube channel:', error);
      return message.reply(
        `❌ **Error al vincular canal de YouTube:**\n${error.message}\n` +
        `Asegúrate de introducir una URL válida como \`https://www.youtube.com/@Canal\`, \`@Canal\` o el ID \`UC...\`.`
      );
    }
  }
};
