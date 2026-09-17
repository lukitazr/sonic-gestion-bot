/**
 * YouTube Service
 * Handles YouTube URL / Video ID parsing, thumbnail resolution, and YouTube Data API v3 metadata retrieval.
 */

export class YouTubeService {
  static mockDatabase = new Map();
  static mockChannelDatabase = new Map();
  static mockChannelVideosDatabase = new Map();

  /**
   * Universal extractor for YouTube 11-character video IDs from URLs or raw strings.
   * Supports:
   * - Standard watch: https://www.youtube.com/watch?v=ID
   * - Shortened: https://youtu.be/ID
   * - Embed: https://www.youtube.com/embed/ID
   * - Shorts: https://www.youtube.com/shorts/ID
   * - Live streams: https://www.youtube.com/live/ID
   * - Legacy v: https://www.youtube.com/v/ID
   * - Mobile URLs: https://m.youtube.com/watch?v=ID
   * - Angle bracket wrapped URLs: <https://youtu.be/ID>
   * - Raw 11-char ID: ID
   *
   * @param {string} urlOrId
   * @returns {string | null}
   */
  static extractVideoId(urlOrId) {
    if (!urlOrId || typeof urlOrId !== 'string') return null;

    let trimmed = urlOrId.trim();

    // Strip wrapping angle brackets if present (Discord embed suppressor: <http...>)
    if (trimmed.startsWith('<') && trimmed.endsWith('>')) {
      trimmed = trimmed.slice(1, -1).trim();
    }

    // Direct 11-char ID check
    if (/^[a-zA-Z0-9_-]{11}$/.test(trimmed)) {
      return trimmed;
    }

    // Try parsing as URL for standard query params
    try {
      const parsedUrl = new URL(trimmed.startsWith('http') ? trimmed : `https://${trimmed}`);
      const hostname = parsedUrl.hostname.toLowerCase().replace(/^www\./, '').replace(/^m\./, '');

      if (hostname === 'youtube.com') {
        // /watch?v=ID
        const vParam = parsedUrl.searchParams.get('v');
        if (vParam && /^[a-zA-Z0-9_-]{11}$/.test(vParam)) {
          return vParam;
        }

        // /embed/ID, /shorts/ID, /live/ID, /v/ID
        const pathSegments = parsedUrl.pathname.split('/').filter(Boolean);
        if (['embed', 'shorts', 'live', 'v'].includes(pathSegments[0]) && pathSegments[1]) {
          const possibleId = pathSegments[1];
          if (/^[a-zA-Z0-9_-]{11}$/.test(possibleId)) {
            return possibleId;
          }
        }
      } else if (hostname === 'youtu.be') {
        // youtu.be/ID
        const pathSegments = parsedUrl.pathname.split('/').filter(Boolean);
        if (pathSegments[0] && /^[a-zA-Z0-9_-]{11}$/.test(pathSegments[0])) {
          return pathSegments[0];
        }
      }
    } catch {
      // Fallback to regex matching if URL parsing fails on unconventional strings
    }

    // Comprehensive Regex Fallback
    const patterns = [
      /(?:youtube\.com\/(?:watch\?(?:.*&)?v=|embed\/|shorts\/|live\/|v\/))([a-zA-Z0-9_-]{11})/i,
      /(?:youtu\.be\/)([a-zA-Z0-9_-]{11})/i
    ];

    for (const regex of patterns) {
      const match = trimmed.match(regex);
      if (match && match[1]) {
        return match[1];
      }
    }

    return null;
  }

  /**
   * Generates standard YouTube thumbnail URL for a video ID.
   * @param {string} videoId
   * @param {'default' | 'hqdefault' | 'mqdefault' | 'sddefault' | 'maxresdefault'} [quality='hqdefault']
   * @returns {string}
   */
  static getThumbnailUrl(videoId, quality = 'hqdefault') {
    if (!videoId) return '';
    return `https://img.youtube.com/vi/${videoId}/${quality}.jpg`;
  }

  /**
   * Sets mock video details for testing and offline development.
   * @param {string} videoId
   * @param {{ title?: string, viewCount?: number, thumbnailUrl?: string }} details
   */
  static setMockVideo(videoId, details = {}) {
    const cleanId = this.extractVideoId(videoId) || videoId;
    this.mockDatabase.set(cleanId, {
      videoId: cleanId,
      title: details.title || `Video ${cleanId}`,
      viewCount: details.viewCount ?? 0,
      thumbnailUrl: details.thumbnailUrl || this.getThumbnailUrl(cleanId)
    });
  }

