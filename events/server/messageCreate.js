import { ConfigService } from '../../src/services/configService.js';

export default {
  name: 'messageCreate',
  once: false,
  run: async (client, message) => {
    if (message.author.bot || !message.guild) return;

    const prefix = ConfigService.getPrefix();

    // Responder si el bot es mencionado directamente
    if (client?.user?.id) {
      const botMentionRegex = new RegExp(`^<@!?${client.user.id}>(?:\\s.*)?$`);
      if (botMentionRegex.test(message.content.trim())) {
        const afterMention = message.content.replace(new RegExp(`^<@!?${client.user.id}>`), '').trim().toLowerCase();
        if (!afterMention || ['prefix', 'prefijo', 'ayuda', 'help'].includes(afterMention)) {
          return message.reply(`👋 ¡Hola! Mi prefijo actual en este servidor es: **\`${prefix}\`**\nUsa \`${prefix}ayuda\` para consultar todos los comandos disponibles.`);
        }
      }
    }

    if (!message.content.startsWith(prefix)) return;

    const args = message.content.slice(prefix.length).trim().split(/ +/g);
    const commandName = args.shift()?.toLowerCase();

    if (!commandName) return;

    const command = client.commands.get(commandName) || client.commands.get(client.aliases.get(commandName));
    if (!command) return;

    // Comprobación de permisos de usuario
    if (command.permisos && command.permisos.length > 0) {
      if (!message.member.permissions.has(command.permisos)) {
        return message.reply('❌ No tienes los permisos necesarios para ejecutar este comando.');
      }
    }

    // Comprobación de permisos del bot
    if (command.permisos_bot && command.permisos_bot.length > 0) {
      if (!message.guild.members.me.permissions.has(command.permisos_bot)) {
        return message.reply('❌ No tengo los permisos necesarios para ejecutar este comando.');
      }
    }

    try {
      await command.run(client, message, args, prefix);
    } catch (error) {
      console.error(`Error ejecutando el comando ${commandName}:`, error);
      message.reply('⚠️ Ocurrió un error al ejecutar el comando.');
    }
  }
};
