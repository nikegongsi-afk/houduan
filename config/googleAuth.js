const { OAuth2Client } = require('google-auth-library');

async function verifyGoogleIdToken(idToken, clientId) {
  if (!idToken || !clientId) {
    return null;
  }

  const client = new OAuth2Client(clientId);
  const ticket = await client.verifyIdToken({
    idToken,
    audience: clientId,
  });

  const payload = ticket.getPayload();
  if (!payload || !payload.email || payload.email_verified !== true) {
    return null;
  }

  return {
    sub: payload.sub,
    email: payload.email,
    name: payload.name || payload.email.split('@')[0],
    picture: payload.picture || '',
  };
}

module.exports = { verifyGoogleIdToken };
