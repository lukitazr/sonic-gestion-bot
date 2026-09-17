import { describe, it, expect } from 'bun:test';
import canalesCmd from '../../commands/admin/canales.js';
import liquidarCmd from '../../commands/admin/liquidar.js';
import setTarifaCmd from '../../commands/admin/settarifa.js';
import tarifasCmd from '../../commands/admin/tarifas.js';
import ayudaCmd, { COMMANDS_REGISTRY } from '../../commands/info/ayuda.js';
import pingCmd from '../../commands/info/ping.js';
import miperfilCmd from '../../commands/talent/miperfil.js';
import registroCmd from '../../commands/talent/registro.js';
import registrarVideoCmd from '../../commands/video/registrarvideo.js';
import videosCmd from '../../commands/video/videos.js';

describe('Command Aliases & Enhanced Ayuda System', () => {
  const allCommands = [
    canalesCmd,
    liquidarCmd,
    setTarifaCmd,
    tarifasCmd,
    ayudaCmd,
    pingCmd,
    miperfilCmd,
    registroCmd,
    registrarVideoCmd,
    videosCmd
  ];

  it('1. should verify every command has a generous list of aliases (at least 6 aliases each)', () => {
    for (const cmd of allCommands) {
      expect(Array.isArray(cmd.aliases)).toBe(true);
      expect(cmd.aliases.length).toBeGreaterThanOrEqual(6);
      // Ensure no duplicate aliases within same command
      const uniqueAliases = new Set(cmd.aliases);
      expect(uniqueAliases.size).toBe(cmd.aliases.length);
    }
  });

  it('2. should verify specific key aliases for admin commands', () => {
    // canales
    expect(canalesCmd.aliases).toContain('channels');
    expect(canalesCmd.aliases).toContain('set-channels');
    expect(canalesCmd.aliases).toContain('canal');
    expect(canalesCmd.aliases).toContain('setup-canales');

    // liquidar
    expect(liquidarCmd.aliases).toContain('calcular');
    expect(liquidarCmd.aliases).toContain('forzar-calculo');
    expect(liquidarCmd.aliases).toContain('settle');
    expect(liquidarCmd.aliases).toContain('liquidacion');
    expect(liquidarCmd.aliases).toContain('liquidar-video');

    // set-tarifa
    expect(setTarifaCmd.aliases).toContain('settarifa');
    expect(setTarifaCmd.aliases).toContain('cambiar-tarifa');
    expect(setTarifaCmd.aliases).toContain('set-rate');
    expect(setTarifaCmd.aliases).toContain('set-price');

    // tarifas
    expect(tarifasCmd.aliases).toContain('tarifa');
    expect(tarifasCmd.aliases).toContain('rates');
    expect(tarifasCmd.aliases).toContain('precios');
    expect(tarifasCmd.aliases).toContain('pricing');
  });

  it('3. should verify specific key aliases for talent and video commands', () => {
    // registro
    expect(registroCmd.aliases).toContain('register');
    expect(registroCmd.aliases).toContain('signup');
    expect(registroCmd.aliases).toContain('perfil');
    expect(registroCmd.aliases).toContain('expediente');

    // miperfil
    expect(miperfilCmd.aliases).toContain('profile');
    expect(miperfilCmd.aliases).toContain('myprofile');
    expect(miperfilCmd.aliases).toContain('ver-perfil');
    expect(miperfilCmd.aliases).toContain('cuenta');

    // registrar-video
    expect(registrarVideoCmd.aliases).toContain('subir-video');
    expect(registrarVideoCmd.aliases).toContain('regvideo');
    expect(registrarVideoCmd.aliases).toContain('new-video');
    expect(registrarVideoCmd.aliases).toContain('add-video');

    // videos
    expect(videosCmd.aliases).toContain('pendientes');
    expect(videosCmd.aliases).toContain('list-videos');
    expect(videosCmd.aliases).toContain('listar-videos');
    expect(videosCmd.aliases).toContain('mis-videos');
  });

  it('4. should verify info commands aliases (ping, ayuda)', () => {
    expect(pingCmd.aliases).toContain('pong');
    expect(pingCmd.aliases).toContain('latency');
    expect(pingCmd.aliases).toContain('ms');

    expect(ayudaCmd.aliases).toContain('help');
    expect(ayudaCmd.aliases).toContain('commands');
    expect(ayudaCmd.aliases).toContain('guide');
    expect(ayudaCmd.aliases).toContain('info');
  });

  it('5. should display all aliases in the general !ayuda embed', async () => {
    let sentReply = null;
    const mockMessage = {
      reply: async (payload) => {
        sentReply = payload;
        return payload;
      }
    };

    await ayudaCmd.run({}, mockMessage, [], '!');

    expect(sentReply).not.toBeNull();
    const embed = sentReply.embeds[0];
    expect(embed.data.title).toContain('Guía de Comandos');

    const fullContent = embed.data.fields.map(f => f.value).join('\n');
    expect(fullContent).toContain('Alias:');
    expect(fullContent).toContain('!tarifas');
    expect(fullContent).toContain('!liquidar');
    expect(fullContent).toContain('!canales');
    expect(fullContent).toContain('!registro');
    expect(fullContent).toContain('!miperfil');
    expect(fullContent).toContain('!registrar-video');
    expect(fullContent).toContain('!videos');
    expect(fullContent).toContain('!ping');
    expect(fullContent).toContain('!ayuda');
  });

  it('6. should display detailed command help with all aliases when querying specific command or alias', async () => {
    let sentReply = null;
    const mockMessage = {
      reply: async (payload) => {
        sentReply = payload;
        return payload;
      }
    };

    // Query by primary name
    await ayudaCmd.run({}, mockMessage, ['liquidar'], '!');
    expect(sentReply).not.toBeNull();
    let embed = sentReply.embeds[0];
    expect(embed.data.title).toContain('!liquidar');
    expect(embed.data.fields.some(f => f.name.includes('Alias Reconocidos'))).toBe(true);

    // Query by alias
    await ayudaCmd.run({}, mockMessage, ['rates'], '!');
    expect(sentReply).not.toBeNull();
    embed = sentReply.embeds[0];
    expect(embed.data.title).toContain('!tarifas');
    expect(embed.data.description).toContain('tarifas base');

    // Query invalid command
    let textReply = null;
    const mockMsgInvalid = {
      reply: async (content) => {
        textReply = content;
        return content;
      }
    };
    await ayudaCmd.run({}, mockMsgInvalid, ['comando_inexistente_123'], '!');
    expect(textReply).toContain('No se encontró ningún comando o alias');
  });
});
