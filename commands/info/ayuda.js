import { EmbedBuilder, PermissionFlagsBits } from 'discord.js';
import { EMBED_COLORS } from '../../src/config/constants.js';

export const COMMANDS_REGISTRY = [
  {
    name: 'setup',
    category: '👑 Administración y Tarifas',
    desc: 'Asistente interactivo guiado para configurar todos los parámetros variables del bot en una sola sucesión.',
    usage: 'setup',
    aliases: [
      'config-setup', 'setup-bot', 'inicializar', 'configurar',
      'config-wizard', 'wizard', 'bot-setup', 'asistente-config',
      'configuracion-inicial', 'setupbot'
    ],
    examples: ['setup', 'config-setup', 'wizard'],
    permisosText: '👑 Administrador'
  },
  {
    name: 'tarifas',
    category: '👑 Administración y Tarifas',
    desc: 'Muestra la tabla interactiva de tarifas base, bonos por metas, umbrales y plazos activos con botones de edición.',
    usage: 'tarifas',
    aliases: [
      'config-tarifas', 'ver-tarifas', 'editar-tarifas', 'config-tarifa',
      'tarifa', 'precios', 'precio', 'tasas', 'tasa',
      'rates', 'rate', 'pricing', 'fees', 'fee',
      'vertarifas', 'configtarifas', 'editartarifas', 'panel-tarifas', 'tarifas-panel'
    ],
    examples: ['tarifas', 'rates', 'precios', 'ver-tarifas'],
    permisosText: '👑 Administrador'
  },
  {
    name: 'set-tarifa',
    category: '👑 Administración y Tarifas',
    desc: 'Actualiza dinámicamente un parámetro específico de tarifa, bono, umbral o plazo sin reiniciar el bot.',
    usage: 'set-tarifa <parámetro> <nuevo_valor>',
    aliases: [
      'settarifa', 'config-tarifa', 'cambiar-tarifa', 'modificar-tarifa',
      'set-tarifas', 'settarifas', 'editar-tarifa', 'editartarifa',
      'set-rate', 'setrate', 'set-price', 'setprice',
      'update-tarifa', 'updatetarifa', 'set-fee', 'setfee'
    ],
    examples: [
      'set-tarifa actor_base 30',
      'set-tarifa editor_base 150',
      'set-tarifa bono_500k 35',
      'set-tarifa umbral_1 600000'
    ],
    permisosText: '👑 Administrador'
  },
  {
    name: 'canales',
    category: '👑 Administración y Tarifas',
    desc: 'Interfaz interactiva con selectores para configurar los canales de historial y administración en la base de datos.',
    usage: 'canales',
    aliases: [
      'set-canales', 'config-canales', 'setcanales', 'canales-config',
      'canal', 'canales-bot', 'config-canal', 'configcanales',
      'setup-canales', 'setupcanales', 'channels', 'channel',
      'set-channels', 'setchannels', 'config-channels', 'channel-config', 'configchannels'
    ],
    examples: ['canales', 'channels', 'config-canales', 'setup-canales'],
    permisosText: '👑 Administrador'
  },
  {
    name: 'liquidar',
    category: '👑 Administración y Tarifas',
    desc: 'Fuerza el cálculo y liquidación inmediata de un video pendiente, despachando la orden de pago con links y DMs.',
    usage: 'liquidar <id_video_o_url>',
    aliases: [
      'forzar-calculo', 'liquidar-video', 'calcular-video',
      'checkout', 'settle', 'settle-video', 'force-settle',
      'calcular', 'calcularvideo', 'liquidarvideo', 'liquidacion',
      'liquidar-manual', 'forzar-liquidar'
    ],
    examples: [
      'liquidar dQw4w9WgXcQ',
      'liquidar https://youtu.be/dQw4w9WgXcQ'
    ],
    permisosText: '👑 Administrador'
  },
  {
    name: 'pagar',
    category: '👑 Administración y Tarifas',
    desc: 'Marca un video liquidado como pagado (PAID), actualizando el registro y la orden de pago en administración.',
    usage: 'pagar <id_video_o_url>',
    aliases: [
      'marcar-pagado', 'marcarpagado', 'pagado',
      'mark-paid', 'set-paid', 'pagar-video', 'pago'
    ],
    examples: [
      'pagar dQw4w9WgXcQ',
      'marcar-pagado https://youtu.be/dQw4w9WgXcQ'
    ],
    permisosText: '👑 Administrador'
  },
  {
    name: 'admin-registro',
    category: '👑 Administración y Tarifas',
    desc: 'Panel administrativo interactivo con selector de miembros y formulario modal para registrar, editar y gestionar talentos directamente.',
    usage: 'admin-registro [@usuario]',
    aliases: [
      'adminregistro', 'reg-talento', 'regtalento', 'registrar-talento-admin',
      'admin-talento', 'admintalento', 'adm-registro', 'crear-talento', 'creartalento',
      'talento-admin', 'gestionar-talento', 'gestion-talentos'
    ],
    examples: [
      'admin-registro',
      'adminregistro @usuario',
      'reg-talento'
    ],
    permisosText: '👑 Administrador'
  },
  {
    name: 'prefix',
    category: '👑 Administración y Tarifas',
    desc: 'Modifica o restablece el prefijo de comandos del bot mediante argumento directo o interfaz gráfica.',
    usage: 'prefix [nuevo_prefix]',
    aliases: [
      'set-prefix', 'setprefix', 'cambiar-prefix', 'cambiarprefix', 'modificar-prefix',
      'prefijo', 'set-prefijo', 'setprefijo', 'cambiar-prefijo', 'bot-prefix', 'prefix-bot'
    ],
    examples: ['prefix', 'prefix !', 'prefix ?', 'prefijo $'],
    permisosText: '👑 Administrador'
  },
  {
    name: 'set-canal',
    category: '👑 Administración y Tarifas',
    desc: 'Vincula el canal de YouTube oficial para autocompletar los últimos 25 videos en el selector interactivo de registro.',
    usage: 'set-canal [url_o_handle_de_youtube]',
    aliases: [
      'setcanal', 'canal-yt', 'canalyt', 'youtube-canal', 'youtubecanal',
      'set-youtube', 'setyoutube', 'yt-canal', 'ytcanal', 'vincular-canal',
      'vincularcanal', 'config-canal-yt'
    ],
    examples: [
      'set-canal',
      'set-canal @SonicTheHedgehog',
      'set-canal https://www.youtube.com/@SonicTheHedgehog',
      'canal-yt UC...'
    ],
    permisosText: '👑 Administrador'
  },
  {
    name: 'resumen-semanal',
    category: '👑 Administración y Tarifas',
    desc: 'Panel de control, vista previa y emisión del resumen semanal de liquidaciones con links de pago y ping a @everyone.',
    usage: 'resumen-semanal [enviar | preview | config <dia> <hora> [minuto]]',
    aliases: [
      'resumen', 'semanal', 'weekly-summary', 'weeklysummary',
      'resumensemanal', 'resumen_semanal'
    ],
    examples: [
      'resumen-semanal',
      'resumen-semanal enviar',
      'resumen-semanal preview',
      'resumen-semanal config viernes 20',
      'resumen-semanal config 5 18 30'
    ],
    permisosText: '👑 Administrador'
  },
  {
    name: 'registro',
    category: '🎭 Expedientes de Talentos',
    desc: 'Registra o actualiza el expediente de talento con rol (Actor/Editor) y métodos de pago (PayPal/Binance). Soporta interfaz gráfica.',
    usage: 'registro [ACTOR|EDITOR] [paypal] [binance]',
    aliases: [
      'perfil', 'registrar-talento', 'expediente', 'registrar-expediente',
      'registrar', 'registrarse', 'register', 'signup',
      'perfil-registro', 'registrartalento', 'registrarexpediente',
      'mi-registro', 'miregistro', 'talento-registro', 'vincular-pago', 'datos-pago'
    ],
    examples: [
      'registro',
      'registro ACTOR micorreo@gmail.com 12345678',
      'registro EDITOR paypal.me/miusuario'
    ],
    permisosText: '🟢 Todos los miembros'
  },
  {
    name: 'miperfil',
    category: '🎭 Expedientes de Talentos',
    desc: 'Muestra tu expediente de talento registrado, rol, links de pago y estado de cuenta, o el de otro miembro mencionado.',
    usage: 'miperfil [@usuario]',
    aliases: [
      'mi-perfil', 'perfil-ver', 'ver-perfil', 'mi-expediente',
      'profile', 'myprofile', 'my-profile', 'verperfil',
      'perfilver', 'miexpediente', 'ver-expediente', 'verexpediente',
      'mis-datos', 'misdatos', 'datos', 'cuenta', 'mi-cuenta', 'micuenta'
    ],
    examples: ['miperfil', 'profile', 'ver-perfil @usuario', 'misdatos'],
    permisosText: '🟢 Todos los miembros'
  },
  {
    name: 'registrar-video',
    category: '🎬 Registro y Gestión de Videos',
    desc: 'Registra un video de YouTube para seguimiento a 5 días y posterior liquidación. Soporta interfaz gráfica con selector de usuarios.',
    usage: 'registrar-video [url_youtube] [@editor] [@actor1...]',
    aliases: [
      'registrarvideo', 'nuevo-video', 'nuevo_video', 'regvideo', 'subir-video',
      'reg-video', 'nuevovideo', 'subirvideo', 'add-video', 'addvideo',
      'new-video', 'newvideo', 'video-nuevo', 'videonuevo',
      'registrar-yt', 'subir-yt', 'registro-video', 'registrovideo'
    ],
    examples: [
      'registrar-video',
      'registrar-video https://youtu.be/dQw4w9WgXcQ @actor1',
      'regvideo https://youtu.be/dQw4w9WgXcQ @editor @actor1 @actor2'
    ],
    permisosText: '🛡️ Gestionar Mensajes / Admin'
  },
  {
    name: 'videos',
    category: '🎬 Registro y Gestión de Videos',
    desc: 'Muestra la lista de videos registrados en el sistema, con filtros opcionales por estado (pendientes, calculados, pagados o todos).',
    usage: 'videos [pendientes|calculados|pagados|todos]',
    aliases: [
      'listar-videos', 'pendientes', 'mis-videos', 'listavideos',
      'video', 'list-videos', 'listvideos', 'listarvideos',
      'ver-videos', 'vervideos', 'videos-pendientes', 'videospendientes',
      'videos-lista', 'historial-videos', 'misvideos', 'all-videos'
    ],
    examples: ['videos', 'pendientes', 'videos calculados', 'list-videos'],
    permisosText: '🟢 Todos los miembros'
  },
  {
    name: 'ping',
    category: 'ℹ️ Información General',
    desc: 'Comprueba la latencia del bot con Discord y el estado de la conexión WebSocket.',
    usage: 'ping',
    aliases: ['p', 'latencia', 'pong', 'latency', 'ms', 'lag', 'test', 'speed'],
    examples: ['ping', 'p', 'latencia', 'ms'],
    permisosText: '🟢 Todos los miembros'
  },
  {
    name: 'ayuda',
    category: 'ℹ️ Información General',
    desc: 'Muestra la guía completa de comandos con sus alias o la información detallada de un comando en particular.',
    usage: 'ayuda [comando_o_alias]',
    aliases: [
      'help', 'comandos', 'guide', 'menu',
      'h', 'info', 'manual', 'guia', 'cmd', 'cmds', 'commands',
      'bot-ayuda', 'ayudabot'
    ],
    examples: ['ayuda', 'help liquidar', 'comandos registrar-video', 'info tarifas'],
    permisosText: '🟢 Todos los miembros'
  }
];

