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
const SCOPES = ["public_profile", "email", "ads_management",
  "ads_read",
  "business_management"];

// Step 1: Redirect to Facebook Auth
router.get('/connect', auth, (req, res) => {
  const state = req.user._id.toString(); // better than pulling from headers
  const url = `${FACEBOOK_AUTH_URL}?client_id=${process.env.FACEBOOK_APP_ID}&redirect_uri=${process.env.FACEBOOK_REDIRECT_URI}&state=${state}&scope=${SCOPES.join(',')}&response_type=code`;
  console.log(url,"url.....")
  res.json({ url });
});

// Step 2: Facebook Callback
router.get('/callback', async (req, res) => {
  console.log("Callback hit...");

  const { code, state } = req.query;
  console.log(req.query, "query");

  let user;
  try {
    // Find user directly using state (userId)
    user = await User.findById(state);
    if (!user) {
      return res.status(404).send('User not found');
    }
  } catch (e) {
    return res.status(401).send('Invalid state token');
  }

  try {
    // Exchange code for short-lived token
    const tokenResponse = await axios.get(FACEBOOK_TOKEN_URL, {
      params: {
        client_id: process.env.FACEBOOK_APP_ID,
        client_secret: process.env.FACEBOOK_APP_SECRET,
        redirect_uri: process.env.FACEBOOK_REDIRECT_URI,
        code,
      },
    });

    const shortLivedToken = tokenResponse.data.access_token;

    // Exchange for long-lived token
    const longTokenResponse = await axios.get('https://graph.facebook.com/v19.0/oauth/access_token', {
      params: {
        grant_type: 'fb_exchange_token',
        client_id: process.env.FACEBOOK_APP_ID,
        client_secret: process.env.FACEBOOK_APP_SECRET,
        fb_exchange_token: shortLivedToken,
      },
    });

    const longLivedToken = longTokenResponse.data.access_token;
    console.log("Long lived token:", longLivedToken);

    // Ensure connectedChannels exists
    if (!user.connectedChannels) {
      user.connectedChannels = {};
    }

    // Save Facebook data
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


router.get("/ads", auth, async (req, res) => {
  try {
    const user = await User.findById(req.user._id);

    if (!user?.connectedChannels?.facebookAds?.accessToken) {
      return res.status(400).json({ error: "Facebook not connected" });
    }

    const accessToken = user.connectedChannels.facebookAds.accessToken;

    // 1️⃣ Get Ad Accounts
    const accountsRes = await axios.get(
      `https://graph.facebook.com/v19.0/me/adaccounts`,
      {
        params: {
          fields: "id,account_id,account_name,account_status",
          access_token: accessToken,
        },
      }
    );

    const adAccounts = accountsRes.data.data;

    // 2️⃣ For each account, fetch campaigns + insights
    const accountsWithData = await Promise.all(
      adAccounts.map(async (account) => {
        const campaignsRes = await axios.get(
          `https://graph.facebook.com/v19.0/${account.id}/campaigns`,
          {
            params: {
              fields: "id,name,status",
              access_token: accessToken,
            },
          }
        );

        const insightsRes = await axios.get(
          `https://graph.facebook.com/v19.0/${account.id}/insights`,
          {
            params: {
              fields: "account_name,campaign_name,impressions,clicks,spend",
              date_preset: "last_30d",
              access_token: accessToken,
            },
          }
        );

        return {
          ...account,
          campaigns: campaignsRes.data.data,
          insights: insightsRes.data.data,
        };
      })
    );

    res.json({ accounts: accountsWithData });
  } catch (err) {
    console.error("FB Ads fetch error:", err.response?.data || err.message);
    res.status(500).json({ error: "Failed to fetch Facebook Ads data" });
  }
});


module.exports = router;
