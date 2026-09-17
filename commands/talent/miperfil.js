import { EmbedBuilder, PermissionFlagsBits } from 'discord.js';
import { TalentService } from '../../src/services/talentService.js';
import { generatePaypalPaymentLink, generateBinancePaymentLink } from '../../src/utils/validators.js';
import { EMBED_COLORS } from '../../src/config/constants.js';

export default {
  name: 'miperfil',
  aliases: [
    'mi-perfil', 'perfil-ver', 'ver-perfil', 'mi-expediente',
    'profile', 'myprofile', 'my-profile', 'verperfil',
    'perfilver', 'miexpediente', 'ver-expediente', 'verexpediente',
    'mis-datos', 'misdatos', 'datos', 'cuenta', 'mi-cuenta', 'micuenta'
  ],
  desc: 'Muestra el expediente y métodos de pago registrados del usuario o de un talento mencionado.',
  permisos: [],
  permisos_bot: [PermissionFlagsBits.SendMessages, PermissionFlagsBits.EmbedLinks],
  run: async (client, message, args, prefix) => {
    const currentPrefix = prefix || '!';

    let targetDiscordId = message.author.id;

    if (args && args.length > 0) {
      const firstArg = args[0];
      const mentionMatch = firstArg.match(/^<@!?([a-zA-Z0-9_.-]+)>$/);
      if (mentionMatch) {
        targetDiscordId = mentionMatch[1];
      } else if (/^[a-zA-Z0-9_.-]{2,64}$/.test(firstArg)) {
        targetDiscordId = firstArg;
      }
    }

    try {
      const talent = await TalentService.getTalent(targetDiscordId);

      const isSelf = targetDiscordId === message.author.id;

      if (!talent) {
        if (isSelf) {
          const notFoundEmbed = new EmbedBuilder()
            .setTitle('ℹ️ Sin Expediente Registrado')
            .setDescription(
              `Aún no tienes un expediente de talento registrado en el sistema.\n\n` +
              `Para registrarte y poder recibir pagos por tus videos, utiliza:\n` +
              `\`${currentPrefix}registro <ACTOR|EDITOR> paypal <tu_correo_o_paypal.me> [binance <tu_id_o_link>]\``
            )
            .setColor(EMBED_COLORS.WARNING)
            .setFooter({ text: 'Sonic Gestión Bot • Registro de Talentos' });

          return message.reply({ embeds: [notFoundEmbed] });
        } else {
          return message.reply(`❌ El usuario <@${targetDiscordId}> no cuenta con un expediente de talento registrado en el sistema.`);
        }
      }

      const roleIcon = talent.role === 'EDITOR' ? '🎬' : '🎭';
      const createdUnix = Math.floor(new Date(talent.createdAt).getTime() / 1000);
      const updatedUnix = Math.floor(new Date(talent.updatedAt).getTime() / 1000);

      // Helper direct links
      const ppDirectLink = generatePaypalPaymentLink(talent.paypal);
      const bnbDirectLink = generateBinancePaymentLink(talent.binance);

      const paypalDisplay = talent.paypal
        ? `\`${talent.paypal}\`${ppDirectLink ? ` • [🔗 Enlace directo](${ppDirectLink})` : ''}`
        : '*No registrado*';

      const binanceDisplay = talent.binance
        ? `\`${talent.binance}\`${bnbDirectLink ? ` • [⚡ Enlace directo](${bnbDirectLink})` : ''}`
        : '*No registrado*';

      const embed = new EmbedBuilder()
        .setTitle('📋 Expediente de Talento')
        .setDescription(`Ficha de datos y métodos de liquidación registrados para <@${talent.discordId}>:`)
        .setColor(EMBED_COLORS.PRIMARY)
        .addFields(
          {
            name: '🎭 Rol Principal',
            value: `**${roleIcon} ${talent.role}**`,
            inline: true
          },
          {
            name: '🆔 Discord ID',
            value: `\`${talent.discordId}\``,
            inline: true
          },
          {
            name: '💳 PayPal (Correo / ID / Link)',
            value: paypalDisplay,
            inline: false
          },
          {
            name: '🪙 Binance (ID / Link / Cuenta)',
            value: binanceDisplay,
            inline: false
          },
          {
            name: '📅 Fecha de Registro',
            value: `<t:${createdUnix}:F> (<t:${createdUnix}:R>)`,
            inline: true
          },
          {
            name: '🔄 Última Actualización',
            value: `<t:${updatedUnix}:R>`,
            inline: true
          }
        )
        .setFooter({
          text: `Para actualizar tus datos utiliza: ${currentPrefix}registro`
        })
        .setTimestamp();

      return message.reply({ embeds: [embed] });
    } catch (error) {
      console.error('Error in command miperfil:', error);
      return message.reply(`❌ Ocurrió un error al consultar el expediente: ${error.message}`);
    }
  }
};
