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

    res.redirect('https://modulus-frontend-sand.vercel.app/dashboard/integration');
  } catch (err) {
    console.error('Facebook Ads OAuth error:', err.response?.data || err.message);
    res.status(500).send('Facebook Ads authentication failed');
  }
});

// Step 3: Check Facebook Connection Status
router.get('/status', auth, async (req, res) => {
  try {
    const userId = req.user?._id || req.user?.id;
    const user = await User.findById(userId).lean();

    const platforms = {
      googleAds: { connected: user?.connectedChannels?.googleAds === true, connectedAt: null },
      facebookAds: { connected: user?.connectedChannels?.facebookAds === true, connectedAt: null },
      metaAds: { connected: user?.connectedChannels?.metaAds === true, connectedAt: null },
      shopify: { connected: user?.connectedChannels?.shopify === true, connectedAt: null },
    };

    const connectedPlatforms = Object.entries(platforms)
      .filter(([, v]) => v.connected === true)
      .map(([k]) => k);

    res.json({ platforms, connectedPlatforms });
  } catch (err) {
    console.error('Error checking connection status:', err.message);
    res.status(500).json({ msg: 'Failed to fetch connection status' });
  }
});
// Step 4: Fetch Ads campaigns + insights
router.get("/ads", auth, async (req, res) => {
  try {
    // 1️⃣ Find FB account doc
    let fbAccount = await FbAds.findOne({ userId: req.user._id });
    if (!fbAccount) {
      return res.status(400).json({ error: "Facebook Ads not connected" });
    }

    if (!fbAccount.accessToken) {
      return res.status(400).json({ error: "Access token not found" });
    }

    const accessToken = fbAccount.accessToken;

    // 2️⃣ Request full ad account details
    const fields =
      "id,account_id,account_status,account_name,business_name,currency,timezone_name,spend_cap,amount_spent";

    const accountsRes = await axios.get(
      "https://graph.facebook.com/v19.0/me/adaccounts",
      {
        params: { access_token: accessToken, fields },
      }
    );

    const adAccounts = accountsRes.data.data || [];
    if (!adAccounts.length)
      return res.status(404).json({ error: "No ad accounts found" });

    // 3️⃣ Get existing connected account IDs from DB
    const existingAccountsMap = {};
    fbAccount.accounts.forEach(acc => {
      existingAccountsMap[acc.accountId] = acc.connected || false;
    });

    // 4️⃣ Format & store each account in DB
    const formattedAccounts = adAccounts.map((acc) => ({
      accountId: acc.id,
      accountName: acc.account_name || "Unknown",
      accountStatus: acc.account_status || 0,
      businessName: acc.business_name || "N/A",
      currency: acc.currency || "N/A",
      timezone: acc.timezone_name || "N/A",
      spendCap: acc.spend_cap || "0",
      amountSpent: acc.amount_spent || "0",
      connected: existingAccountsMap[acc.id] || false, // ✅ preserve connected status
      insights: [],
    }));

    // 5️⃣ Save to DB
    fbAccount.accounts = formattedAccounts;
    fbAccount.lastFetched = new Date();
    await fbAccount.save();

    // 6️⃣ Return saved accounts
    res.json({
      message: "Facebook Ad Accounts fetched successfully",
      accounts: fbAccount.accounts,
    });
  } catch (err) {
    console.error("❌ FB Ads fetch error:", err.response?.data || err.message);
    res.status(500).json({ error: "Failed to fetch Facebook Ads accounts" });
  }
});



// POST: Connect a specific ad account
router.post("/connect-account", auth, async (req, res) => {
  const { accountId } = req.body;

  try {
    const fbAccount = await FbAds.findOne({ userId: req.user._id });
    if (!fbAccount) return res.status(400).json({ error: "No Facebook account found" });

    const selectedAccount = fbAccount.accounts.find(acc => acc.accountId === accountId);
    if (!selectedAccount)
      return res.status(404).json({ error: "Account not found" });

    // Toggle connection for this specific account only (no longer disconnect all)
    const wasConnected = selectedAccount.connected;
    selectedAccount.connected = !wasConnected;

    if (selectedAccount.connected) {
      // Connect this account and fetch insights
      try {
        const accessToken = fbAccount.accessToken;
        const insightsRes = await axios.get(
          `https://graph.facebook.com/v19.0/${accountId}/insights`,
          {
            params: {
              fields: "account_name,campaign_name,impressions,clicks,spend,actions",
              date_preset: "last_30d",
              access_token: accessToken,
            },
          }
        );

        selectedAccount.insights = insightsRes.data.data || [];
        fbAccount.lastFetched = new Date();
      } catch (insightsErr) {
        console.error("⚠️ Failed to fetch insights, but account still connected:", insightsErr.message);
        // Still mark as connected even if insights fail
        selectedAccount.insights = [];
      }
    } else {
      // Disconnect - clear insights
      selectedAccount.insights = [];
    }

    await fbAccount.save();

    // Count currently connected accounts
    const connectedCount = fbAccount.accounts.filter(acc => acc.connected).length;
    const totalAccounts = fbAccount.accounts.length;

    res.json({
      message: selectedAccount.connected
        ? "Ad account connected successfully"
        : "Ad account disconnected",
      account: selectedAccount,
      connectedCount,
      totalAccounts,
      insights: selectedAccount.insights,
    });
  } catch (err) {
    console.error("❌ FB connect-account error:", err.response?.data || err.message);
    res.status(500).json({ error: "Failed to connect/disconnect ad account" });
  }
});


