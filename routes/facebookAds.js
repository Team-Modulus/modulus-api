const express = require('express');
const jwt = require('jsonwebtoken');
const axios = require('axios');
const dotenv = require('dotenv');
const User = require('../models/User');
const auth = require('../utils/authMiddleware');

dotenv.config();
const router = express.Router();

const FACEBOOK_AUTH_URL = 'https://www.facebook.com/v19.0/dialog/oauth';
const FACEBOOK_TOKEN_URL = 'https://graph.facebook.com/v19.0/oauth/access_token';
const FACEBOOK_REDIRECT_URI = process.env.FACEBOOK_REDIRECT_URI;
const SCOPES = ['ads_management', 'business_management', 'pages_show_list'];

// Step 1: Redirect to Facebook Auth
router.get('/connect', auth, (req, res) => {
  const state = req.headers.authorization?.split(' ')[1];
  const url = `${FACEBOOK_AUTH_URL}?client_id=${process.env.FACEBOOK_APP_ID}&redirect_uri=${FACEBOOK_REDIRECT_URI}&state=${state}&scope=${SCOPES.join(',')}&response_type=code`;
  res.json({ url });
});

// Step 2: Facebook Callback
router.get('/callback', async (req, res) => {
  const { code, state } = req.query;

  let decoded;
  try {
    decoded = jwt.verify(state, process.env.JWT_SECRET);
  } catch (e) {
    return res.status(401).send('Invalid state token');
  }

  try {
    // Exchange code for short-lived token
    const tokenResponse = await axios.get(FACEBOOK_TOKEN_URL, {
      params: {
        client_id: process.env.FACEBOOK_APP_ID,
        client_secret: process.env.FACEBOOK_APP_SECRET,
        redirect_uri: FACEBOOK_REDIRECT_URI,
        code,
      },
    });

    const shortLivedToken = tokenResponse.data.access_token;

    // Exchange short-lived token for long-lived token
    const longTokenResponse = await axios.get('https://graph.facebook.com/v19.0/oauth/access_token', {
      params: {
        grant_type: 'fb_exchange_token',
        client_id: process.env.FACEBOOK_APP_ID,
        client_secret: process.env.FACEBOOK_APP_SECRET,
        fb_exchange_token: shortLivedToken,
      },
    });

    const longLivedToken = longTokenResponse.data.access_token;

    const user = await User.findById(decoded.user.id);
    if (!user) return res.status(404).send('User not found');

    user.connectedChannels.facebookAds = {
      accessToken: longLivedToken,
      connected: true,
      connectedAt: new Date(),
    };

    await user.save();
    res.redirect('http://localhost:5173/dashboard');
  } catch (err) {
    console.error('Facebook OAuth error:', err.message);
    res.status(500).send('Facebook authentication failed');
  }
});

// Step 3: Check Facebook Connection Status
router.get('/status', auth, async (req, res) => {
  try {
    const user = await User.findById(req.user.id);
    const isConnected = !!(user.connectedChannels?.facebookAds?.accessToken);

    res.json({
      isConnected,
      connectedAt: user.connectedChannels?.facebookAds?.connectedAt,
    });
  } catch (err) {
    console.error('Error checking Facebook Ads status:', err.message);
    res.status(500).json({ msg: 'Failed to check Facebook Ads connection' });
  }
});

module.exports = router;
