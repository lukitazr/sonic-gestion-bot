/**
 * Default system configuration constants and field mappings
 */

export const DEFAULT_CONFIG = {
  actorBase: 25.0,
  editorBase: 125.0,
  threshold1: 500000,
  bonus1: 25.0,
  threshold2: 1000000,
  bonus2: 25.0,
  currency: 'MXN',
  waitDays: 5,
  historyChannelId: null,
  adminChannelId: null,
  prefix: '!',
  youtubeChannelId: null,
  youtubeChannelUrl: null,
  youtubeChannelTitle: null,
  weeklySummaryEnabled: true,
  weeklySummaryDay: 5,
  weeklySummaryHour: 20,
  weeklySummaryMinute: 0,
  weeklySummaryChannelId: null,
  weeklySummaryDmUserId: null,
  weeklySummaryDmEnabled: false,
  lastWeeklySummaryAt: null
};

export const EMBED_COLORS = {
  PRIMARY: '#3498db',
  SUCCESS: '#2ecc71',
  WARNING: '#f39c12',
  ERROR: '#e74c3c',
  INFO: '#9b59b6',
  GOLD: '#ffd700'
};

/**
 * Normalization dictionary for config update keys
 */
export const CONFIG_KEY_ALIASES = {
  // Actor base fee
  actor: 'actorBase',
  actor_base: 'actorBase',
  actorbase: 'actorBase',
  actor_fee: 'actorBase',
  actorbasefee: 'actorBase',
  actorBase: 'actorBase',

  // Editor base fee
  editor: 'editorBase',
  editor_base: 'editorBase',
  editorbase: 'editorBase',
  editor_fee: 'editorBase',
  editorbasefee: 'editorBase',
  editorBase: 'editorBase',

  // Threshold 1 views
  umbral_1: 'threshold1',
  umbral1: 'threshold1',
  threshold_1: 'threshold1',
  threshold1: 'threshold1',
  vistas_umbral_1: 'threshold1',

  // Bonus 1 amount
  bono_500k: 'bonus1',
  bono500k: 'bonus1',
  bono_1: 'bonus1',
  bono1: 'bonus1',
  bonus_1: 'bonus1',
  bonus1: 'bonus1',

  // Threshold 2 views
  umbral_2: 'threshold2',
  umbral2: 'threshold2',
  threshold_2: 'threshold2',
  threshold2: 'threshold2',
  vistas_umbral_2: 'threshold2',

  // Bonus 2 amount
  bono_1m: 'bonus2',
  bono1m: 'bonus2',
  bono_2: 'bonus2',
  bono2: 'bonus2',
  bonus_2: 'bonus2',
  bonus2: 'bonus2',

  // Currency
  moneda: 'currency',
  divisa: 'currency',
  currency: 'currency',

  // Wait days before calculation
  dias_espera: 'waitDays',
  diasespera: 'waitDays',
  dias: 'waitDays',
  wait_days: 'waitDays',
  waitdays: 'waitDays',
  waitDays: 'waitDays',

  // Channel IDs
  canal_historial: 'historyChannelId',
  canalhistorial: 'historyChannelId',
  historial: 'historyChannelId',
  history_channel: 'historyChannelId',
  historychannel: 'historyChannelId',
  historyChannelId: 'historyChannelId',

  canal_admin: 'adminChannelId',
  canaladmin: 'adminChannelId',
  admin: 'adminChannelId',
  admin_channel: 'adminChannelId',
  adminchannel: 'adminChannelId',
  adminChannelId: 'adminChannelId',

  // Bot Prefix
  prefix: 'prefix',
  prefijo: 'prefix',
  bot_prefix: 'prefix',
  botprefix: 'prefix',
  cmd_prefix: 'prefix',
  cmdprefix: 'prefix',

  // YouTube Channel URL / ID
  canal_youtube: 'youtubeChannelUrl',
  canalyoutube: 'youtubeChannelUrl',
  youtube_canal: 'youtubeChannelUrl',
  youtubecanal: 'youtubeChannelUrl',
  youtube_channel: 'youtubeChannelUrl',
  youtubechannel: 'youtubeChannelUrl',
  yt_channel: 'youtubeChannelUrl',
  ytchannel: 'youtubeChannelUrl',
  youtubeChannelUrl: 'youtubeChannelUrl',

  // Weekly Summary Config
  resumen_dia: 'weeklySummaryDay',
  resumendia: 'weeklySummaryDay',
  dia_resumen: 'weeklySummaryDay',
  diaresumen: 'weeklySummaryDay',
  weekly_day: 'weeklySummaryDay',
  weeklyday: 'weeklySummaryDay',
  weeklySummaryDay: 'weeklySummaryDay',

  resumen_hora: 'weeklySummaryHour',
  resumenhora: 'weeklySummaryHour',
  hora_resumen: 'weeklySummaryHour',
  horaresumen: 'weeklySummaryHour',
  weekly_hour: 'weeklySummaryHour',
  weeklyhour: 'weeklySummaryHour',
  weeklySummaryHour: 'weeklySummaryHour',

  resumen_minuto: 'weeklySummaryMinute',
  resumenminuto: 'weeklySummaryMinute',
  weekly_minute: 'weeklySummaryMinute',
  weeklyminute: 'weeklySummaryMinute',
  weeklySummaryMinute: 'weeklySummaryMinute',

  resumen_activo: 'weeklySummaryEnabled',
  resumenactivo: 'weeklySummaryEnabled',
  weekly_summary_enabled: 'weeklySummaryEnabled',
  weeklySummaryEnabled: 'weeklySummaryEnabled',

  resumen_canal: 'weeklySummaryChannelId',
  resumencanal: 'weeklySummaryChannelId',
  canal_resumen: 'weeklySummaryChannelId',
  canalresumen: 'weeklySummaryChannelId',
  weekly_channel: 'weeklySummaryChannelId',
  weeklychannel: 'weeklySummaryChannelId',
  weeklySummaryChannelId: 'weeklySummaryChannelId',

  // Weekly Summary DM Delivery (Optional)
  resumen_md: 'weeklySummaryDmUserId',
  resumenmd: 'weeklySummaryDmUserId',
  md_resumen: 'weeklySummaryDmUserId',
  mdresumen: 'weeklySummaryDmUserId',
  weekly_dm: 'weeklySummaryDmUserId',
  weeklydm: 'weeklySummaryDmUserId',
  weekly_dm_user: 'weeklySummaryDmUserId',
  weeklySummaryDmUserId: 'weeklySummaryDmUserId',

  resumen_md_activo: 'weeklySummaryDmEnabled',
  resumenmdactivo: 'weeklySummaryDmEnabled',
  weekly_dm_enabled: 'weeklySummaryDmEnabled',
  weeklySummaryDmEnabled: 'weeklySummaryDmEnabled'
};

