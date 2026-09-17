import { describe, it, expect } from 'bun:test';
import {
  extractPaypalMeHandle,
  verifyPaypalMeOnline,
  isPaypalEmail,
  isPaypalMeLink,
  isPaypalMeId,
  isValidPaypal,
  normalizePaypal,
  generatePaypalPaymentLink
} from '../../src/utils/validators.js';

describe('PayPal.me Online Verification & Pure ID Handling', () => {
  it('1. should extract paypal.me handles accurately from various input formats', () => {
    expect(extractPaypalMeHandle('https://paypal.me/lukitazr')).toBe('lukitazr');
    expect(extractPaypalMeHandle('http://paypal.me/myuser')).toBe('myuser');
    expect(extractPaypalMeHandle('www.paypal.me/editor99')).toBe('editor99');
    expect(extractPaypalMeHandle('paypal.me/pro_actor')).toBe('pro_actor');
    expect(extractPaypalMeHandle('@lukitazr')).toBe('lukitazr');
    expect(extractPaypalMeHandle('lukitazr')).toBe('lukitazr');
    expect(extractPaypalMeHandle('correo@gmail.com')).toBeNull();
  });

  it('2. should distinguish pure paypal.me IDs from emails and links', () => {
    // Pure IDs (neither a link nor an email)
    const pureIds = ['lukitazr', '@lukitazr', 'pro_editor', 'actor-99', 'juan.perez'];
    for (const id of pureIds) {
      expect(isPaypalEmail(id)).toBe(false);
      expect(isPaypalMeLink(id)).toBe(false);
      expect(isPaypalMeId(id)).toBe(true);
      expect(isValidPaypal(normalizePaypal(id))).toBe(true);
    }

    // Links (not pure IDs)
    const links = ['https://paypal.me/lukitazr', 'http://paypal.me/user', 'paypal.me/editor'];
    for (const link of links) {
      expect(isPaypalEmail(link)).toBe(false);
      expect(isPaypalMeLink(link)).toBe(true);
      expect(isPaypalMeId(link)).toBe(false);
      expect(isValidPaypal(link)).toBe(true);
    }

    // Emails (not pure IDs)
    const emails = ['usuario@gmail.com', 'talento.sonic@empresa.org'];
    for (const email of emails) {
      expect(isPaypalEmail(email)).toBe(true);
      expect(isPaypalMeLink(email)).toBe(false);
      expect(isPaypalMeId(email)).toBe(false);
      expect(isValidPaypal(email)).toBe(true);
    }
  });

  it('3. should ping https://paypal.me/<id> and succeed when status is 200 OK', async () => {
    let requestedUrl = null;
    const mockFetch = async (url) => {
      requestedUrl = url;
      return {
        status: 200,
        url,
        text: async () => '<html><body>PayPal.Me Profile Active</body></html>'
      };
    };

    // Plain ID input (not a link nor an email)
    const res = await verifyPaypalMeOnline('my_talent_id', { fetchFn: mockFetch });

    expect(requestedUrl).toBe('https://paypal.me/my_talent_id');
    expect(res.valid).toBe(true);
    expect(res.handle).toBe('my_talent_id');
    expect(res.status).toBe(200);
    expect(res.url).toBe('https://paypal.me/my_talent_id');
  });

  it('4. should fail when pinging https://paypal.me/<id> returns status !== 200 (e.g. 404)', async () => {
    let requestedUrl = null;
    const mockFetch = async (url) => {
      requestedUrl = url;
      return {
        status: 404,
        url,
        text: async () => '<html><body>404 Page Not Found</body></html>'
      };
    };

    // Plain ID input (not a link nor an email)
    const res = await verifyPaypalMeOnline('unexistent_id_999', { fetchFn: mockFetch });

    expect(requestedUrl).toBe('https://paypal.me/unexistent_id_999');
    expect(res.valid).toBe(false);
    expect(res.status).toBe(404);
    expect(res.error).toContain('404 Not Found');
  });

  it('5. should fail when pinging returns non-200 server error code (e.g. 500)', async () => {
    const mockFetch = async (url) => {
      return {
        status: 500,
        url,
        text: async () => 'Server error'
      };
    };

    const res = await verifyPaypalMeOnline('server_error_id', { fetchFn: mockFetch });
    expect(res.valid).toBe(false);
    expect(res.status).toBe(500);
    expect(res.error).toContain('500');
  });

  it('6. should fail when PayPal redirects to a notfound URL', async () => {
    const mockFetch = async (url) => {
      return {
        status: 200,
        url: 'https://www.paypal.com/myaccount/transfer/homepage/notfound',
        text: async () => '<html><body>Page not found</body></html>'
      };
    };

    const res = await verifyPaypalMeOnline('@redirected_user', { fetchFn: mockFetch });
    expect(res.valid).toBe(false);
    expect(res.error).toContain('redirige a una página de perfil no encontrado');
  });

  it('7. should generate direct payment link from pure ID correctly', () => {
    const link = generatePaypalPaymentLink('lukitazr', 50, 'MXN');
    expect(link).toBe('https://paypal.me/lukitazr/50MXN');

    const linkAt = generatePaypalPaymentLink('@editor_pro', 125, 'USD');
    expect(linkAt).toBe('https://paypal.me/editor_pro/125USD');
  });

  it('8. should verify live against real PayPal server for lukitazr vs fake user', async () => {
    const realCheck = await verifyPaypalMeOnline('lukitazr');
    expect(realCheck.valid).toBe(true);
    expect(realCheck.handle).toBe('lukitazr');
    expect(realCheck.status).toBe(200);

    const fakeCheck = await verifyPaypalMeOnline('fake_unexistent_user_999999999999_xyz');
    expect(fakeCheck.valid).toBe(false);
    expect(fakeCheck.status).toBe(404);
  });
});
