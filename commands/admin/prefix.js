import {
  EmbedBuilder,
  PermissionFlagsBits,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ActivityType
} from 'discord.js';
import { ConfigService } from '../../src/services/configService.js';
import { EMBED_COLORS } from '../../src/config/constants.js';

export default {
  name: 'prefix',
  aliases: [
    'set-prefix', 'setprefix', 'cambiar-prefix', 'modificar-prefix',
    'prefijo', 'set-prefijo', 'setprefijo', 'cambiar-prefijo',
    'bot-prefix', 'botprefix', 'config-prefix', 'configprefix'
  ],
  desc: 'Consulta o actualiza el prefijo de comandos del bot de forma dinámica y persistente.',
  permisos: [PermissionFlagsBits.Administrator],
  permisos_bot: [PermissionFlagsBits.SendMessages, PermissionFlagsBits.EmbedLinks],
  run: async (client, message, args, prefix) => {
    if (message.member && !message.member.permissions?.has(PermissionFlagsBits.Administrator)) {
      return message.reply('❌ No tienes los permisos necesarios para ejecutar este comando (Requiere Administrador).');
    }

    const currentPrefix = prefix || ConfigService.getPrefix();

    // 1. Si NO se proporcionan argumentos, mostrar el estado actual con botones interactivos
    if (!args || args.length === 0) {
      try {
        const config = await ConfigService.getConfig();
        const activePrefix = config.prefix || '!';

        const embed = new EmbedBuilder()
          .setTitle('⚙️ Configuración del Prefijo del Bot')
          .setColor(EMBED_COLORS.PRIMARY)
          .setDescription(
            `El prefijo actual del bot en este servidor es: **\`${activePrefix}\`**\n\n` +
            `**¿Cómo cambiar el prefijo?**\n` +
            `• Por comando directo: \`${activePrefix}prefix <nuevo_prefijo>\`\n` +
            `• O pulsa el botón **✏️ Cambiar Prefijo** inferior para abrir una ventana emergente.\n\n` +
            `*(💡 Ejemplo: \`${activePrefix}prefix ?\` o \`${activePrefix}prefix .\` - Máximo 5 caracteres sin espacios)*`
          )
          .addFields(
            {
              name: '📌 Comandos de Ejemplo con tu Prefijo',
              value:
                `• \`${activePrefix}ayuda\` - Guía de comandos\n` +
                `• \`${activePrefix}registrar-video\` - Subir videos\n` +
                `• \`${activePrefix}tarifas\` - Ver tarifas activas\n` +
                `• \`${activePrefix}miperfil\` - Ver expediente propio`,
              inline: false
            }
          )
          .setFooter({ text: `Sonic Gestión Bot • Administración | Prefijo activo: ${activePrefix}` })
          .setTimestamp();

        const row = new ActionRowBuilder().addComponents(
          new ButtonBuilder()
            .setCustomId(`cfg_btn_change_prefix:${message.author.id}`)
            .setLabel('Cambiar Prefijo')
            .setEmoji('✏️')
            .setStyle(ButtonStyle.Primary),
          new ButtonBuilder()
            .setCustomId(`cfg_btn_reset_prefix:${message.author.id}`)
            .setLabel('Restablecer por Defecto (!)')
            .setEmoji('🔄')
            .setStyle(ButtonStyle.Secondary)
        );

        return message.reply({ embeds: [embed], components: [row] });
      } catch (err) {
        console.error('Error in prefix command (no args):', err);
        return message.reply(`❌ Error al consultar la configuración de prefijo: ${err.message}`);
      }
    }

    // 2. Si se suministra un nuevo prefijo por argumento
    const newPrefix = args[0].trim();

    try {
      const result = await ConfigService.updateConfig('prefix', newPrefix);

      // Actualizar la presencia en Discord si el cliente está disponible
      if (client?.user?.setActivity) {
        try {
          client.user.setActivity(`${result.newValue}ayuda | Gestión de Videos`, { type: ActivityType.Watching });
        } catch {
          // Ignore activity update error
        }
      }

      const successEmbed = new EmbedBuilder()
        .setTitle('✅ Prefijo Actualizado Exitosamente')
        .setColor(EMBED_COLORS.SUCCESS)
        .setDescription(
          `Se ha actualizado el prefijo del bot en la base de datos a **\`${result.newValue}\`**.\n` +
          `A partir de este momento, todos los comandos responderán con el nuevo prefijo de forma inmediata.`
        )
        .addFields(
          {
            name: 'Prefijo Anterior',
            value: `\`${result.oldValue || '!'}\``,
            inline: true
          },
          {
            name: 'Nuevo Prefijo Activo',
            value: `**\`${result.newValue}\`**`,
            inline: true
          },
          {
            name: '💡 Prueba ahora:',
            value: `\`${result.newValue}ayuda\` o \`${result.newValue}tarifas\``,
            inline: false
          }
        )
        .setFooter({ text: `Actualizado por ${message.author?.tag || 'Admin'}` })
        .setTimestamp();

      return message.reply({ embeds: [successEmbed] });
    } catch (error) {
      console.error('Error in prefix command:', error);
      return message.reply(`❌ **Error al actualizar prefijo:** ${error.message}`);
    }
  }
};
