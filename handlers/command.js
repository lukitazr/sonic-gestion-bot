import { readdirSync } from 'fs';
import { pathToFileURL } from 'url';
import path from 'path';

export default async (client) => {
  const commandFolders = readdirSync('./commands');

  for (const folder of commandFolders) {
    const commandFiles = readdirSync(`./commands/${folder}`).filter(f => f.endsWith('.js'));

    for (const file of commandFiles) {
      const filePath = path.resolve(`./commands/${folder}/${file}`);
      const fileUrl = pathToFileURL(filePath).href;
      const command = (await import(fileUrl)).default;

      if (command && command.name) {
        client.commands.set(command.name, command);
        if (command.aliases && Array.isArray(command.aliases)) {
          for (const alias of command.aliases) {
            client.aliases.set(alias, command.name);
          }
        }
      }
    }
  }

  console.log(`[Handlers] Comandos cargados: ${client.commands.size}`);
};