export const CONFIG_FIELD_META = {
  actorBase: {
    label: 'Tarifa Base Actor',
    type: 'float',
    min: 0,
    unit: 'currency'
  },
  editorBase: {
    label: 'Tarifa Base Editor',
    type: 'float',
    min: 0,
    unit: 'currency'
  },
  threshold1: {
    label: 'Umbral 1 (Vistas)',
    type: 'int',
    min: 1,
    unit: 'views'
  },
  bonus1: {
    label: 'Bono Umbral 1',
    type: 'float',
    min: 0,
    unit: 'currency'
  },
  threshold2: {
    label: 'Umbral 2 (Vistas)',
    type: 'int',
    min: 1,
    unit: 'views'
  },
  bonus2: {
    label: 'Bono Umbral 2',
    type: 'float',
    min: 0,
    unit: 'currency'
  },
  currency: {
    label: 'Moneda / Divisa',
    type: 'string',
    unit: 'text'
  },
  waitDays: {
    label: 'Días de Espera',
    type: 'int',
    min: 1,
    unit: 'days'
  },
  historyChannelId: {
    label: 'Canal de Historial',
    type: 'channel',
    unit: 'channel'
  },
  adminChannelId: {
    label: 'Canal de Administración',
    type: 'channel',
    unit: 'channel'
  },
  prefix: {
    label: 'Prefijo del Bot',
    type: 'prefix',
    unit: 'text'
  },
  youtubeChannelUrl: {
    label: 'Canal de YouTube',
    type: 'youtube_channel',
    unit: 'url'
  },
  weeklySummaryEnabled: {
    label: 'Resumen Semanal Activo',
    type: 'boolean',
    unit: 'switch'
  },
  weeklySummaryDay: {
    label: 'Día de Resumen Semanal (0=Dom, 5=Vie)',
    type: 'int',
    min: 0,
    max: 6,
    unit: 'day_of_week'
  },
  weeklySummaryHour: {
    label: 'Hora de Resumen Semanal (0-23)',
    type: 'int',
    min: 0,
    max: 23,
    unit: 'hour'
  },
  weeklySummaryMinute: {
    label: 'Minuto de Resumen Semanal (0-59)',
    type: 'int',
    min: 0,
    max: 59,
    unit: 'minute'
  },
  weeklySummaryChannelId: {
    label: 'Canal de Resumen Semanal',
    type: 'channel',
    unit: 'channel'
  },
  weeklySummaryDmUserId: {
    label: 'Usuario para MD de Resumen Semanal',
    type: 'user',
    unit: 'user'
  },
  weeklySummaryDmEnabled: {
    label: 'Envío de Resumen Semanal por MD Activo',
    type: 'boolean',
    unit: 'switch'
  }
};