  /**
   * Checks if a mock video exists for the specified video ID.
   * @param {string} videoId
   * @returns {boolean}
   */
  static hasMock(videoId) {
    const cleanId = this.extractVideoId(videoId) || videoId;
    return this.mockDatabase.has(cleanId);
  }

  /**
   * Clears mock video database
   */
  static clearMocks() {
    this.mockDatabase.clear();
    this.mockChannelDatabase.clear();
    this.mockChannelVideosDatabase.clear();
  }

  /**
   * Sets mock channel details for offline tests and development.
   * @param {string} identifier - Handle, channel ID or URL
   * @param {{ channelId?: string, title?: string, url?: string, uploadsPlaylistId?: string }} details
   */
  static setMockChannel(identifier, details = {}) {
    const channelId = details.channelId || (identifier.startsWith('UC') ? identifier : `UC_${identifier}`);
    const title = details.title || `Canal ${identifier}`;
    const url = details.url || `https://www.youtube.com/@${identifier.replace(/^@/, '')}`;
    const uploadsPlaylistId = details.uploadsPlaylistId || `UU${channelId.slice(2)}`;

    const data = {
      channelId,
      title,
      url,
      uploadsPlaylistId,
      customUrl: identifier.startsWith('@') ? identifier : `@${identifier}`
    };

    this.mockChannelDatabase.set(identifier, data);
    this.mockChannelDatabase.set(channelId, data);
    if (identifier.startsWith('@')) {
      this.mockChannelDatabase.set(identifier.slice(1), data);
    }
  }

  /**
   * Sets mock latest videos for a channel.
   * @param {string} identifier - Channel ID or uploads playlist ID
   * @param {Array<{ videoId: string, title: string, publishedAt?: string, thumbnailUrl?: string }>} videos
   */
  static setMockChannelVideos(identifier, videos = []) {
    const mapped = videos.map(v => ({
      videoId: v.videoId,
      title: v.title,
      publishedAt: v.publishedAt || new Date().toISOString(),
      thumbnailUrl: v.thumbnailUrl || this.getThumbnailUrl(v.videoId),
      url: `https://www.youtube.com/watch?v=${v.videoId}`
    }));

    this.mockChannelVideosDatabase.set(identifier, mapped);
    if (identifier.startsWith('UC')) {
      this.mockChannelVideosDatabase.set(`UU${identifier.slice(2)}`, mapped);
    }
  }

  /**
   * Retrieves video details from YouTube Data API v3 or fallback mock database.
   *
   * @param {string} videoId - 11-character video ID or full YouTube URL
   * @param {string} [apiKey] - Optional YouTube API Key override (or 'mock' for simulated mode)
   * @returns {Promise<{ videoId: string, title: string, viewCount: number, thumbnailUrl: string }>}
   */
  static async getVideoDetails(videoId, apiKey = null) {
    if (!videoId || typeof videoId !== 'string' || !videoId.trim()) {
      throw new Error('El ID de video de YouTube es obligatorio.');
    }

    const cleanVideoId = this.extractVideoId(videoId) || videoId.trim();

    // 1. Check in-memory mock database first
    if (this.mockDatabase.has(cleanVideoId)) {
      return { ...this.mockDatabase.get(cleanVideoId) };
    }

    // 2. Determine active API Key and environment mock flags
    const activeKey = apiKey || process.env.YOUTUBE_API_KEY;
    const isMockMode =
      activeKey === 'mock' ||
      process.env.MOCK_YOUTUBE === 'true' ||
      process.env.YOUTUBE_API_MOCK === 'true' ||
      !activeKey;

    // 3. Handle Mock / Offline mode fallback
    if (isMockMode) {
      return {
        videoId: cleanVideoId,
        title: `YouTube Video (${cleanVideoId})`,
        viewCount: 0,
        thumbnailUrl: this.getThumbnailUrl(cleanVideoId)
      };
    }

    // 4. Real YouTube Data API v3 fetch
    const endpoint = `https://www.googleapis.com/youtube/v3/videos?part=snippet,statistics&id=${encodeURIComponent(cleanVideoId)}&key=${encodeURIComponent(activeKey)}`;

    let response;
    try {
      response = await fetch(endpoint);
    } catch (networkError) {
      throw new Error(`Error de conexión con YouTube Data API: ${networkError.message || networkError}`);
    }

    // Handle HTTP status errors
    if (response.status === 403) {
      let errorDetail = 'Cuota excedida o clave de API inválida';
      try {
        const errorJson = await response.json();
        if (errorJson.error?.message) {
          errorDetail = errorJson.error.message;
        }
      } catch {
        // Keep default error detail
      }
      throw new Error(`Error de cuota o permisos en YouTube Data API (403): ${errorDetail}`);
    }

    if (response.status === 404) {
      throw new Error(`Video de YouTube no encontrado en la API (404): ${cleanVideoId}`);
    }

    if (!response.ok) {
      throw new Error(`Error al consultar YouTube Data API (${response.status}): ${response.statusText}`);
    }

    const data = await response.json();

    if (!data.items || !Array.isArray(data.items) || data.items.length === 0) {
      throw new Error(`Video no encontrado o privado en YouTube (${cleanVideoId}).`);
    }

    const item = data.items[0];
    const viewCount = parseInt(item.statistics?.viewCount || '0', 10);
    const title = item.snippet?.title || `YouTube Video (${cleanVideoId})`;
    const thumbnails = item.snippet?.thumbnails || {};
    const thumbnailUrl =
      thumbnails.maxres?.url ||
      thumbnails.standard?.url ||
      thumbnails.high?.url ||
      thumbnails.medium?.url ||
      thumbnails.default?.url ||
      this.getThumbnailUrl(cleanVideoId);

    return {
      videoId: cleanVideoId,
      title,
      viewCount: isNaN(viewCount) ? 0 : viewCount,
      thumbnailUrl
    };
  }

