import { prisma } from '../database/prisma.js';
import { DEFAULT_CONFIG, CONFIG_KEY_ALIASES, CONFIG_FIELD_META } from '../config/constants.js';

export class ConfigService {
  static cachedConfig = null;

  /**
   * Initializes the configuration from SQLite.
   * If no config exists, auto-seeds default row ($25 Actor, $125 Editor, $25 @ 500k, $25 @ 1M, MXN, 5 days).
   * @returns {Promise<Object>}
   */
  static async init() {
    try {
      this.cachedConfig = null;
      let config = await prisma.config.findFirst({
        where: { id: 1 }
      });

      if (!config) {
        config = await prisma.config.upsert({
          where: { id: 1 },
          update: {},
          create: {
            id: 1,
            actorBase: DEFAULT_CONFIG.actorBase,
            editorBase: DEFAULT_CONFIG.editorBase,
            threshold1: DEFAULT_CONFIG.threshold1,
            bonus1: DEFAULT_CONFIG.bonus1,
            threshold2: DEFAULT_CONFIG.threshold2,
            bonus2: DEFAULT_CONFIG.bonus2,
            currency: DEFAULT_CONFIG.currency,
            waitDays: DEFAULT_CONFIG.waitDays,
            prefix: DEFAULT_CONFIG.prefix,
            youtubeChannelId: DEFAULT_CONFIG.youtubeChannelId,
            youtubeChannelUrl: DEFAULT_CONFIG.youtubeChannelUrl,
            youtubeChannelTitle: DEFAULT_CONFIG.youtubeChannelTitle,
            weeklySummaryEnabled: DEFAULT_CONFIG.weeklySummaryEnabled,
            weeklySummaryDay: DEFAULT_CONFIG.weeklySummaryDay,
            weeklySummaryHour: DEFAULT_CONFIG.weeklySummaryHour,
            weeklySummaryMinute: DEFAULT_CONFIG.weeklySummaryMinute,
            weeklySummaryChannelId: DEFAULT_CONFIG.weeklySummaryChannelId,
            weeklySummaryDmUserId: DEFAULT_CONFIG.weeklySummaryDmUserId,
            weeklySummaryDmEnabled: DEFAULT_CONFIG.weeklySummaryDmEnabled,
            lastWeeklySummaryAt: DEFAULT_CONFIG.lastWeeklySummaryAt
          }
        });
      }

      this.cachedConfig = config;
      return config;
    } catch (error) {
      console.error('Error initializing ConfigService:', error);
      throw error;
    }
  }

  /**
   * Returns current active configuration (cached in-memory with DB fallback).
   * @param {boolean} [forceRefresh=false]
   * @returns {Promise<Object>}
   */
  static async getConfig(forceRefresh = false) {
    if (this.cachedConfig && !forceRefresh) {
      return this.cachedConfig;
    }
    return await this.init();
  }