router.get("/insights", auth, async (req, res) => {
  try {
    const { date_preset = 'last_7d', fields } = req.query;
    
    const fbAccount = await FbAds.findOne({ userId: req.user._id });
    if (!fbAccount) {
      return res.status(400).json({ error: "No Facebook account found" });
    }

    // Get connected accounts only
    const connectedAccounts = fbAccount.accounts.filter(acc => acc.connected);
    
    if (connectedAccounts.length === 0) {
      return res.json({ 
        insights: [], 
        connectedAccounts: [],
        message: "No connected Facebook ad accounts found" 
      });
    }

    const accessToken = fbAccount.accessToken;
    const allInsights = [];
    const accountsInfo = [];

    // Default fields for dashboard
    const insightFields = fields || "account_name,campaign_name,impressions,clicks,spend,actions,ctr,cpc,date_start,date_stop";

    for (const account of connectedAccounts) {
      try {
        // Get account insights
        const insightsRes = await axios.get(
          `https://graph.facebook.com/v19.0/${account.accountId}/insights`,
          {
            params: {
              fields: insightFields,
              date_preset: date_preset,
              level: 'campaign', // Can be 'account', 'campaign', 'adset', or 'ad'
              access_token: accessToken,
              breakdowns: 'country', // Optional: add breakdowns
              time_increment: 1, // Daily data
            },
          }
        );

        // Add account info to each insight
        const insights = insightsRes.data.data || [];
        insights.forEach(insight => {
          insight.accountId = account.accountId;
          insight.accountName = account.accountName;
          insight.businessName = account.businessName;
        });

        allInsights.push(...insights);

        // Store account info
        accountsInfo.push({
          accountId: account.accountId,
          accountName: account.accountName,
          businessName: account.businessName
        });

        // Update stored insights in database
        account.insights = insights;
        account.lastFetched = new Date();

      } catch (err) {
        console.error(`❌ Failed to fetch insights for account ${account.accountId}:`, err.response?.data || err.message);
        
        // Use cached insights if available
        if (account.insights && account.insights.length > 0) {
          allInsights.push(...account.insights);
          accountsInfo.push({
            accountId: account.accountId,
            accountName: account.accountName,
            businessName: account.businessName,
            usingCachedData: true
          });
        }
      }
    }

    // Save updated account data
    await fbAccount.save();

    // Calculate summary metrics
    const summary = calculateSummaryMetrics(allInsights);

    res.json({
      insights: allInsights,
      connectedAccounts: accountsInfo,
      summary,
      dateRange: date_preset,
      lastUpdated: new Date().toISOString()
    });

  } catch (err) {
    console.error("❌ FB insights error:", err.response?.data || err.message);
    res.status(500).json({ error: "Failed to fetch Facebook insights" });
  }
});

// Helper function to calculate summary metrics
function calculateSummaryMetrics(insights) {
  const summary = {
    totalSpend: 0,
    totalClicks: 0,
    totalImpressions: 0,
    totalReach: 0,
    totalActions: 0,
    avgCtr: 0,
    avgCpc: 0,
    avgCpm: 0,
    campaignCount: 0,
    dateRange: {
      start: null,
      end: null
    }
  };

  if (insights.length === 0) return summary;

  let totalCtr = 0;
  let totalCpc = 0;
  let totalCpm = 0;
  let validCtrCount = 0;
  let validCpcCount = 0;
  let validCpmCount = 0;

  const uniqueCampaigns = new Set();
  const dates = [];

  insights.forEach(insight => {
    // Totals
    summary.totalSpend += parseFloat(insight.spend || 0);
    summary.totalClicks += parseInt(insight.clicks || 0);
    summary.totalImpressions += parseInt(insight.impressions || 0);
    summary.totalReach += parseInt(insight.reach || 0);

    // Actions
    if (insight.actions) {
      insight.actions.forEach(action => {
        summary.totalActions += parseInt(action.value || 0);
      });
    }

    // Averages (only include valid values)
    const ctr = parseFloat(insight.ctr || 0);
    const cpc = parseFloat(insight.cpc || 0);
    const cpm = parseFloat(insight.cpm || 0);

    if (ctr > 0) {
      totalCtr += ctr;
      validCtrCount++;
    }
    if (cpc > 0) {
      totalCpc += cpc;
      validCpcCount++;
    }
    if (cpm > 0) {
      totalCpm += cpm;
      validCpmCount++;
    }

    // Unique campaigns
    if (insight.campaign_name) {
      uniqueCampaigns.add(insight.campaign_name);
    }

    // Date range
    if (insight.date_start) {
      dates.push(new Date(insight.date_start));
    }
  });

  // Calculate averages
  summary.avgCtr = validCtrCount > 0 ? (totalCtr / validCtrCount) : 0;
  summary.avgCpc = validCpcCount > 0 ? (totalCpc / validCpcCount) : 0;
  summary.avgCpm = validCpmCount > 0 ? (totalCpm / validCpmCount) : 0;

  // Campaign count
  summary.campaignCount = uniqueCampaigns.size;

  // Date range
  if (dates.length > 0) {
    dates.sort((a, b) => a - b);
    summary.dateRange.start = dates[0].toISOString().split('T')[0];
    summary.dateRange.end = dates[dates.length - 1].toISOString().split('T')[0];
  }

  return summary;
}

