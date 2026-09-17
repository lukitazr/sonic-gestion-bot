/**
 * Validation utilities for Talent Dossier Registry Subsystem
 */

/**
 * Validates whether a string matches a standard email format.
 * @param {string} email
 * @returns {boolean}
 */
export function isValidEmail(email) {
  if (typeof email !== 'string') return false;
  const trimmed = email.trim();
  if (trimmed.length < 5 || trimmed.length > 254) return false;

  const parts = trimmed.split('@');
  if (parts.length !== 2) return false;

  const [local, domain] = parts;
  if (!local || local.length > 64) return false;
  if (local.startsWith('.') || local.endsWith('.') || local.includes('..')) return false;

  // Local part characters allowed
  const localRegex = /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+$/;
  if (!localRegex.test(local)) return false;

  // Domain labels: 1 to 63 alphanumeric or hyphens, separated by dots, no underscores
  const domainParts = domain.split('.');
  if (domainParts.length < 2) return false;

  for (const part of domainParts) {
    if (!part || part.length > 63) return false;
    if (part.startsWith('-') || part.endsWith('-')) return false;
    if (!/^[a-zA-Z0-9-]+$/.test(part)) return false;
  }

  // TLD must be at least 2 alpha characters
  const tld = domainParts[domainParts.length - 1];
  if (!/^[a-zA-Z]{2,}$/.test(tld)) return false;

  return true;
}

/**
 * Checks if a string is a standard PayPal email address.
 * @param {string} input
 * @returns {boolean}
 */
export function isPaypalEmail(input) {
  if (!input || typeof input !== 'string') return false;
  return isValidEmail(input.trim());
}

/**
 * Checks if a string is a paypal.me URL / link.
 * @param {string} input
 * @returns {boolean}
 */
export function isPaypalMeLink(input) {
  if (!input || typeof input !== 'string') return false;
  const trimmed = input.trim();
  return /(?:https?:\/\/)?(?:www\.)?paypal\.me\/[a-zA-Z0-9._-]+/i.test(trimmed);
}

/**
 * Checks if an input is a pure paypal.me ID (handle / username)
 * when the input is neither a link nor an email.
 * @param {string} input
 * @returns {boolean}
 */
export function isPaypalMeId(input) {
  if (!input || typeof input !== 'string') return false;
  const trimmed = input.trim();
  if (isPaypalEmail(trimmed)) return false;
  if (isPaypalMeLink(trimmed)) return false;
  const cleanHandle = trimmed.startsWith('@') ? trimmed.slice(1) : trimmed;
  return /^[a-zA-Z0-9._-]{2,60}$/.test(cleanHandle);
}

/**
 * Validates whether a string has a valid PayPal format (standard email, paypal.me URL, or @handle).
 * Pure un-prefixed IDs are verified online via isPaypalMeId and verifyPaypalMeOnline.
 * @param {string} paypal
 * @returns {boolean}
 */
export function isValidPaypal(paypal) {
  if (typeof paypal !== 'string') return false;
  const trimmed = paypal.trim();
  if (!trimmed || trimmed.length < 3 || trimmed.length > 254) return false;

  // 1. Email format
  if (isPaypalEmail(trimmed)) return true;

  // 2. paypal.me full URL or domain prefix (https://paypal.me/username, paypal.me/username)
  const paypalMeUrlRegex = /^(?:https?:\/\/)?(?:www\.)?paypal\.me\/[a-zA-Z0-9._-]{1,60}(?:\/.*)?$/i;
  if (paypalMeUrlRegex.test(trimmed)) return true;

  // 3. paypal.me handle starting with @
  if (/^@[a-zA-Z0-9._-]{1,60}$/.test(trimmed)) return true;

  return false;
}

/**
 * Normalizes a PayPal input into either a direct paypal.me URL or an email.
 * @param {string} paypal
 * @returns {string}
 */
