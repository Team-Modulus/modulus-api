const express = require('express');
const User = require('../models/User');
const auth = require('../utils/authMiddleware');
const { oauth2Client, scopes } = require('../utils/googleClient');
const { google } = require('googleapis');
const jwt = require('jsonwebtoken');
const { GoogleAdsApi } = require('google-ads-api');
const dotenv = require('dotenv');
dotenv.config();

const router = express.Router();


const initGoogleAdsClient = () => {
  return new GoogleAdsApi({
    client_id: process.env.GOOGLE_CLIENT_ID,
    client_secret: process.env.GOOGLE_CLIENT_SECRET,
    developer_token: process.env.GOOGLE_ADS_DEVELOPER_TOKEN,
  });
};

// Step 1: Redirect to Google Auth
router.get('/connect', auth, (req, res) => {
  const url = oauth2Client.generateAuthUrl({
    access_type: 'offline',
    prompt: 'consent',
    scope: scopes,
    state: req.headers.authorization?.split(" ")[1]
  });
  res.json({ url });
});

// Step 2: Google Callback
router.get('/callback', async (req, res) => {
  const { code, state } = req.query;
  const { tokens } = await oauth2Client.getToken(code);
  oauth2Client.setCredentials(tokens);

  let decoded;
  try {
    decoded = jwt.verify(state, process.env.JWT_SECRET);
  } catch (e) {
    return res.status(401).send('Invalid state token');
  }
  const user = await User.findById(decoded.user.id);
  if (!user) return res.status(404).send('User not found');

  user.connectedChannels.googleAds = {
    accessToken: tokens.access_token,
    refreshToken: tokens.refresh_token,
    connected: true
  };
  await user.save();

  res.redirect('http://localhost:5173/dashboard');
});


router.get('/status', auth, async (req, res) => {
  try {
    const user = await User.findById(req.user.id);
    const isConnected = !!(user.connectedChannels?.googleAds?.refreshToken);
    
    res.json({ 
      isConnected,
      connectedAt: user.connectedChannels?.googleAds?.connectedAt 
    });
  } catch (err) {
    res.status(500).json({ msg: 'Failed to check connection status' });
  }
});


router.delete('/disconnect', auth, async (req, res) => {
  try {
    await User.findByIdAndUpdate(req.user.id, {
      $unset: { 'connectedChannels.googleAds': 1 }
    });
    res.json({ success: true, message: 'Google Ads disconnected' });
  } catch (err) {
    res.status(500).json({ msg: 'Failed to disconnect Google Ads' });
  }
});
// Step 3: Fetch Google Ads accounts

// router.get('/accounts', auth, async (req, res) => {
//   try {
//     const user = req.user;
//     const { accessToken, refreshToken } = user.connectedChannels.googleAds;
//     if (!accessToken) return res.status(401).json({ msg: 'Not connected to Google Ads' });

//     oauth2Client.setCredentials({ access_token: accessToken, refresh_token: refreshToken });

//     const ads = google.ads({
//       version: 'v12',
//       auth: oauth2Client
//     });

//     const result = await ads.customers.listAccessibleCustomers({});
//     res.json(result.data);
//   } catch (err) {
//     console.error(err);
//     res.status(500).json({ msg: 'Failed to fetch Google Ads accounts' });
//   }
// });


// First, install the Google Ads API package
// npm install google-ads-api


// router.get('/accounts', auth, async (req, res) => {
//   try {
//     const user = await User.findById(req.user.id);
//     const { accessToken, refreshToken } = user.connectedChannels.googleAds;

//     if (!accessToken) {
//       return res.status(401).json({ msg: 'Not connected to Google Ads' });
//     }

//     // Initialize Google Ads API client
//     const client = new GoogleAdsApi({
//       client_id: process.env.GOOGLE_CLIENT_ID,
//       client_secret: process.env.GOOGLE_CLIENT_SECRET,
//       developer_token: process.env.GOOGLE_ADS_DEVELOPER_TOKEN,
//     });

//     // Create customer client with the access token
//     const customer = client.Customer({
//       customer_id: user.googleAdsCustomerId, // You need to store this
//       refresh_token: refreshToken,
//       // Alternatively, if you have the access token:
//       // login_customer_id: 'your-manager-account-id' // if applicable
//     });

//     // List accessible customers
//     const accessibleCustomers = await customer.listAccessibleCustomers();
    
