import {
  EmbedBuilder,
  PermissionFlagsBits,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle
} from 'discord.js';
import { TalentService } from '../../src/services/talentService.js';
import { parseRegistroArgs, isValidRole, normalizePaypal, verifyPaypalMeOnline, isValidEmail } from '../../src/utils/validators.js';
import { EMBED_COLORS } from '../../src/config/constants.js';

export default {
  name: 'registro',
  aliases: [
    'perfil', 'registrar-talento', 'expediente', 'registrar-expediente',
    'registrar', 'registrarse', 'register', 'signup',
    'perfil-registro', 'registrartalento', 'registrarexpediente',
    'mi-registro', 'miregistro', 'talento-registro', 'vincular-pago', 'datos-pago'
  ],
  desc: 'Registra o actualiza el expediente de talento con interfaz interactiva o por comando.',
  permisos: [],
  permisos_bot: [PermissionFlagsBits.SendMessages, PermissionFlagsBits.EmbedLinks],
  run: async (client, message, args, prefix) => {
    const currentPrefix = prefix || '!';

    // Si NO se pasaron argumentos, mostrar la INTERFAZ GRÁFICA INTERACTIVA PASO A PASO
    if (!args || args.length === 0) {
      const targetUser = message.author;
      const existing = await TalentService.getTalent(targetUser.id);

      const interactiveRow = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId(`reg_role_actor:${targetUser.id}`)
          .setLabel('Soy Actor')
          .setEmoji('🎭')
          .setStyle(ButtonStyle.Primary),
        new ButtonBuilder()
          .setCustomId(`reg_role_editor:${targetUser.id}`)
          .setLabel('Soy Editor')
          .setEmoji('🎬')
          .setStyle(ButtonStyle.Success)
      );

      const embed = new EmbedBuilder()
        .setTitle('📋 Registro de Expediente de Talento')
        .setColor(EMBED_COLORS.PRIMARY)
        .setDescription(
          `¡Hola <@${targetUser.id}>! Completa tu registro en 2 sencillos pasos utilizando los botones interactivos:\n\n` +
          `**Paso 1:** Elige tu rol presionando **Soy Actor** o **Soy Editor**.\n` +
          `**Paso 2:** Se abrirá una ventana emergente para que ingreses tu **PayPal** y/o **Binance** de forma rápida y segura.\n\n` +
          `*(💡 También puedes registrarte por texto directo si prefieres: \`${currentPrefix}registro ACTOR paypal usuario@gmail.com\`)*`
        );

      if (existing) {
        const roleIcon = existing.role === 'EDITOR' ? '🎬' : '🎭';
        embed.addFields(
          {
            name: '📌 Tu Expediente Actual',
            value:
              `• **Rol:** ${roleIcon} \`${existing.role}\`\n` +
              `• **PayPal:** ${existing.paypal ? `\`${existing.paypal}\`` : '*No configurado*'}\n` +
              `• **Binance:** ${existing.binance ? `\`${existing.binance}\`` : '*No configurado*'}`,
            inline: false
          }
        );
      }

      embed.setFooter({ text: 'Sonic Gestión Bot • Asistente Interactivo de Registro' });

      return message.reply({ embeds: [embed], components: [interactiveRow] });
    }

    // Si se proporcionaron argumentos (modo comando rápido para scripts o administradores)
    const isAdmin = message.member?.permissions?.has(PermissionFlagsBits.Administrator) || false;

    // Check if first arg is mention and author is not admin
    const firstToken = args[0];
    const isMention = firstToken && /^<@!?[a-zA-Z0-9_.-]+>$/.test(firstToken);
    if (isMention && !isAdmin) {
      return message.reply('❌ No tienes permisos de Administrador para registrar expedientes en nombre de otros usuarios.');
    }

    const parsed = parseRegistroArgs(args, message.author.id, isAdmin);

    try {
      const existing = await TalentService.getTalent(parsed.targetDiscordId);

      // If new profile and role wasn't provided or recognized
      if (!existing && !parsed.role) {
        return message.reply(
          `⚠️ Debes especificar el rol (\`ACTOR\` o \`EDITOR\`) al registrar un nuevo expediente.\n` +
          `Ejemplo: \`${currentPrefix}registro ACTOR paypal ${message.author?.username || 'usuario'}@gmail.com\`\n` +
          `*(O escribe simplemente \`${currentPrefix}registro\` para usar la interfaz de botones).*`
        );
      }

      // If new profile and no payment method was provided
      if (!existing && !parsed.paypal && !parsed.binance) {
        return message.reply(
          `⚠️ Debes proporcionar al menos un método de pago (\`paypal <correo|link>\` o \`binance <id|link>\`).\n` +
          `Ejemplo: \`${currentPrefix}registro ACTOR paypal correo@gmail.com\``
        );
      }

      // Si se proporcionó PayPal y es un link o ID de paypal.me (no un correo), verificar en vivo haciendo ping a paypal.me/<id>
      if (parsed.paypal && !isValidEmail(parsed.paypal)) {
        const verification = await verifyPaypalMeOnline(parsed.paypal);
        if (!verification.valid) {
          return message.reply(
            `❌ **Error en el registro:** El correo o identificador de PayPal '${parsed.paypal}' no tiene un formato de correo electrónico válido o el ID de PayPal.me no devolvió status 200 OK.\n` +
            `Detalle: ${verification.error}`
          );
        }
      }

      const finalPaypal = parsed.paypal && !isValidEmail(parsed.paypal) ? normalizePaypal(parsed.paypal) : parsed.paypal;

      const talent = await TalentService.upsertTalent({
        discordId: parsed.targetDiscordId,
        role: parsed.role,
        paypal: finalPaypal,
        binance: parsed.binance
      });

      const roleIcon = talent.role === 'EDITOR' ? '🎬' : '🎭';
      const isTargetSelf = parsed.targetDiscordId === message.author.id;

      const embed = new EmbedBuilder()
        .setTitle('✅ Expediente de Talento Guardado')
        .setDescription(
          isTargetSelf
            ? `Tu expediente de talento ha sido guardado exitosamente en el sistema.`
            : `El expediente de talento para <@${talent.discordId}> ha sido guardado exitosamente.`
        )
        .setColor(EMBED_COLORS.SUCCESS)
        .addFields(
          {
            name: '👤 Usuario',
            value: `<@${talent.discordId}>`,
            inline: true
          },
          {
            name: '🎭 Rol Asignado',
            value: `**${roleIcon} ${talent.role}**`,
            inline: true
          },
          {
            name: '💳 PayPal (Correo / Link / ID)',
            value: talent.paypal ? `\`${talent.paypal}\`` : '*No configurado*',
            inline: false
          },
          {
            name: '🪙 Binance (ID / Link / Cuenta)',
            value: talent.binance ? `\`${talent.binance}\`` : '*No configurado*',
            inline: false
          }
        )
        .setFooter({
          text: `Consulta tu perfil en cualquier momento con ${currentPrefix}miperfil`
        })
        .setTimestamp();

      return message.reply({ embeds: [embed] });
    } catch (error) {
      console.error('Error in registro command:', error);
      return message.reply(`❌ **Error en el registro:** ${error.message}`);
    }
  }
};