  /**
   * Extracts channel identification (handle, channelId, or custom username) from URL or string.
   * @param {string} urlOrInput
   * @returns {{ type: 'handle' | 'id' | 'custom', value: string, rawInput: string } | null}
   */
  static extractChannelIdentifier(urlOrInput) {
    if (!urlOrInput || typeof urlOrInput !== 'string') return null;
    let trimmed = urlOrInput.trim();

    if (trimmed.startsWith('<') && trimmed.endsWith('>')) {
      trimmed = trimmed.slice(1, -1).trim();
    }

    // Direct handle: @SonicChannel
    if (/^@[a-zA-Z0-9._-]{3,60}$/.test(trimmed)) {
      return { type: 'handle', value: trimmed.slice(1), rawInput: trimmed };
    }

    // Direct channel ID: UC... (24 chars)
    if (/^UC[a-zA-Z0-9_-]{22}$/.test(trimmed)) {
      return { type: 'id', value: trimmed, rawInput: trimmed };
    }

    try {
      const parsedUrl = new URL(trimmed.startsWith('http') ? trimmed : `https://${trimmed}`);
      const hostname = parsedUrl.hostname.toLowerCase().replace(/^www\./, '').replace(/^m\./, '');

      if (hostname === 'youtube.com' || hostname === 'youtu.be') {
        const pathSegments = parsedUrl.pathname.split('/').filter(Boolean);

        // /@Handle
        if (pathSegments[0] && pathSegments[0].startsWith('@')) {
          return { type: 'handle', value: pathSegments[0].slice(1), rawInput: trimmed };
        }

        // /channel/UC...
        if (pathSegments[0] === 'channel' && pathSegments[1]) {
          return { type: 'id', value: pathSegments[1], rawInput: trimmed };
        }

        // /c/CustomName or /user/UserName
        if (['c', 'user'].includes(pathSegments[0]) && pathSegments[1]) {
          return { type: 'custom', value: pathSegments[1], rawInput: trimmed };
        }

        // /CustomName (direct path segment)
        if (pathSegments[0] && !['watch', 'playlist', 'shorts', 'embed', 'feed'].includes(pathSegments[0])) {
          return { type: 'custom', value: pathSegments[0], rawInput: trimmed };
        }
      }
    } catch {
      // Regex fallback
    }

    // Fallback regex matching
    const handleMatch = trimmed.match(/(?:youtube\.com\/)?@([a-zA-Z0-9._-]{3,60})/i);
    if (handleMatch && handleMatch[1]) {
      return { type: 'handle', value: handleMatch[1], rawInput: trimmed };
    }

    const channelIdMatch = trimmed.match(/(?:youtube\.com\/channel\/)?(UC[a-zA-Z0-9_-]{22})/i);
    if (channelIdMatch && channelIdMatch[1]) {
      return { type: 'id', value: channelIdMatch[1], rawInput: trimmed };
    }

    return null;
  }