//     res.json({ 
//       accounts: accessibleCustomers.resource_names || [],
//       customer_ids: accessibleCustomers.resource_names?.map(name => 
//         name.split('/')[1] // Extract customer ID from resource name
//       )
//     });

//   } catch (err) {
//     console.error('Google Ads fetch error:', err.message);
    
//     // Handle specific error types
//     if (err.message.includes('AUTHENTICATION_ERROR')) {
//       return res.status(401).json({ msg: 'Google Ads authentication failed' });
//     }
    
//     res.status(500).json({ 
//       msg: 'Failed to fetch Google Ads accounts',
//       error: err.message 
//     });
//   }
// });

// router.get('/accounts', auth, async (req, res) => {
//   try {
//     const user = await User.findById(req.user.id);
//     const { accessToken, refreshToken } = user.connectedChannels.googleAds;

//     if (!refreshToken) {
//       return res.status(401).json({ msg: 'Not connected to Google Ads' });
//     }

//     // Initialize Google Ads API client
//     const client = new GoogleAdsApi({
//       client_id: process.env.GOOGLE_CLIENT_ID,
//       client_secret: process.env.GOOGLE_CLIENT_SECRET,
//       developer_token: process.env.GOOGLE_ADS_DEVELOPER_TOKEN,
//     });

//     // THIS IS THE CORRECT WAY - Direct method on client object
//     const customers = await client.listAccessibleCustomers(refreshToken);
    
//     res.json({ 
//       accounts: customers.resource_names || [],
//       customer_ids: customers.resource_names?.map(name => 
//         name.split('/')[1]  // Extract customer ID from "customers/1234567890"
//       ) || []
//     });

//   } catch (err) {
//     console.error('Google Ads fetch error:', err.message);
    
//     if (err.message.includes('AUTHENTICATION_ERROR') || err.message.includes('UNAUTHENTICATED')) {
//       return res.status(401).json({ 
//         msg: 'Google Ads authentication failed. Please reconnect your account.' 
//       });
//     }
    
//     res.status(500).json({ 
//       msg: 'Failed to fetch Google Ads accounts',
//       error: process.env.NODE_ENV === 'development' ? err.message : 'Internal server error'
//     });
//   }
// });






// STEP 2: Helper function to get user's refresh token
const getUserRefreshToken = async (userId) => {
  const user = await User.findById(userId);
  const refreshToken = user.connectedChannels?.googleAds?.refreshToken;
  
  if (!refreshToken) {
    throw new Error('Not connected to Google Ads');
  }
  
  return refreshToken;
};

router.get('/accounts', auth, async (req, res) => {
  try {
    const refreshToken = await getUserRefreshToken(req.user.id);
    const client = initGoogleAdsClient();
    
    const customers = await client.listAccessibleCustomers(refreshToken);
    
    res.json({ 
      accounts: customers.resource_names || [],
      customer_ids: customers.resource_names?.map(name => 
        name.split('/')[1]
      ) || []
    });
  } catch (err) {
    console.error('Google Ads accounts error:', err.message);
    
    if (err.message.includes('Not connected')) {
      return res.status(401).json({ msg: err.message });
    }
    
    res.status(500).json({ 
      msg: 'Failed to fetch Google Ads accounts',
      error: process.env.NODE_ENV === 'development' ? err.message : 'Internal server error'
    });
  }
});





router.get('/campaigns/:customerId', auth, async (req, res) => {
  try {
    const refreshToken = await getUserRefreshToken(req.user.id);
    const { customerId } = req.params;
    const client = initGoogleAdsClient();
    
    const customer = client.Customer({
      customer_id: customerId,
      refresh_token: refreshToken,
    });

    const campaigns = await customer.report({
      entity: "campaign",
      attributes: [
        "campaign.id",
        "campaign.name", 
        "campaign.status",
        "campaign.advertising_channel_type",
        "campaign_budget.amount_micros",
        "campaign.bidding_strategy_type"
      ],
      metrics: [
        "metrics.cost_micros",
        "metrics.clicks", 
        "metrics.impressions",
        "metrics.ctr",
        "metrics.average_cpc",
        "metrics.conversions",
        "metrics.conversion_rate"
      ],
      segments: ["segments.date"],
      constraints: {
        "segments.date": "LAST_30_DAYS"
      },
      limit: 50
    });

    res.json({ campaigns });
  } catch (err) {
    console.error('Campaigns fetch error:', err.message);
    res.status(500).json({ msg: 'Failed to fetch campaigns' });
  }
});

