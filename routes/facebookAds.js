const express = require('express');
const axios = require('axios');
const dotenv = require('dotenv');
const User = require('../models/User');
const auth = require('../utils/authMiddleware');
const FbAds = require('../models/FbAds');

dotenv.config();
const router = express.Router();

const FACEBOOK_AUTH_URL = 'https://www.facebook.com/v19.0/dialog/oauth';
const FACEBOOK_TOKEN_URL = 'https://graph.facebook.com/v19.0/oauth/access_token';
const FACEBOOK_REDIRECT_URI = process.env.FACEBOOK_REDIRECT_URI;
const SCOPES = [
  "public_profile",
  "email",
  "ads_management",
  "ads_read",
  "business_management"
];

// Step 1: Redirect to Facebook Auth
router.get('/connect', auth, (req, res) => {
  const state = req.user._id.toString();
  const url = `${FACEBOOK_AUTH_URL}?client_id=${process.env.FACEBOOK_APP_ID}&redirect_uri=${FACEBOOK_REDIRECT_URI}&state=${state}&scope=${SCOPES.join(',')}&response_type=code`;
  console.log(url, "FB Auth URL");
  res.json({ url });
});

// Step 2: Facebook Callback
router.get('/callback', async (req, res) => {
  const { code, state } = req.query;

  // 1️⃣ Find user
  const user = await User.findById(state);
  if (!user) return res.status(404).send('User not found');

  try {
    // 2️⃣ Exchange code for short-lived token
    const tokenResponse = await axios.get(FACEBOOK_TOKEN_URL, {
      params: {
        client_id: process.env.FACEBOOK_APP_ID,
        client_secret: process.env.FACEBOOK_APP_SECRET,
        redirect_uri: FACEBOOK_REDIRECT_URI,
        code,
      },
    });
    const shortToken = tokenResponse.data.access_token;

    // 3️⃣ Exchange for long-lived token
    const longTokenResponse = await axios.get(FACEBOOK_TOKEN_URL, {
      params: {
        grant_type: 'fb_exchange_token',
        client_id: process.env.FACEBOOK_APP_ID,
        client_secret: process.env.FACEBOOK_APP_SECRET,
        fb_exchange_token: shortToken,
      },
    });
    const longToken = longTokenResponse.data.access_token;

    // 4️⃣ Save the access token once for the user
    let fbAccountToken = await FbAds.findOne({ userId: user._id });
    if (!fbAccountToken) {
      fbAccountToken = new FbAds({
        userId: user._id,
        accessToken: longToken,
        connected: true,
        connectedAt: new Date(),
        adAccounts: [], // we'll fill this below
      });
    } else {
      fbAccountToken.accessToken = longToken;
      fbAccountToken.connected = true;
      fbAccountToken.connectedAt = new Date();
    }

    // 5️⃣ Fetch all Facebook ad accounts
    const accountsRes = await axios.get('https://graph.facebook.com/v19.0/me/adaccounts', {
      params: { access_token: longToken, fields: 'id,account_id,account_name' }
    });
    const adAccounts = accountsRes.data.data;

    if (!adAccounts?.length) return res.status(400).send('No Facebook ad accounts found');

    // 6️⃣ Save ad account IDs only (token already saved)
    fbAccountToken.adAccounts = adAccounts.map(acc => ({
      adAccountId: acc.account_id,
      accountName: acc.account_name,
      pageId: '', // optional
    }));

    await fbAccountToken.save();

    // 7️⃣ Update user summary
    user.connectedChannels = user.connectedChannels || {};
    user.connectedChannels.facebookAds = true;
    await user.save();

    res.redirect('http://localhost:5173/dashboard');
  } catch (err) {
    console.error('Facebook Ads OAuth error:', err.response?.data || err.message);
    res.status(500).send('Facebook Ads authentication failed');
  }
});

// Step 3: Check Facebook Connection Status
router.get('/status', auth, async (req, res) => {
  try {
    const user = await User.findById(req.user._id);
    const isConnected = !!user.connectedChannels?.facebookAds;
    console.log('Facebook Ads connection status:', isConnected);

    res.json({ isConnected });
  } catch (err) {
    console.error('Error checking Facebook Ads status:', err.message);
    res.status(500).json({ msg: 'Failed to check Facebook Ads connection' });
  }
});

// Step 4: Fetch Ads campaigns + insights
router.get('/ads', auth, async (req, res) => {
  try {
    // 1️⃣ Fetch the user's saved Facebook access token
    const fbAccount = await FbAds.findOne({ userId: req.user._id, connected: true });
    if (!fbAccount || !fbAccount.accessToken) {
      return res.status(400).json({ error: "Facebook Ads not connected" });
    }

    const accessToken = fbAccount.accessToken;

    // 2️⃣ Fetch all ad accounts dynamically using the access token
    const accountsRes = await axios.get('https://graph.facebook.com/v19.0/me/adaccounts', {
      params: { access_token: accessToken, fields: 'id,account_name' }
    });

    const adAccounts = accountsRes.data.data;
    if (!adAccounts?.length) return res.status(400).json({ error: "No Facebook ad accounts found" });

    // 3️⃣ Fetch campaigns + insights for each ad account
    const accountsWithData = await Promise.all(
      adAccounts.map(async (account) => {
        try {
          const campaignsRes = await axios.get(
            `https://graph.facebook.com/v19.0/${account.id}/campaigns`,
            { params: { fields: "id,name,status", access_token: accessToken } }
          );

          const insightsRes = await axios.get(
            `https://graph.facebook.com/v19.0/${account.id}/insights`,
            {
              params: {
                fields: "account_name,campaign_name,impressions,clicks,spend",
                date_preset: "last_30d",
                access_token: accessToken
              }
            }
          );

          return {
            adAccountId: account.id,
            accountName: account.account_name,
            campaigns: campaignsRes.data.data || [],
            insights: insightsRes.data.data || [],
          };
        } catch (err) {
          console.error(`Error fetching data for account ${account.id}:`, err.response?.data || err.message);
          return {
            adAccountId: account.id,
            accountName: account.account_name,
            campaigns: [],
            insights: [],
            error: "Failed to fetch this account's data",
          };
        }
      })
    );

    res.json({ accounts: accountsWithData });
  } catch (err) {
    console.error("FB Ads fetch error:", err.response?.data || err.message);
    res.status(500).json({ error: "Failed to fetch Facebook Ads data" });
  }
});


module.exports = router;
