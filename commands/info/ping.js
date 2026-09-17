export default {
  name: 'ping',
  aliases: ['p', 'latencia', 'pong', 'latency', 'ms', 'lag', 'test', 'speed'],
  desc: 'Muestra la latencia del bot con Discord y el WebSocket.',
  permisos: [],
  permisos_bot: [],
  run: async (client, message, args, prefix) => {
    const reply = await message.reply('🏓 Calculando ping...');
    const ping = reply.createdTimestamp - message.createdTimestamp;
    reply.edit(`🏓 Pong! Latencia del mensaje: **${ping}ms** | WebSocket: **${client.ws.ping}ms**`);
  }
};