export function normalizePaypal(paypal) {
  if (!paypal || typeof paypal !== 'string') return '';
  const trimmed = paypal.trim();

  if (isValidEmail(trimmed)) {
    return trimmed;
  }

  // Match paypal.me URL
  const match = trimmed.match(/(?:https?:\/\/)?(?:www\.)?paypal\.me\/([a-zA-Z0-9._-]+)/i);
  if (match && match[1]) {
    return `https://paypal.me/${match[1]}`;
  }

  // Handle leading @ e.g. @user -> https://paypal.me/user
  if (trimmed.startsWith('@')) {
    return `https://paypal.me/${trimmed.slice(1)}`;
  }

  // Plain handle
  return `https://paypal.me/${trimmed}`;
}

/**
 * Extracts the raw paypal.me handle/slug from any input format (URL, @handle, slug).
 * @param {string} paypal
 * @returns {string|null}
 */
export function extractPaypalMeHandle(paypal) {
  if (!paypal || typeof paypal !== 'string') return null;
  const trimmed = paypal.trim();
  if (isValidEmail(trimmed)) return null;

  const urlMatch = trimmed.match(/(?:https?:\/\/)?(?:www\.)?paypal\.me\/([a-zA-Z0-9._-]+)/i);
  if (urlMatch && urlMatch[1]) return urlMatch[1];

  if (trimmed.startsWith('@')) {
    return trimmed.slice(1).replace(/[^a-zA-Z0-9._-]/g, '');
  }

  if (/^[a-zA-Z0-9._-]{2,60}$/.test(trimmed)) {
    return trimmed;
  }

  return null;
}

/**
 * Verifies if a paypal.me identifier or URL actually exists by making an HTTP ping
 * directly to https://paypal.me/<id> and verifying that it returns status 200 OK.
 *
 * @param {string} paypalInput - paypal.me handle, ID or URL
 * @param {Object} [options]
 * @param {number} [options.timeoutMs=7000] - Request timeout in ms
 * @param {Function} [options.fetchFn=globalThis.fetch] - Fetch implementation (for testing)
 * @returns {Promise<{ valid: boolean, handle?: string, error?: string, status?: number, url?: string }>}
 */
export async function verifyPaypalMeOnline(paypalInput, options = {}) {
  const handle = extractPaypalMeHandle(paypalInput);
  if (!handle) {
    return {
      valid: false,
      error: `El formato '${paypalInput}' no es un identificador o enlace de paypal.me válido.`
    };
  }

  // Ping directo a paypal.me/<id> como requiere la especificación
  const targetUrl = `https://paypal.me/${handle}`;
  const fetchFn = options.fetchFn || globalThis.fetch;
  const timeoutMs = options.timeoutMs || 7000;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetchFn(targetUrl, {
      method: 'GET',
      redirect: 'follow',
      signal: controller.signal,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
      }
    });

    clearTimeout(timer);

    const finalUrl = res.url || '';
    const status = res.status;

    // Verificación estricta del status 200 OK
    if (status !== 200) {
      if (status === 404) {
        return {
          valid: false,
          handle,
          status,
          error: `El ID de PayPal.me '${handle}' no existe (Código 404 Not Found al hacer ping a ${targetUrl}).`
        };
      }
      return {
        valid: false,
        handle,
        status,
        error: `El ping a ${targetUrl} devolvió el estado HTTP ${status} (se esperaba status 200 OK).`
      };
    }

    // Redirección a páginas genéricas de error o perfil inexistente
    const lowerUrl = finalUrl.toLowerCase();
    if (
      lowerUrl.includes('/notfound') ||
      lowerUrl.includes('/error') ||
      lowerUrl.includes('/page-not-found') ||
      lowerUrl.includes('/pagenotfound')
    ) {
      return {
        valid: false,
        handle,
        status: 404,
        error: `El enlace de PayPal.me '${handle}' redirige a una página de perfil no encontrado en PayPal.`
      };
    }

    // Inspección de contenido de la página para detectar errores en el cuerpo
    try {
      const body = await res.text();
      const lowerBody = body.toLowerCase();
      if (
        (lowerBody.includes('page not found') && lowerBody.includes('paypal')) ||
        lowerBody.includes('perfil no encontrado') ||
        lowerBody.includes('this page doesn\'t exist') ||
        lowerBody.includes('esta página no existe')
      ) {
        return {
          valid: false,
          handle,
          status: 404,
          error: `El perfil de PayPal.me '${handle}' no fue encontrado en PayPal.`
        };
      }
    } catch {
      // Si la lectura del cuerpo falla pero el status es 200, se considera válido
    }

    return {
      valid: true,
      handle,
      status: 200,
      url: `https://paypal.me/${handle}`
    };
  } catch (err) {
    clearTimeout(timer);
    if (err.name === 'AbortError') {
      return {
        valid: false,
        handle,
        error: `Tiempo de espera agotado al conectar con ${targetUrl} para verificar '${handle}'.`
      };
    }
    return {
      valid: false,
      handle,
      error: `Error de red al consultar ${targetUrl} para verificar '${handle}': ${err.message}`
    };
  }
}

