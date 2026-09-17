import {
  EmbedBuilder,
  PermissionFlagsBits,
  ActionRowBuilder,
  UserSelectMenuBuilder,
  ButtonBuilder,
  ButtonStyle
} from 'discord.js';
import { TalentService } from '../../src/services/talentService.js';
import { EMBED_COLORS } from '../../src/config/constants.js';

export function buildAdminTalentSelectEmbed() {
  return new EmbedBuilder()
    .setTitle('👑 Registro Administrativo de Talentos')
    .setColor(EMBED_COLORS.PRIMARY)
    .setDescription(
      'Bienvenido al panel de gestión y registro directo de talentos.\n\n' +
      'Como administrador, puedes registrar a cualquier miembro del servidor, asignar su rol (**Actor** o **Editor**) y configurar sus métodos de pago (**PayPal** / **Binance**) sin que ellos tengan que hacerlo manualmente.\n\n' +
      '👇 **Selecciona al miembro en el menú inferior para comenzar:**'
    )
    .addFields(
      {
        name: '✨ Consideraciones Administrativas',
        value:
          '• **Verificación en Vivo:** Los identificadores y links de PayPal.me se validan en tiempo real para evitar errores.\n' +
          '• **Notificación Automática:** Puedes elegir notificar al talento vía mensaje directo (DM) con su ficha de registro.\n' +
          '• **Gestión Completa:** Permite crear, modificar o eliminar expedientes existentes con un solo clic.',
        inline: false
      }
    )
    .setFooter({ text: 'Sonic Gestión Bot • Módulo Administrativo' })
    .setTimestamp();
}

export function buildAdminTalentSelectRows(authorId) {
  const userMenu = new UserSelectMenuBuilder()
    .setCustomId(`admreg_select_user:${authorId}`)
    .setPlaceholder('👤 Selecciona al miembro del servidor...')
    .setMinValues(1)
    .setMaxValues(1);

  const rowMenu = new ActionRowBuilder().addComponents(userMenu);
  return [rowMenu];
}

export function buildAdminTalentCardEmbed(targetUser, talent) {
  const isRegistered = !!talent;
  const roleIcon = talent?.role === 'EDITOR' ? '🎬' : '🎭';
  const username = targetUser.username || targetUser.tag || targetUser.id;

  const embed = new EmbedBuilder()
    .setTitle(`👤 Expediente de Talento: ${username}`)
    .setColor(isRegistered ? EMBED_COLORS.PRIMARY : EMBED_COLORS.WARNING)
    .setThumbnail(targetUser.displayAvatarURL ? targetUser.displayAvatarURL() : null)
    .setDescription(
      `Ficha administrativa de <@${targetUser.id}> (\`${targetUser.id}\`):\n\n` +
      (isRegistered
        ? `🟢 **Este usuario ya cuenta con un expediente en la base de datos.** Puedes actualizar sus datos, cambiar su rol o eliminarlo.`
        : `⚠️ **Este usuario aún no está registrado como talento.** Haz clic en los botones inferiores para crear su expediente.`)
    )
    .addFields(
      {
        name: '🎭 Rol Asignado',
        value: isRegistered ? `**${roleIcon} ${talent.role}**` : '*Sin rol asignado*',
        inline: true
      },
      {
        name: '💳 PayPal',
        value: talent?.paypal ? `\`${talent.paypal}\`` : '*No configurado*',
        inline: true
      },
      {
        name: '🪙 Binance',
        value: talent?.binance ? `\`${talent.binance}\`` : '*No configurado*',
        inline: true
      }
    )
    .setFooter({ text: 'Presiona un botón para abrir el formulario modal con los datos' })
    .setTimestamp();

  return embed;
}

export function buildAdminTalentCardRows(authorId, targetUserId, isRegistered) {
  const row1 = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`admreg_open_modal:${authorId}:${targetUserId}:ACTOR`)
      .setLabel('Registrar / Editar como Actor')
      .setEmoji('🎭')
      .setStyle(ButtonStyle.Primary),
    new ButtonBuilder()
      .setCustomId(`admreg_open_modal:${authorId}:${targetUserId}:EDITOR`)
      .setLabel('Registrar / Editar como Editor')
      .setEmoji('🎬')
      .setStyle(ButtonStyle.Success)
  );

  const row2Components = [
    new ButtonBuilder()
      .setCustomId(`admreg_btn_newuser:${authorId}`)
      .setLabel('Elegir Otro Usuario')
      .setEmoji('👥')
      .setStyle(ButtonStyle.Secondary)
  ];

  if (isRegistered) {
    row2Components.push(
      new ButtonBuilder()
        .setCustomId(`admreg_btn_delete:${authorId}:${targetUserId}`)
        .setLabel('Eliminar Expediente')
        .setEmoji('🗑️')
        .setStyle(ButtonStyle.Danger)
    );
  }

  row2Components.push(
    new ButtonBuilder()
      .setCustomId(`admreg_btn_cancel:${authorId}`)
      .setLabel('Cerrar')
      .setEmoji('✖️')
      .setStyle(ButtonStyle.Secondary)
  );

  const row2 = new ActionRowBuilder().addComponents(row2Components);
  return [row1, row2];
}

export default {
  name: 'admin-registro',
  aliases: [
    'adminregistro', 'reg-talento', 'regtalento', 'registrar-talento-admin',
    'admin-talento', 'admintalento', 'adm-registro', 'crear-talento', 'creartalento',
    'talento-admin', 'gestionar-talento', 'gestion-talentos'
  ],
  desc: 'Panel administrativo interactivo para registrar, editar y gestionar talentos (actores/editores) en la base de datos.',
  permisos: [PermissionFlagsBits.Administrator],
  permisos_bot: [PermissionFlagsBits.SendMessages, PermissionFlagsBits.EmbedLinks],
  run: async (client, message, args, prefix) => {
    const currentPrefix = prefix || '!';

    // 1. Si se menciona un usuario o se pasa su ID: ir directamente a su ficha
    if (args && args.length > 0) {
      const targetToken = args[0];
      const mentionMatch = targetToken.match(/^<@!?([a-zA-Z0-9_.-]+)>$/);
      const targetId = mentionMatch ? mentionMatch[1] : (targetToken.match(/^[a-zA-Z0-9_.-]{2,64}$/) ? targetToken : null);

      if (targetId) {
        let targetUser = client?.users?.cache?.get?.(targetId);
        if (!targetUser && client?.users?.fetch) {
          try {
            targetUser = await client.users.fetch(targetId);
          } catch {
            targetUser = { id: targetId, username: `Usuario (${targetId})` };
          }
        }
        if (!targetUser) targetUser = { id: targetId, username: `Usuario (${targetId})` };

        const talent = await TalentService.getTalent(targetId);
        const embed = buildAdminTalentCardEmbed(targetUser, talent);
        const rows = buildAdminTalentCardRows(message.author.id, targetId, !!talent);

        return message.reply({ embeds: [embed], components: rows });
      }
    }

    // 2. Sin argumentos: mostrar selector interactivo de miembros
    const embed = buildAdminTalentSelectEmbed();
    const rows = buildAdminTalentSelectRows(message.author.id);

    return message.reply({ embeds: [embed], components: rows });
  }
};
