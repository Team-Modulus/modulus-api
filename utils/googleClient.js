const { google } = require('googleapis');

const oauth2Client = new google.auth.OAuth2(
  process.env.GOOGLE_CLIENT_ID,
  process.env.GOOGLE_CLIENT_SECRET,
  'http://localhost:5000/api/google/callback'
);

const scopes = ['https://www.googleapis.com/auth/adwords'];

module.exports = { oauth2Client, scopes };
