// Cloudflare Worker: generate-invite with echoed CORS headers and OPTIONS handling
// Drop this into your Worker script or copy-paste into Cloudflare dashboard.
// Ensure env variables: CHANNELS (JSON), FIREBASE_SERVICE_ACCOUNT, FIREBASE_DB_URL, BOT_TOKEN

export default {
  async fetch(request, env, ctx) {
    const origin = request.headers.get('Origin') || '*';
    const corsHeaders = {
      'Access-Control-Allow-Origin': origin,
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
      'Access-Control-Allow-Credentials': 'true'
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
    // For production: sign a JWT with account.private_key using RS256 (Web Crypto), exchange for access token
    // Placeholder returns null so the Worker won't fail — implement signing for real access.
    return null;
  } catch (e) {
    return null;
  }
}