// Get ad groups for a specific customer
router.get('/adgroups/:customerId', auth, async (req, res) => {
  try {
    const refreshToken = await getUserRefreshToken(req.user.id);
    const { customerId } = req.params;
    const { campaignId } = req.query; // Optional filter
    const client = initGoogleAdsClient();
    
    const customer = client.Customer({
      customer_id: customerId,
      refresh_token: refreshToken,
    });

    let constraints = {
      "segments.date": "LAST_30_DAYS"
    };
    
    if (campaignId) {
      constraints["campaign.id"] = campaignId;
    }

    const adGroups = await customer.report({
      entity: "ad_group",
      attributes: [
        "ad_group.id",
        "ad_group.name",
        "ad_group.status",
        "ad_group.type",
        "campaign.id",
        "campaign.name"
      ],
      metrics: [
        "metrics.cost_micros",
        "metrics.clicks",
        "metrics.impressions",
        "metrics.ctr",
        "metrics.conversions"
      ],
      segments: ["segments.date"],
      constraints,
      limit: 100
    });

    res.json({ adGroups });
  } catch (err) {
    console.error('Ad groups fetch error:', err.message);
    res.status(500).json({ msg: 'Failed to fetch ad groups' });
  }
});

// Get keywords for a specific customer
router.get('/keywords/:customerId', auth, async (req, res) => {
  try {
    const refreshToken = await getUserRefreshToken(req.user.id);
    const { customerId } = req.params;
    const { campaignId, adGroupId } = req.query;
    const client = initGoogleAdsClient();
    
    const customer = client.Customer({
      customer_id: customerId,
      refresh_token: refreshToken,
    });

    let constraints = {
      "segments.date": "LAST_30_DAYS"
    };
    
    if (campaignId) constraints["campaign.id"] = campaignId;
    if (adGroupId) constraints["ad_group.id"] = adGroupId;

    const keywords = await customer.report({
      entity: "ad_group_criterion",
      attributes: [
        "ad_group_criterion.criterion_id",
        "ad_group_criterion.keyword.text",
        "ad_group_criterion.keyword.match_type",
        "ad_group_criterion.status",
        "ad_group_criterion.quality_info.quality_score",
        "ad_group.id",
        "ad_group.name",
        "campaign.id",
        "campaign.name"
      ],
      metrics: [
        "metrics.cost_micros",
        "metrics.clicks",
        "metrics.impressions",
        "metrics.ctr",
        "metrics.average_cpc",
        "metrics.conversions"
      ],
      segments: ["segments.date"],
      constraints: {
        ...constraints,
        "ad_group_criterion.type": "KEYWORD"
      },
      limit: 200
    });

    res.json({ keywords });
  } catch (err) {
    console.error('Keywords fetch error:', err.message);
    res.status(500).json({ msg: 'Failed to fetch keywords' });
  }
});

// Get ads for a specific customer
router.get('/ads/:customerId', auth, async (req, res) => {
  try {
    const refreshToken = await getUserRefreshToken(req.user.id);
    const { customerId } = req.params;
    const { campaignId, adGroupId } = req.query;
    const client = initGoogleAdsClient();
    
    const customer = client.Customer({
      customer_id: customerId,
      refresh_token: refreshToken,
    });

    let constraints = {
      "segments.date": "LAST_30_DAYS"
    };
    
    if (campaignId) constraints["campaign.id"] = campaignId;
    if (adGroupId) constraints["ad_group.id"] = adGroupId;

    const ads = await customer.report({
      entity: "ad_group_ad",
      attributes: [
        "ad_group_ad.ad.id",
        "ad_group_ad.ad.name",
        "ad_group_ad.status",
        "ad_group_ad.ad.type",
        "ad_group_ad.ad.responsive_search_ad.headlines",
        "ad_group_ad.ad.responsive_search_ad.descriptions",
        "ad_group.id",
        "ad_group.name",
        "campaign.id",
        "campaign.name"
      ],
      metrics: [
        "metrics.cost_micros",
        "metrics.clicks",
        "metrics.impressions",
        "metrics.ctr",
        "metrics.conversions"
      ],
      segments: ["segments.date"],
      constraints,
      limit: 100
    });

    res.json({ ads });
  } catch (err) {
    console.error('Ads fetch error:', err.message);
    res.status(500).json({ msg: 'Failed to fetch ads' });
  }
});