/**
 * Generates a direct payment link for PayPal if possible (e.g. with amount in paypal.me).
 * @param {string} paypal - Stored PayPal email, link, or handle
 * @param {number} [amount] - Optional payment amount
 * @param {string} [currency='MXN'] - Currency code
 * @returns {string|null}
 */
export function generatePaypalPaymentLink(paypal, amount = null, currency = 'MXN') {
  if (!paypal || typeof paypal !== 'string') return null;
  const trimmed = paypal.trim();

  // If it's an email, direct web payment link to recipient
  if (isValidEmail(trimmed)) {
    return `https://www.paypal.com/myaccount/transfer/homepage/send`;
  }

  // If it's a paypal.me link or ID (neither link nor email)
  const normalized = normalizePaypal(trimmed);
  if (normalized) {
    if (amount !== null && amount !== undefined && !isNaN(Number(amount))) {
      return `${normalized}/${Number(amount)}${currency.toUpperCase()}`;
    }
    return normalized;
  }

  return null;
}

/**
 * Validates whether a string matches a valid Binance identifier
 * (Binance Pay link, Pay ID, numeric User ID, registered email, or crypto deposit address/handle).
 * @param {string} binance
 * @returns {boolean}
 */
export function isValidBinance(binance) {
  if (typeof binance !== 'string') return false;
  const trimmed = binance.trim();
  if (trimmed.length < 3 || trimmed.length > 254) return false;

  // 1. Binance Pay payment links (app.binance.com, pay.binance.com, etc.)
  const binancePayUrlRegex = /^(?:https?:\/\/)?(?:[a-zA-Z0-9-]+\.)*binance\.(?:com|me|org|info)\/(?:[a-zA-Z0-9/_-]+)(?:\?.*)?$/i;
  if (binancePayUrlRegex.test(trimmed)) return true;

  // 2. Email format (Binance account email)
  if (isValidEmail(trimmed)) return true;

  // 3. Numeric ID (Binance User ID / Pay ID: 6 to 16 digits)
  if (/^\d{6,16}$/.test(trimmed)) return true;

  // 4. Binance Pay Nickname / Handle / Crypto Address (Alphanumeric, underscores, hyphens, prefixes like BNB, 0x, etc.)
  if (/^[a-zA-Z0-9_-]{3,128}$/.test(trimmed)) return true;

  return false;
}

/**
 * Generates a direct payment link or helper link for Binance Pay.
 * @param {string} binance - Stored Binance Pay ID, link, email, or wallet
 * @param {number} [amount] - Optional payment amount
 * @param {string} [currency='MXN'] - Currency code
 * @returns {string|null}
 */
