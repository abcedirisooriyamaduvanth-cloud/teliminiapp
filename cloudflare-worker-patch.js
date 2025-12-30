// Cloudflare Worker: generate-invite with echoed CORS headers and OPTIONS handling
// Drop this into your Worker script or copy-paste into Cloudflare dashboard.
// Ensure env variables: CHANNELS (JSON), FIREBASE_SERVICE_ACCOUNT, FIREBASE_DB_URL, BOT_TOKEN

export default {
  async fetch(request, env, ctx) {
    // Disable CORS protection: allow any origin
    // Note: Access-Control-Allow-Credentials cannot be used with '*'
    const corsHeaders = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization'
    };

    // Reply to preflight
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: corsHeaders });
    }

    try {
      const url = new URL(request.url);
      if (url.pathname === '/api/generate-invite' && request.method === 'POST') {
        let body;
        try {
          body = await request.json();
        } catch (e) {
          return jsonResponse({ error: 'Invalid JSON' }, 400, corsHeaders);
        }

        const { userId, channelId } = body || {};
        if (!userId || !channelId) {
          return jsonResponse({ error: 'Missing userId or channelId' }, 400, corsHeaders);
        }

        // Channel config from environment
        let channels = {};
        try { channels = JSON.parse(env.CHANNELS || '{}'); } catch (e) { channels = {}; }
        const channel = channels[channelId];
        if (!channel) {
          return jsonResponse({ error: 'Invalid channel' }, 400, corsHeaders);
        }

        // NOTE: getFirebaseToken must be implemented securely (see comments below)
        const firebaseToken = await getFirebaseToken(env.FIREBASE_SERVICE_ACCOUNT).catch(() => null);
        if (!firebaseToken) {
          // For testing you might allow unauthenticated read (not recommended for prod)
          console.warn('No firebase token generated; continuing without auth (testing only)');
        }

        // Read user data from Firebase Realtime DB
        const dbUrl = `${env.FIREBASE_DB_URL}/users/${userId}.json${firebaseToken ? `?auth=${firebaseToken}` : ''}`;
        const userRes = await fetch(dbUrl);
        const userData = await userRes.json().catch(() => ({}));
        const minutes = (userData && userData.totalMinutes) || 0;

        if (minutes < 15) {
          return jsonResponse({ error: `Need ${15 - minutes} more minutes` }, 403, corsHeaders);
        }

        if (userData?.joinedChannels?.[channelId]?.joinedAt) {
          return jsonResponse({ error: 'Already a member!' }, 403, corsHeaders);
        }

        // Create Telegram invite via Bot API
        const inviteRes = await fetch(`https://api.telegram.org/bot${env.BOT_TOKEN}/createChatInviteLink`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ chat_id: channel.id, member_limit: 1, expire_date: Math.floor(Date.now() / 1000) + 60 })
        });

        const inviteData = await inviteRes.json().catch(() => null);
        if (!inviteData || !inviteData.result || !inviteData.result.invite_link) {
          console.error('Telegram invite error', inviteData);
          return jsonResponse({ error: 'Failed to create invite' }, 500, corsHeaders);
        }

        // Store joinedAt in Firebase
        const putUrl = `${env.FIREBASE_DB_URL}/users/${userId}/joinedChannels/${channelId}.json${firebaseToken ? `?auth=${firebaseToken}` : ''}`;
        await fetch(putUrl, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ joinedAt: Date.now(), channelName: channel.name })
        }).catch(e => console.warn('Failed to write joinedChannels', e));

        return jsonResponse({ inviteLink: inviteData.result.invite_link }, 200, corsHeaders);
      }

      return new Response('Not Found', { status: 404, headers: corsHeaders });
    } catch (err) {
      console.error('Worker error', err);
      return jsonResponse({ error: 'Server error' }, 500, corsHeaders);
    }
  }
};

function jsonResponse(obj, status = 200, headers = {}) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: Object.assign({ 'Content-Type': 'application/json' }, headers)
  });
}

// Simplified placeholder: implement proper JWT signing using the service account private_key
async function getFirebaseToken(serviceAccountJson) {
  if (!serviceAccountJson) return null;
  try {
    const account = JSON.parse(serviceAccountJson);

    const now = Math.floor(Date.now() / 1000);
    const header = { alg: 'RS256', typ: 'JWT' };
    const claimSet = {
      iss: account.client_email,
      scope: 'https://www.googleapis.com/auth/firebase.database https://www.googleapis.com/auth/userinfo.email',
      aud: 'https://oauth2.googleapis.com/token',
      exp: now + 3600,
      iat: now
    };

    function base64url(input) {
      return Buffer.from(input).toString('base64')
        .replace(/=/g, '')
        .replace(/\+/g, '-')
        .replace(/\//g, '_');
    }

    const unsignedJwt = base64url(JSON.stringify(header)) + '.' + base64url(JSON.stringify(claimSet));

    // Convert PEM private key to ArrayBuffer
    function pemToArrayBuffer(pem) {
      const b64 = pem.replace(/-----BEGIN PRIVATE KEY-----/, '').replace(/-----END PRIVATE KEY-----/, '').replace(/\s+/g, '');
      const binary = atob(b64);
      const len = binary.length;
      const bytes = new Uint8Array(len);
      for (let i = 0; i < len; i++) bytes[i] = binary.charCodeAt(i);
      return bytes.buffer;
    }

    // Sign using Web Crypto
    const keyData = pemToArrayBuffer(account.private_key);
    const cryptoKey = await crypto.subtle.importKey('pkcs8', keyData, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['sign']);
    const sig = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', cryptoKey, new TextEncoder().encode(unsignedJwt));
    const sigB64 = base64url(String.fromCharCode.apply(null, new Uint8Array(sig)));
    const signedJwt = unsignedJwt + '.' + sigB64;

    // Exchange JWT for access token
    const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: `grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer&assertion=${encodeURIComponent(signedJwt)}`
    });

    if (!tokenRes.ok) return null;
    const tokenData = await tokenRes.json();
    return tokenData.access_token;
  } catch (e) {
    console.error('getFirebaseToken error', e);
    return null;
  }
}