  /**
   * Retrieves YouTube channel details (title, channelId, url, uploadsPlaylistId)
   * from YouTube Data API v3 or fallback mock database.
   *
   * @param {string} channelUrlOrInput
   * @param {string} [apiKey]
   * @returns {Promise<{ channelId: string, title: string, url: string, uploadsPlaylistId: string, customUrl?: string }>}
   */
  static async getChannelDetails(channelUrlOrInput, apiKey = null) {
    if (!channelUrlOrInput || typeof channelUrlOrInput !== 'string') {
      throw new Error('El enlace o identificador del canal de YouTube es obligatorio.');
    }

    const parsed = this.extractChannelIdentifier(channelUrlOrInput);
    if (!parsed) {
      throw new Error(`No se pudo extraer un identificador válido de canal de YouTube de '${channelUrlOrInput}'.`);
    }

    // Check mock database
    if (this.mockChannelDatabase.has(parsed.value) || this.mockChannelDatabase.has(parsed.rawInput)) {
      return { ...(this.mockChannelDatabase.get(parsed.value) || this.mockChannelDatabase.get(parsed.rawInput)) };
    }

    const activeKey = apiKey || process.env.YOUTUBE_API_KEY;
    const isMockMode =
      activeKey === 'mock' ||
      process.env.MOCK_YOUTUBE === 'true' ||
      process.env.YOUTUBE_API_MOCK === 'true' ||
      !activeKey;

    if (isMockMode) {
      const mockChannelId = parsed.type === 'id' ? parsed.value : `UC${parsed.value.padEnd(22, '0').slice(0, 22)}`;
      const mockTitle = `Canal YouTube (${parsed.value})`;
      const mockUrl = parsed.type === 'handle' ? `https://www.youtube.com/@${parsed.value}` : `https://www.youtube.com/channel/${mockChannelId}`;
      const mockUploads = `UU${mockChannelId.slice(2)}`;
      return {
        channelId: mockChannelId,
        title: mockTitle,
        url: mockUrl,
        uploadsPlaylistId: mockUploads,
        customUrl: parsed.type === 'handle' ? `@${parsed.value}` : null
      };
    }

    let endpoint = 'https://www.googleapis.com/youtube/v3/channels?part=snippet,contentDetails';
    if (parsed.type === 'handle') {
      endpoint += `&forHandle=${encodeURIComponent(parsed.value)}&key=${encodeURIComponent(activeKey)}`;
    } else if (parsed.type === 'id') {
      endpoint += `&id=${encodeURIComponent(parsed.value)}&key=${encodeURIComponent(activeKey)}`;
    } else {
      endpoint += `&forUsername=${encodeURIComponent(parsed.value)}&key=${encodeURIComponent(activeKey)}`;
    }

    let response;
    try {
      response = await fetch(endpoint);
    } catch (netErr) {
      throw new Error(`Error de red al consultar el canal en YouTube API: ${netErr.message}`);
    }

    if (!response.ok) {
      throw new Error(`Error al consultar el canal en YouTube API (${response.status}): ${response.statusText}`);
    }

    const data = await response.json();
    if (!data.items || !Array.isArray(data.items) || data.items.length === 0) {
      throw new Error(`No se encontró ningún canal de YouTube con el identificador '${parsed.value}'.`);
    }

    const item = data.items[0];
    const channelId = item.id;
    const title = item.snippet?.title || `Canal (${channelId})`;
    const customUrl = item.snippet?.customUrl || null;
    const url = customUrl
      ? (customUrl.startsWith('http') ? customUrl : `https://www.youtube.com/${customUrl.startsWith('@') ? customUrl : '@' + customUrl}`)
      : `https://www.youtube.com/channel/${channelId}`;
    const uploadsPlaylistId = item.contentDetails?.relatedPlaylists?.uploads || `UU${channelId.slice(2)}`;

    return {
      channelId,
      title,
      url,
      uploadsPlaylistId,
      customUrl
    };
  }