export function generateBinancePaymentLink(binance, amount = null, currency = 'MXN') {
  if (!binance || typeof binance !== 'string') return null;
  const trimmed = binance.trim();

  // If it's already a full HTTP/HTTPS Binance payment link, return it
  if (/^https?:\/\//i.test(trimmed)) {
    return trimmed;
  }

  // If it looks like binance.com/... without protocol
  if (/^(?:[a-zA-Z0-9-]+\.)*binance\.(?:com|me|org)/i.test(trimmed)) {
    return `https://${trimmed}`;
  }

  // If it's a numeric Binance Pay ID / UID
  if (/^\d{6,16}$/.test(trimmed)) {
    return `https://app.binance.com/qr/dplk${trimmed}`;
  }

  // Default web portal for Binance Pay send
  return `https://www.binance.com/es/my/wallet/account/payment`;
}

/**
 * Validates and normalizes role string to 'ACTOR' or 'EDITOR'.
 * Throws an informative Error if invalid.
 * @param {string} role
 * @returns {'ACTOR' | 'EDITOR'}
 */
export function normalizeRole(role) {
  if (!role || typeof role !== 'string') {
    throw new Error('El rol es obligatorio. Debe ser ACTOR o EDITOR.');
  }

  const normalized = role.trim().toUpperCase();
  if (normalized !== 'ACTOR' && normalized !== 'EDITOR') {
    throw new Error(`Rol inválido '${role}'. Debe ser ACTOR o EDITOR.`);
  }

  return normalized;
}

/**
 * Checks if a role is valid without throwing.
 * @param {string} role
 * @returns {boolean}
 */
export function isValidRole(role) {
  if (!role || typeof role !== 'string') return false;
  const normalized = role.trim().toUpperCase();
  return normalized === 'ACTOR' || normalized === 'EDITOR';
}

/**
 * Validates a Discord snowflake or test identifier ID.
 * @param {string} discordId
 * @returns {boolean}
 */
export function isValidDiscordId(discordId) {
  if (!discordId || typeof discordId !== 'string') return false;
  const trimmed = discordId.trim();
  return /^\d{15,22}$/.test(trimmed) || /^[a-zA-Z0-9_.-]{2,64}$/.test(trimmed);
}

/**
 * Validates input parameters for creating or updating a talent record.
 * @param {Object} params
 * @param {string} params.discordId - Discord user ID
 * @param {string} [params.role] - 'ACTOR' or 'EDITOR'
 * @param {string} [params.paypal] - PayPal email address or paypal.me link/ID
 * @param {string} [params.binance] - Binance Pay ID, link, email, or handle
 * @param {boolean} [params.isUpdate=false] - Whether this is a partial update for an existing record
 * @returns {{ discordId: string, role?: 'ACTOR' | 'EDITOR', paypal?: string | null, binance?: string | null }}
 */
export function validateTalentInput({ discordId, role, paypal, binance, isUpdate = false }) {
  if (!discordId || typeof discordId !== 'string' || !discordId.trim()) {
    throw new Error('El ID de Discord del talento es obligatorio.');
  }

  const cleanDiscordId = discordId.trim();

  let cleanRole = undefined;
  if (role !== undefined && role !== null && role !== '') {
    cleanRole = normalizeRole(role);
  } else if (!isUpdate) {
    throw new Error('El rol es obligatorio al registrar un nuevo talento. Debe ser ACTOR o EDITOR.');
  }

  let cleanPaypal = undefined;
  if (paypal !== undefined) {
    if (paypal === null || paypal === '') {
      cleanPaypal = null;
    } else {
      const trimmedPaypal = String(paypal).trim();
      if (!isValidPaypal(trimmedPaypal)) {
        throw new Error(`El correo o identificador de PayPal '${paypal}' no tiene un formato de correo electrónico válido o enlace paypal.me.`);
      }
      cleanPaypal = trimmedPaypal;
    }
  }

  let cleanBinance = undefined;
  if (binance !== undefined) {
    if (binance === null || binance === '') {
      cleanBinance = null;
    } else {
      const trimmedBinance = String(binance).trim();
      if (!isValidBinance(trimmedBinance)) {
        throw new Error(`El identificador de Binance '${binance}' no es válido. Debe ser un ID numérico, enlace de pago de Binance, correo, handle o dirección cripto.`);
      }
      cleanBinance = trimmedBinance;
    }
  }

  // If not a partial update, require at least one payment method
  if (!isUpdate && !cleanPaypal && !cleanBinance) {
    throw new Error('Debes proporcionar al menos un método de pago (PayPal o Binance).');
  }

  const result = { discordId: cleanDiscordId };
  if (cleanRole !== undefined) result.role = cleanRole;
  if (cleanPaypal !== undefined) result.paypal = cleanPaypal;
  if (cleanBinance !== undefined) result.binance = cleanBinance;

  return result;
}