export default {
  name: 'ayuda',
  aliases: [
    'help', 'comandos', 'guide', 'menu',
    'h', 'info', 'manual', 'guia', 'cmd', 'cmds', 'commands',
    'bot-ayuda', 'ayudabot'
  ],
  desc: 'Muestra la lista de todos los comandos disponibles con sus alias organizados por categoría.',
  permisos: [],
  permisos_bot: [PermissionFlagsBits.SendMessages, PermissionFlagsBits.EmbedLinks],
  run: async (client, message, args, prefix) => {
    const currentPrefix = prefix || '!';

    // 1. Si se solicita ayuda de un comando o alias específico: !ayuda <comando>
    if (args && args.length > 0) {
      const query = args[0].toLowerCase().replace(new RegExp(`^${currentPrefix}`, 'i'), '').trim();
      const foundCmd = COMMANDS_REGISTRY.find(c => c.name === query || c.aliases.includes(query));

      if (foundCmd) {
        const detailEmbed = new EmbedBuilder()
          .setTitle(`📖 Comando: \`${currentPrefix}${foundCmd.name}\``)
          .setColor(EMBED_COLORS.PRIMARY)
          .setDescription(foundCmd.desc)
          .addFields(
            {
              name: '📌 Uso / Sintaxis',
              value: `\`${currentPrefix}${foundCmd.usage}\``,
              inline: false
            },
            {
              name: `🏷️ Alias Reconocidos (${foundCmd.aliases.length})`,
              value: foundCmd.aliases.map(a => `\`${currentPrefix}${a}\``).join(', '),
              inline: false
            },
            {
              name: '💡 Ejemplos de Uso',
              value: foundCmd.examples.map(ex => `• \`${currentPrefix}${ex}\``).join('\n'),
              inline: false
            },
            {
              name: '🔒 Permisos Requeridos',
              value: foundCmd.permisosText,
              inline: true
            },
            {
              name: '📂 Categoría',
              value: foundCmd.category,
              inline: true
            }
          )
          .setFooter({ text: `Sonic Gestión Bot • Usa ${currentPrefix}ayuda para ver todos los comandos` })
          .setTimestamp();

        return message.reply({ embeds: [detailEmbed] });
      } else {
        return message.reply(
          `❌ No se encontró ningún comando o alias con el nombre \`${query}\`.\n` +
          `Escribe \`${currentPrefix}ayuda\` para consultar todos los comandos y alias disponibles.`
        );
      }
    }

    // 2. Menú general de ayuda categorizado con representación de alias
    const helpEmbed = new EmbedBuilder()
      .setTitle('📚 Guía de Comandos • Sonic Gestión Bot')
      .setColor(EMBED_COLORS.PRIMARY)
      .setDescription(
        `Sistema automatizado para la gestión de talentos, registro de videos de YouTube y liquidación por rendimiento de vistas.\n\n` +
        `**Prefijo activo:** \`${currentPrefix}\` • **Ayuda detallada:** \`${currentPrefix}ayuda <comando_o_alias>\``
      )
      .addFields(
        {
          name: '👑 Administración y Tarifas *(Sólo Administradores)*',
          value:
            `• \`${currentPrefix}setup\`: Asistente interactivo de configuración global.\n` +
            `  ↳ *Alias:* \`${currentPrefix}config-setup\`, \`${currentPrefix}wizard\`, \`${currentPrefix}inicializar\`...\n` +
            `• \`${currentPrefix}tarifas\`: Consulta y edita tarifas, bonos y plazos.\n` +
            `  ↳ *Alias:* \`${currentPrefix}tarifa\`, \`${currentPrefix}precios\`, \`${currentPrefix}rates\`...\n` +
            `• \`${currentPrefix}set-tarifa <parám> <valor>\`: Modifica un parámetro.\n` +
            `  ↳ *Alias:* \`${currentPrefix}settarifa\`, \`${currentPrefix}cambiar-tarifa\`...\n` +
            `• \`${currentPrefix}canales\`: Interfaz para configurar canales en la BD.\n` +
            `  ↳ *Alias:* \`${currentPrefix}set-canales\`, \`${currentPrefix}canal\`...\n` +
            `• \`${currentPrefix}prefix [nuevo]\`: Modifica o restablece el prefijo.\n` +
            `  ↳ *Alias:* \`${currentPrefix}set-prefix\`, \`${currentPrefix}prefijo\`...\n` +
            `• \`${currentPrefix}set-canal [url]\`: Vincula el canal de YouTube.\n` +
            `  ↳ *Alias:* \`${currentPrefix}setcanal\`, \`${currentPrefix}canal-yt\`...\n` +
            `• \`${currentPrefix}liquidar <id>\`: Fuerza el cálculo y liquidación.\n` +
            `  ↳ *Alias:* \`${currentPrefix}pagar\`, \`${currentPrefix}checkout\`...\n` +
            `• \`${currentPrefix}admin-registro [@user]\`: Panel de gestión de talentos.\n` +
            `  ↳ *Alias:* \`${currentPrefix}adminregistro\`, \`${currentPrefix}reg-talento\`...`,
          inline: false
        },
        {
          name: '🎭 Expedientes de Talentos',
          value:
            `• \`${currentPrefix}registro [ACTOR|EDITOR] [paypal] [binance]\`: Registra o actualiza tu perfil y métodos de pago.\n` +
            `  ↳ *Alias:* \`${currentPrefix}perfil\`, \`${currentPrefix}registrar\`, \`${currentPrefix}register\`, \`${currentPrefix}expediente\`, \`${currentPrefix}signup\`...\n` +
            `• \`${currentPrefix}miperfil [@usuario]\`: Consulta tus datos de talento registrados o los de otro miembro.\n` +
            `  ↳ *Alias:* \`${currentPrefix}mi-perfil\`, \`${currentPrefix}profile\`, \`${currentPrefix}ver-perfil\`, \`${currentPrefix}mis-datos\`, \`${currentPrefix}cuenta\`...`,
          inline: false
        },
        {
          name: '🎬 Registro y Gestión de Videos',
          value:
            `• \`${currentPrefix}registrar-video [url] [@editor] [@actores...]\`: Registra un video con interfaz gráfica o comando.\n` +
            `  ↳ *Alias:* \`${currentPrefix}registrarvideo\`, \`${currentPrefix}nuevo-video\`, \`${currentPrefix}subir-video\`, \`${currentPrefix}regvideo\`, \`${currentPrefix}add-video\`...\n` +
            `• \`${currentPrefix}videos [pendientes|calculados|pagados|todos]\`: Lista los videos registrados y su estado actual.\n` +
            `  ↳ *Alias:* \`${currentPrefix}video\`, \`${currentPrefix}listar-videos\`, \`${currentPrefix}pendientes\`, \`${currentPrefix}list-videos\`, \`${currentPrefix}ver-videos\`...`,
          inline: false
        },
        {
          name: 'ℹ️ Información General',
          value:
            `• \`${currentPrefix}ping\`: Comprueba la latencia del bot con Discord y el WebSocket.\n` +
            `  ↳ *Alias:* \`${currentPrefix}p\`, \`${currentPrefix}latencia\`, \`${currentPrefix}pong\`, \`${currentPrefix}latency\`, \`${currentPrefix}ms\`, \`${currentPrefix}lag\`...\n` +
            `• \`${currentPrefix}ayuda [comando_o_alias]\`: Muestra este menú informativo o los detalles y todos los alias de un comando.\n` +
            `  ↳ *Alias:* \`${currentPrefix}help\`, \`${currentPrefix}comandos\`, \`${currentPrefix}guide\`, \`${currentPrefix}menu\`, \`${currentPrefix}commands\`, \`${currentPrefix}info\`...`,
          inline: false
        }
      )
      .setFooter({ text: 'Sonic Gestión Bot • Automatización y Rendimiento' })
      .setTimestamp();

    return message.reply({ embeds: [helpEmbed] });
  }
};