  /**
   * Retrieves the latest videos from a YouTube channel in reverse chronological order (newest first).
   * Up to maxResults (default: 25).
   *
   * @param {string} channelIdOrUploadsId - Channel ID (UC...) or Uploads Playlist ID (UU...)
   * @param {number} [maxResults=25]
   * @param {string} [apiKey]
   * @returns {Promise<Array<{ videoId: string, title: string, publishedAt: string, thumbnailUrl: string, url: string }>>}
   */
  static async getLatestVideosFromChannel(channelIdOrUploadsId, maxResults = 25, apiKey = null) {
    if (!channelIdOrUploadsId) return [];

    const cleanId = channelIdOrUploadsId.trim();

    // Check mock database
    if (this.mockChannelVideosDatabase.has(cleanId)) {
      const list = this.mockChannelVideosDatabase.get(cleanId);
      return list.slice(0, maxResults);
    }

    const activeKey = apiKey || process.env.YOUTUBE_API_KEY;
    const isMockMode =
      activeKey === 'mock' ||
      process.env.MOCK_YOUTUBE === 'true' ||
      process.env.YOUTUBE_API_MOCK === 'true' ||
      !activeKey;

    if (isMockMode) {
      // Generate realistic mock video list (25 videos) sorted by date descending
      const mockList = [];
      const now = Date.now();
      for (let i = 1; i <= maxResults; i++) {
        const vidId = `mockvid_${cleanId.slice(0, 4)}_${String(i).padStart(2, '0')}`;
        const publishTime = new Date(now - (i - 1) * 24 * 3600 * 1000).toISOString();
        mockList.push({
          videoId: vidId,
          title: `Video #${i} - Episodio de Sonic & Friends (${vidId})`,
          publishedAt: publishTime,
          thumbnailUrl: this.getThumbnailUrl(vidId),
          url: `https://www.youtube.com/watch?v=${vidId}`
        });
      }
      return mockList;
    }

    // Derive uploads playlist ID (UU... replaces UC...)
    const playlistId = cleanId.startsWith('UC') ? `UU${cleanId.slice(2)}` : cleanId;

    const endpoint = `https://www.googleapis.com/youtube/v3/playlistItems?part=snippet&playlistId=${encodeURIComponent(playlistId)}&maxResults=${Math.min(maxResults, 50)}&key=${encodeURIComponent(activeKey)}`;

    try {
      const response = await fetch(endpoint);
      if (response.ok) {
        const data = await response.json();
        if (data.items && Array.isArray(data.items)) {
          const videos = data.items
            .map(item => {
              const videoId = item.snippet?.resourceId?.videoId;
              if (!videoId) return null;
              return {
                videoId,
                title: item.snippet?.title || `Video ${videoId}`,
                publishedAt: item.snippet?.publishedAt || new Date().toISOString(),
                thumbnailUrl:
                  item.snippet?.thumbnails?.high?.url ||
                  item.snippet?.thumbnails?.medium?.url ||
                  item.snippet?.thumbnails?.default?.url ||
                  this.getThumbnailUrl(videoId),
                url: `https://www.youtube.com/watch?v=${videoId}`
              };
            })
            .filter(Boolean);

          // Ensure sorted newest first
          videos.sort((a, b) => new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime());
          return videos.slice(0, maxResults);
        }
      }
    } catch {
      // Fallback to search if playlistItems failed
    }

    // Fallback: search endpoint ordered by date
    const channelId = cleanId.startsWith('UU') ? `UC${cleanId.slice(2)}` : cleanId;
    const searchEndpoint = `https://www.googleapis.com/youtube/v3/search?part=snippet&channelId=${encodeURIComponent(channelId)}&order=date&type=video&maxResults=${Math.min(maxResults, 25)}&key=${encodeURIComponent(activeKey)}`;

    try {
      const sResponse = await fetch(searchEndpoint);
      if (sResponse.ok) {
        const sData = await sResponse.json();
        if (sData.items && Array.isArray(sData.items)) {
          return sData.items
            .map(item => {
              const videoId = item.id?.videoId;
              if (!videoId) return null;
              return {
                videoId,
                title: item.snippet?.title || `Video ${videoId}`,
                publishedAt: item.snippet?.publishedAt || new Date().toISOString(),
                thumbnailUrl:
                  item.snippet?.thumbnails?.high?.url ||
                  item.snippet?.thumbnails?.default?.url ||
                  this.getThumbnailUrl(videoId),
                url: `https://www.youtube.com/watch?v=${videoId}`
              };
            })
            .filter(Boolean)
            .slice(0, maxResults);
        }
      }
    } catch {
      // Fallback empty
    }

    return [];
  }
}

export default YouTubeService;