/**
 * Parses user arguments from Discord command !registro
 * Supports keyword flags:
 *   !registro ACTOR paypal user@gmail.com binance 12345678
 *   !registro ACTOR paypal paypal.me/miusuario
 *   !registro EDITOR paypal https://paypal.me/editor binance https://app.binance.com/qr/dplk12345
 *   !registro @user ACTOR paypal user@gmail.com
 *   !registro ACTOR user@gmail.com 12345678
 *
 * @param {string[]} args - Command arguments array
 * @param {string} authorId - ID of the message author
 * @param {boolean} [isAdmin=false] - Whether the author has admin permissions
 * @returns {{ targetDiscordId: string, role?: string, paypal?: string, binance?: string }}
 */
export function parseRegistroArgs(args, authorId, isAdmin = false) {
  if (!args || !Array.isArray(args) || args.length === 0) {
    return { targetDiscordId: authorId, role: undefined, paypal: undefined, binance: undefined };
  }

  let targetDiscordId = authorId;
  const remainingTokens = [...args];

  // Check if first argument is a user mention e.g. <@123456789>, <@!123456789>, <@user_name> or raw snowflake
  const firstToken = remainingTokens[0];
  const mentionMatch = firstToken ? firstToken.match(/^<@!?([a-zA-Z0-9_.-]+)>$/) : null;
  if (mentionMatch) {
    if (isAdmin) {
      targetDiscordId = mentionMatch[1];
    }
    remainingTokens.shift();
  } else if (isAdmin && firstToken && (/^\d{15,22}$/.test(firstToken) || (!isValidRole(firstToken) && !['paypal', 'pp', 'binance', 'bnb'].includes(firstToken.toLowerCase()) && !isValidPaypal(firstToken) && remainingTokens.length >= 3))) {
    targetDiscordId = remainingTokens.shift();
  }

  let role = undefined;
  let paypal = undefined;
  let binance = undefined;

  // Iterate through tokens with keyword detection
  for (let i = 0; i < remainingTokens.length; i++) {
    const token = remainingTokens[i];
    const lowerToken = token.toLowerCase();

    if (isValidRole(token)) {
      role = token.toUpperCase();
      continue;
    }

    if (['paypal', 'pp', 'correo', 'mail', 'email'].includes(lowerToken)) {
      if (i + 1 < remainingTokens.length) {
        paypal = remainingTokens[i + 1];
        i++; // skip value
      }
      continue;
    }

    if (['binance', 'bnb', 'binanceid', 'payid'].includes(lowerToken)) {
      if (i + 1 < remainingTokens.length) {
        binance = remainingTokens[i + 1];
        i++; // skip value
      }
      continue;
    }

    // Direct token recognition for PayPal (email or paypal.me link/handle)
    if (!paypal && (isValidEmail(token) || token.toLowerCase().includes('paypal.me') || token.startsWith('@'))) {
      if (isValidPaypal(token)) {
        paypal = token;
        continue;
      }
    }

    // Direct token recognition for Binance (URL or Binance Pay identifier)
    if (!binance && (token.toLowerCase().includes('binance.') || /^\d{6,16}$/.test(token))) {
      if (isValidBinance(token)) {
        binance = token;
        continue;
      }
    }

    // Positional fallback for Binance
    if (!binance && (role || paypal)) {
      if (isValidBinance(token)) {
        binance = token;
      }
    }
  }

  return { targetDiscordId, role, paypal, binance };
}
