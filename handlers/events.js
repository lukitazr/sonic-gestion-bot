import { readdirSync } from 'fs';
import { pathToFileURL } from 'url';
import path from 'path';

export default async (client) => {
  const eventFolders = readdirSync('./events');

  for (const folder of eventFolders) {
    const eventFiles = readdirSync(`./events/${folder}`).filter(f => f.endsWith('.js'));

    for (const file of eventFiles) {
      const filePath = path.resolve(`./events/${folder}/${file}`);
      const fileUrl = pathToFileURL(filePath).href;
      const event = (await import(fileUrl)).default;

      if (event && event.name) {
        if (event.once) {
          client.once(event.name, (...args) => event.run(client, ...args));
        } else {
          client.on(event.name, (...args) => event.run(client, ...args));
        }
      }
    }
  }

  console.log('[Handlers] Eventos registrados con éxito.');
};
