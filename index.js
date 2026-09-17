import * as Discord from "discord.js";
import { readdirSync } from "fs";
import dotenv from "dotenv";

dotenv.config();

const client = new Discord.Client({
  intents: [
    Discord.GatewayIntentBits.Guilds,
    Discord.GatewayIntentBits.GuildMembers,
    Discord.GatewayIntentBits.GuildMessages,
    Discord.GatewayIntentBits.MessageContent,
    Discord.GatewayIntentBits.GuildMessageReactions
  ],
  partials: [
    Discord.Partials.Channel,
    Discord.Partials.Message,
    Discord.Partials.GuildMember,
    Discord.Partials.Reaction
  ],
});

client.commands = new Discord.Collection();
client.aliases = new Discord.Collection();
client.color = "#ff0000";

const init = async () => {
  const handlers = readdirSync('./handlers').filter(f => f.endsWith('.js'));
  for (const handler of handlers) {
    const handlerModule = await import(`./handlers/${handler}`);
    await handlerModule.default(client);
  }
  
  if (!process.env.BOT_TOKEN) {
    console.error("Error: BOT_TOKEN no definido en el archivo .env");
    process.exit(1);
  }

  client.login(process.env.BOT_TOKEN);
};

init();