router.get("/campaigns", auth, async (req, res) => {
  try {
    const { date_preset = 'last_7d', account_id } = req.query;
    
    const fbAccount = await FbAds.findOne({ userId: req.user._id });
    if (!fbAccount) {
      return res.status(400).json({ error: "No Facebook account found" });
    }

    let accountsToFetch = fbAccount.accounts.filter(acc => acc.connected);
    
    // Filter by specific account if provided
    if (account_id) {
      accountsToFetch = accountsToFetch.filter(acc => acc.accountId === account_id);
    }

    if (accountsToFetch.length === 0) {
      return res.json({ campaigns: [], message: "No connected accounts found" });
    }

    const accessToken = fbAccount.accessToken;
    const allCampaigns = [];

    for (const account of accountsToFetch) {
      try {
        // Get campaigns for this account
        const campaignsRes = await axios.get(
          `https://graph.facebook.com/v19.0/${account.accountId}/campaigns`,
          {
            params: {
              fields: "name,status,objective,created_time,updated_time,insights{impressions,clicks,spend,ctr,cpc,actions}",
              date_preset: date_preset,
              access_token: accessToken,
            },
          }
        );

        const campaigns = campaignsRes.data.data || [];
        campaigns.forEach(campaign => {
          campaign.accountId = account.accountId;
          campaign.accountName = account.accountName;
          campaign.businessName = account.businessName;
        });

        allCampaigns.push(...campaigns);

      } catch (err) {
        console.error(`❌ Failed to fetch campaigns for account ${account.accountId}:`, err.response?.data || err.message);
      }
    }

    res.json({
      campaigns: allCampaigns,
      dateRange: date_preset,
      lastUpdated: new Date().toISOString()
    });

  } catch (err) {
    console.error("❌ FB campaigns error:", err.response?.data || err.message);
    res.status(500).json({ error: "Failed to fetch Facebook campaigns" });
  }
});

// Endpoint to refresh insights for specific account
router.post("/refresh-insights", auth, async (req, res) => {
  try {
    const { accountId, date_preset = 'last_7d' } = req.body;
    
    const fbAccount = await FbAds.findOne({ userId: req.user._id });
    if (!fbAccount) {
      return res.status(400).json({ error: "No Facebook account found" });
    }

    const account = fbAccount.accounts.find(acc => acc.accountId === accountId && acc.connected);
    if (!account) {
      return res.status(404).json({ error: "Connected account not found" });
    }

    const accessToken = fbAccount.accessToken;

    // Fetch fresh insights
    const insightsRes = await axios.get(
      `https://graph.facebook.com/v19.0/${accountId}/insights`,
      {
        params: {
          fields: "account_name,campaign_name,impressions,clicks,spend,actions,ctr,cpc,date_start,date_stop",
          date_preset: date_preset,
          level: 'campaign',
          access_token: accessToken,
          time_increment: 1,
        },
      }
    );

    // Update stored insights
    account.insights = insightsRes.data.data || [];
    account.lastFetched = new Date();
    
    await fbAccount.save();

    res.json({
      message: "Insights refreshed successfully",
      insights: account.insights,
      lastUpdated: account.lastFetched
    });

  } catch (err) {
    console.error("❌ FB refresh insights error:", err.response?.data || err.message);
    res.status(500).json({ error: "Failed to refresh insights" });
  }
});


router.post("/disconnect", auth, async (req, res) => {
  try { 

    // 3️⃣ Update user's connectedChannels
    const user = await User.findById(req.user._id);
    if (user) {
      user.connectedChannels.facebookAds = false;
      await user.save();
    }

    res.json({ message: "Facebook account disconnected successfully" });
  } catch (err) {
    console.error("❌ FB disconnect error:", err.message);
    res.status(500).json({ error: "Failed to disconnect Facebook account" });
  }
});


module.exports = router;