// Get performance report with custom metrics
router.get('/performance/:customerId', auth, async (req, res) => {
  try {
    const refreshToken = await getUserRefreshToken(req.user.id);
    const { customerId } = req.params;
    const { 
      entity = 'campaign', 
      dateRange = 'LAST_30_DAYS',
      groupBy = 'segments.date'
    } = req.query;
    
    const client = initGoogleAdsClient();
    
    const customer = client.Customer({
      customer_id: customerId,
      refresh_token: refreshToken,
    });

    // Define attribute sets for different entities
    const entityAttributes = {
      campaign: ["campaign.id", "campaign.name", "campaign.status"],
      ad_group: ["ad_group.id", "ad_group.name", "campaign.name"],
      keyword: ["ad_group_criterion.keyword.text", "ad_group_criterion.keyword.match_type"],
      ad: ["ad_group_ad.ad.id", "ad_group_ad.ad.name", "ad_group_ad.status"]
    };

    const performance = await customer.report({
      entity,
      attributes: entityAttributes[entity] || entityAttributes.campaign,
      metrics: [
        "metrics.cost_micros",
        "metrics.clicks",
        "metrics.impressions",
        "metrics.ctr",
        "metrics.average_cpc",
        "metrics.conversions",
        "metrics.conversion_rate",
        "metrics.search_impression_share",
        "metrics.search_rank_lost_impression_share"
      ],
      segments: [groupBy],
      constraints: {
        [`segments.date`]: dateRange
      },
      limit: 1000
    });

    res.json({ performance, entity, dateRange });
  } catch (err) {
    console.error('Performance fetch error:', err.message);
    res.status(500).json({ msg: 'Failed to fetch performance data' });
  }
});

// Get search terms report
router.get('/search-terms/:customerId', auth, async (req, res) => {
  try {
    const refreshToken = await getUserRefreshToken(req.user.id);
    const { customerId } = req.params;
    const client = initGoogleAdsClient();
    
    const customer = client.Customer({
      customer_id: customerId,
      refresh_token: refreshToken,
    });

    const searchTerms = await customer.query(`
      SELECT 
        search_term_view.search_term,
        search_term_view.status,
        ad_group.id,
        ad_group.name,
        campaign.id,
        campaign.name,
        metrics.clicks,
        metrics.impressions,
        metrics.ctr,
        metrics.cost_micros,
        metrics.conversions
      FROM search_term_view 
      WHERE segments.date DURING LAST_30_DAYS
        AND metrics.impressions > 0
      ORDER BY metrics.clicks DESC
      LIMIT 500
    `);

    res.json({ searchTerms });
  } catch (err) {
    console.error('Search terms fetch error:', err.message);
    res.status(500).json({ msg: 'Failed to fetch search terms' });
  }
});

// Get customer info
router.get('/customer/:customerId', auth, async (req, res) => {
  try {
    const refreshToken = await getUserRefreshToken(req.user.id);
    const { customerId } = req.params;
    const client = initGoogleAdsClient();
    
    const customer = client.Customer({
      customer_id: customerId,
      refresh_token: refreshToken,
    });

    const customerInfo = await customer.query(`
      SELECT 
        customer.id,
        customer.descriptive_name,
        customer.currency_code,
        customer.time_zone,
        customer.auto_tagging_enabled,
        customer.test_account,
        customer.manager
      FROM customer
      LIMIT 1
    `);

    res.json({ customer: customerInfo[0]?.customer || {} });
  } catch (err) {
    console.error('Customer info fetch error:', err.message);
    res.status(500).json({ msg: 'Failed to fetch customer info' });
  }
});

// Advanced analytics - Conversion tracking
router.get('/conversions/:customerId', auth, async (req, res) => {
  try {
    const refreshToken = await getUserRefreshToken(req.user.id);
    const { customerId } = req.params;
    const client = initGoogleAdsClient();
    
    const customer = client.Customer({
      customer_id: customerId,
      refresh_token: refreshToken,
    });

    const conversions = await customer.query(`
      SELECT 
        campaign.id,
        campaign.name,
        segments.conversion_action_name,
        segments.conversion_action_category,
        segments.date,
        metrics.conversions,
        metrics.conversions_value,
        metrics.cost_per_conversion,
        metrics.conversion_rate
      FROM campaign
      WHERE segments.date DURING LAST_30_DAYS
        AND metrics.conversions > 0
      ORDER BY metrics.conversions DESC
    `);

    res.json({ conversions });
  } catch (err) {
    console.error('Conversions fetch error:', err.message);
    res.status(500).json({ msg: 'Failed to fetch conversion data' });
  }
});


module.exports = router;