  /**
   * Updates a single configuration parameter dynamically.
   * Normalizes key, validates bounds, saves to SQLite via Prisma,
   * invalidates/updates cache immediately, and returns change details.
   * 
   * @param {string} rawKey Key to update (e.g. 'actor_base', 'bono_500k', 'dias_espera')
   * @param {string|number} rawValue New value
   * @returns {Promise<{ key: string, rawKey: string, oldValue: any, newValue: any, meta: Object, config: Object }>}
   */
  static async updateConfig(rawKey, rawValue) {
    if (!rawKey || typeof rawKey !== 'string') {
      throw new Error('Debes especificar un parámetro válido para actualizar.');
    }

    if (rawValue === undefined || rawValue === null || rawValue === '') {
      throw new Error('Debes proporcionar un nuevo valor.');
    }

    const cleanKey = rawKey.trim().toLowerCase();
    const normalizedKey = CONFIG_KEY_ALIASES[cleanKey] || CONFIG_KEY_ALIASES[rawKey.trim()] || rawKey.trim();

    const meta = CONFIG_FIELD_META[normalizedKey];
    if (!meta) {
      const validOptions = Object.keys(CONFIG_FIELD_META).join(', ');
      throw new Error(`Parámetro desconocido: "${rawKey}". Opciones válidas: ${validOptions}`);
    }

    let parsedValue;
    if (meta.type === 'int') {
      if (typeof rawValue === 'number') {
        if (!Number.isInteger(rawValue) || isNaN(rawValue) || !isFinite(rawValue)) {
          throw new Error(`El parámetro "${meta.label}" requiere un número entero válido.`);
        }
        parsedValue = rawValue;
      } else if (typeof rawValue === 'string') {
        const trimmed = rawValue.trim();
        if (trimmed.length === 0 || !/^-?\d+$/.test(trimmed)) {
          throw new Error(`El parámetro "${meta.label}" requiere un número entero válido.`);
        }
        const num = Number(trimmed);
        if (isNaN(num) || !Number.isInteger(num)) {
          throw new Error(`El parámetro "${meta.label}" requiere un número entero válido.`);
        }
        parsedValue = num;
      } else {
        throw new Error(`El parámetro "${meta.label}" requiere un número entero válido.`);
      }

      if (meta.min !== undefined && parsedValue < meta.min) {
        throw new Error(`El valor para "${meta.label}" no puede ser menor que ${meta.min}.`);
      }
      if (meta.max !== undefined && parsedValue > meta.max) {
        throw new Error(`El valor para "${meta.label}" no puede ser mayor que ${meta.max}.`);
      }
    } else if (meta.type === 'boolean') {
      if (typeof rawValue === 'boolean') {
        parsedValue = rawValue;
      } else if (typeof rawValue === 'string') {
        const val = rawValue.trim().toLowerCase();
        if (['true', '1', 'si', 'sí', 'yes', 'on', 'activado', 'activo'].includes(val)) {
          parsedValue = true;
        } else if (['false', '0', 'no', 'off', 'desactivado', 'inactivo'].includes(val)) {
          parsedValue = false;
        } else {
          throw new Error(`El parámetro "${meta.label}" requiere un valor booleano (si/no, activo/inactivo).`);
        }
      } else {
        parsedValue = Boolean(rawValue);
      }
    } else if (meta.type === 'float') {
      if (typeof rawValue === 'number') {
        if (isNaN(rawValue) || !isFinite(rawValue)) {
          throw new Error(`El parámetro "${meta.label}" requiere un número decimal o entero válido.`);
        }
        parsedValue = Number(rawValue.toFixed(2));
      } else if (typeof rawValue === 'string') {
        const trimmed = rawValue.trim();
        if (trimmed.length === 0 || !/^-?\d+(\.\d+)?$/.test(trimmed)) {
          throw new Error(`El parámetro "${meta.label}" requiere un número decimal o entero válido.`);
        }
        const num = Number(trimmed);
        if (isNaN(num) || !isFinite(num)) {
          throw new Error(`El parámetro "${meta.label}" requiere un número decimal o entero válido.`);
        }
        parsedValue = Number(num.toFixed(2));
      } else {
        throw new Error(`El parámetro "${meta.label}" requiere un número decimal o entero válido.`);
      }

      if (meta.min !== undefined && parsedValue < meta.min) {
        throw new Error(`El valor para "${meta.label}" no puede ser menor que ${meta.min}.`);
      }
    } else if (meta.type === 'channel') {
      const trimmed = typeof rawValue === 'string' ? rawValue.trim() : String(rawValue).trim();
      const cleanId = trimmed.replace(/^<#/, '').replace(/>$/, '').trim();
      if (!/^\d{16,21}$/.test(cleanId)) {
        throw new Error(`El parámetro "${meta.label}" requiere un canal válido de Discord (#canal o ID numérico).`);
      }
      parsedValue = cleanId;
    } else if (meta.type === 'prefix') {
      const trimmed = typeof rawValue === 'string' ? rawValue.trim() : String(rawValue).trim();
      if (!trimmed || trimmed.length === 0) {
        throw new Error('El prefijo no puede estar vacío.');
      }
      if (trimmed.length > 5) {
        throw new Error('El prefijo no puede tener más de 5 caracteres.');
      }
      if (/\s/.test(trimmed)) {
        throw new Error('El prefijo no puede contener espacios en blanco.');
      }
      if (trimmed.includes('<@') || trimmed.includes('<#') || trimmed.includes('<:')) {
        throw new Error('El prefijo no puede contener menciones ni emojis personalizados.');
      }
      parsedValue = trimmed;
    } else if (meta.type === 'youtube_channel') {
      const trimmed = typeof rawValue === 'string' ? rawValue.trim() : String(rawValue).trim();
      if (!trimmed || trimmed.length === 0) {
        throw new Error('El enlace o identificador del canal de YouTube no puede estar vacío.');
      }
      parsedValue = trimmed;
    } else if (meta.type === 'user') {
      const trimmed = typeof rawValue === 'string' ? rawValue.trim() : String(rawValue).trim();
      const cleanId = trimmed.replace(/^<@!?/, '').replace(/>$/, '').trim();
      if (!/^\d{16,21}$/.test(cleanId)) {
        throw new Error(`El parámetro "${meta.label}" requiere un usuario válido de Discord (@usuario o ID numérico).`);
      }
      parsedValue = cleanId;
    } else {
      const trimmed = typeof rawValue === 'string' ? rawValue.trim() : String(rawValue).trim();
      parsedValue = trimmed.toUpperCase();
      if (parsedValue.length === 0) {
        throw new Error(`El parámetro "${meta.label}" no puede estar vacío.`);
      }
    }

    // Get current config for comparison and validation
    const currentConfig = await this.getConfig();
    const oldValue = currentConfig[normalizedKey];

    // Boundary validations between thresholds
    if (normalizedKey === 'threshold1' && parsedValue >= currentConfig.threshold2) {
      throw new Error(`El Umbral 1 (${parsedValue.toLocaleString()} vistas) no puede ser mayor o igual que el Umbral 2 (${currentConfig.threshold2.toLocaleString()} vistas).`);
    }
    if (normalizedKey === 'threshold2' && parsedValue <= currentConfig.threshold1) {
      throw new Error(`El Umbral 2 (${parsedValue.toLocaleString()} vistas) no puede ser menor o igual que el Umbral 1 (${currentConfig.threshold1.toLocaleString()} vistas).`);
    }

    // Update in database
    const updatedConfig = await prisma.config.upsert({
      where: { id: 1 },
      update: {
        [normalizedKey]: parsedValue
      },
      create: {
        id: 1,
        ...DEFAULT_CONFIG,
        [normalizedKey]: parsedValue
      }
    });

    // Invalidate and update cache immediately
    this.cachedConfig = updatedConfig;

    return {
      key: normalizedKey,
      rawKey,
      oldValue,
      newValue: parsedValue,
      meta,
      config: updatedConfig
    };
  }

  /**
   * Fast synchronous cached prefix reader with fallback to environment or default '!'.
   * @returns {string}
   */
  static getPrefix() {
    return this.cachedConfig?.prefix || process.env.PREFIX || '!';
  }

  /**
   * Updates configured YouTube channel information in Config table.
   * @param {{ channelId: string, url: string, title: string }} channelData
   * @returns {Promise<Object>}
   */
  static async setYoutubeChannel({ channelId, url, title }) {
    const updated = await prisma.config.upsert({
      where: { id: 1 },
      update: {
        youtubeChannelId: channelId,
        youtubeChannelUrl: url,
        youtubeChannelTitle: title
      },
      create: {
        ...DEFAULT_CONFIG,
        youtubeChannelId: channelId,
        youtubeChannelUrl: url,
        youtubeChannelTitle: title
      }
    });
    this.cachedConfig = updated;
    return updated;
  }

  /**
   * Validates and saves a full configuration payload in a single atomic database operation.
   * Used by the !setup interactive wizard.
   * @param {Object} fullData
   * @returns {Promise<Object>}
   */
  static async saveFullConfig(fullData) {
    const dataToSave = {};

    // 1. Prefix
    if (fullData.prefix !== undefined) {
      const trimmedPrefix = String(fullData.prefix).trim();
      if (!trimmedPrefix || trimmedPrefix.length > 5 || /\s/.test(trimmedPrefix) || trimmedPrefix.includes('<@')) {
        throw new Error('El prefijo debe tener entre 1 y 5 caracteres sin espacios ni menciones.');
      }
      dataToSave.prefix = trimmedPrefix;
    }

    // 2. Channels
    if (fullData.historyChannelId !== undefined) {
      dataToSave.historyChannelId = fullData.historyChannelId || null;
    }
    if (fullData.adminChannelId !== undefined) {
      dataToSave.adminChannelId = fullData.adminChannelId || null;
    }

    // 3. YouTube Channel
    if (fullData.youtubeChannelUrl !== undefined) {
      dataToSave.youtubeChannelUrl = fullData.youtubeChannelUrl || null;
      dataToSave.youtubeChannelId = fullData.youtubeChannelId || null;
      dataToSave.youtubeChannelTitle = fullData.youtubeChannelTitle || null;
    }

    // 4. Base Rates
    if (fullData.actorBase !== undefined) {
      const actorBase = Number(fullData.actorBase);
      if (isNaN(actorBase) || actorBase < 0) throw new Error('La tarifa base del actor debe ser un número mayor o igual a 0.');
      dataToSave.actorBase = Number(actorBase.toFixed(2));
    }
    if (fullData.editorBase !== undefined) {
      const editorBase = Number(fullData.editorBase);
      if (isNaN(editorBase) || editorBase < 0) throw new Error('La tarifa base del editor debe ser un número mayor o igual a 0.');
      dataToSave.editorBase = Number(editorBase.toFixed(2));
    }

    // 5. Thresholds and Bonuses
    let t1 = fullData.threshold1 !== undefined ? Number(fullData.threshold1) : this.cachedConfig?.threshold1 ?? 500000;
    let t2 = fullData.threshold2 !== undefined ? Number(fullData.threshold2) : this.cachedConfig?.threshold2 ?? 1000000;
    if (isNaN(t1) || t1 < 0 || !Number.isInteger(t1)) throw new Error('El Umbral 1 debe ser un número entero mayor o igual a 0.');
    if (isNaN(t2) || t2 < 0 || !Number.isInteger(t2)) throw new Error('El Umbral 2 debe ser un número entero mayor o igual a 0.');
    if (t1 >= t2) {
      throw new Error(`El Umbral 1 (${t1.toLocaleString()}) debe ser estrictamente menor que el Umbral 2 (${t2.toLocaleString()}).`);
    }
    dataToSave.threshold1 = t1;
    dataToSave.threshold2 = t2;

    if (fullData.bonus1 !== undefined) {
      const b1 = Number(fullData.bonus1);
      if (isNaN(b1) || b1 < 0) throw new Error('El Bono 1 debe ser un número mayor o igual a 0.');
      dataToSave.bonus1 = Number(b1.toFixed(2));
    }
    if (fullData.bonus2 !== undefined) {
      const b2 = Number(fullData.bonus2);
      if (isNaN(b2) || b2 < 0) throw new Error('El Bono 2 debe ser un número mayor o igual a 0.');
      dataToSave.bonus2 = Number(b2.toFixed(2));
    }

    // 6. Currency and WaitDays
    if (fullData.currency !== undefined) {
      const curr = String(fullData.currency).trim().toUpperCase();
      if (!curr) throw new Error('La moneda no puede estar vacía.');
      dataToSave.currency = curr.slice(0, 10);
    }
    if (fullData.waitDays !== undefined) {
      const days = Number(fullData.waitDays);
      if (isNaN(days) || days < 1 || !Number.isInteger(days)) throw new Error('Los días de espera deben ser un número entero mayor o igual a 1.');
      dataToSave.waitDays = days;
    }

    // 7. Weekly Summary
    if (fullData.weeklySummaryEnabled !== undefined) {
      dataToSave.weeklySummaryEnabled = Boolean(fullData.weeklySummaryEnabled);
    }
    if (fullData.weeklySummaryDay !== undefined) {
      const day = Number(fullData.weeklySummaryDay);
      if (isNaN(day) || !Number.isInteger(day) || day < 0 || day > 6) {
        throw new Error('El día de resumen semanal debe ser un entero entre 0 (Domingo) y 6 (Sábado).');
      }
      dataToSave.weeklySummaryDay = day;
    }
    if (fullData.weeklySummaryHour !== undefined) {
      const hour = Number(fullData.weeklySummaryHour);
      if (isNaN(hour) || !Number.isInteger(hour) || hour < 0 || hour > 23) {
        throw new Error('La hora de resumen semanal debe ser un entero entre 0 y 23.');
      }
      dataToSave.weeklySummaryHour = hour;
    }
    if (fullData.weeklySummaryMinute !== undefined) {
      const min = Number(fullData.weeklySummaryMinute);
      if (isNaN(min) || !Number.isInteger(min) || min < 0 || min > 59) {
        throw new Error('El minuto de resumen semanal debe ser un entero entre 0 y 59.');
      }
      dataToSave.weeklySummaryMinute = min;
    }
    if (fullData.weeklySummaryChannelId !== undefined) {
      dataToSave.weeklySummaryChannelId = fullData.weeklySummaryChannelId || null;
    }
    if (fullData.weeklySummaryDmUserId !== undefined) {
      dataToSave.weeklySummaryDmUserId = fullData.weeklySummaryDmUserId || null;
    }
    if (fullData.weeklySummaryDmEnabled !== undefined) {
      dataToSave.weeklySummaryDmEnabled = Boolean(fullData.weeklySummaryDmEnabled);
    }

    const updated = await prisma.config.upsert({
      where: { id: 1 },
      update: dataToSave,
      create: {
        ...DEFAULT_CONFIG,
        ...dataToSave
      }
    });

    this.cachedConfig = updated;
    return updated;
  }

  /**
   * Invalidates in-memory cache
   */
  static invalidateCache() {
    this.cachedConfig = null;
  }

  /**
   * Resets configuration to system default values
   * @returns {Promise<Object>}
   */
  static async resetDefaults() {
    this.cachedConfig = null;
    const updatedConfig = await prisma.config.upsert({
      where: { id: 1 },
      update: { ...DEFAULT_CONFIG },
      create: { id: 1, ...DEFAULT_CONFIG }
    });

    this.cachedConfig = updatedConfig;
    return updatedConfig;
  }
}

export default ConfigService;

