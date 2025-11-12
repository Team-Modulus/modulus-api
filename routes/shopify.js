const express = require('express');
const axios = require('axios');
const dotenv = require('dotenv');
const User = require('../models/User');
const auth = require('../utils/authMiddleware');
const ShopifyAccount = require('../models/Shopify');

dotenv.config();
const router = express.Router();

const SHOPIFY_REDIRECT_URI = process.env.SHOPIFY_REDIRECT_URI;
const SHOPIFY_API_VERSION = '2023-10';

// Step 1: Get Shopify OAuth URL
router.get('/connect', auth, async (req, res) => {
  try {
    const { shopDomain } = req.query;
    
    if (!shopDomain) {
      return res.status(400).json({ 
        error: 'Shop domain is required',
        message: 'Please provide your Shopify shop domain (e.g., mystore.myshopify.com or just mystore)'
      });
    }

    // Clean shop domain - handle various input formats
    let cleanDomain = shopDomain.trim();
    
    // Remove admin.shopify.com/store/ prefix if present
    cleanDomain = cleanDomain.replace(/^https?:\/\/(admin\.shopify\.com\/store\/|www\.shopify\.com\/store\/)/i, '');
    
    // Remove .myshopify.com if present
    cleanDomain = cleanDomain.replace(/\.myshopify\.com$/i, '');
    
    // Remove any trailing slashes or paths
    cleanDomain = cleanDomain.split('/')[0].split('?')[0];
    
    // Remove any special characters (keep only alphanumeric, hyphens, underscores)
    cleanDomain = cleanDomain.replace(/[^a-zA-Z0-9\-_]/g, '');
    
    // Add .myshopify.com if not already present
    if (!cleanDomain.includes('.')) {
      cleanDomain = `${cleanDomain}.myshopify.com`;
    }
    
    // Final validation
    if (!cleanDomain.endsWith('.myshopify.com')) {
      return res.status(400).json({ 
        error: 'Invalid shop domain format',
        message: 'Shop domain must end with .myshopify.com (e.g., mystore.myshopify.com)'
      });
    }
    
    const state = req.user._id.toString();
    const scopes = [
      'read_orders',
      'read_products',
      'read_analytics',
      'read_customers',
      'read_inventory'
    ].join(',');

    const redirectUri = SHOPIFY_REDIRECT_URI;
    
    if (!redirectUri) {
      return res.status(500).json({ 
        error: 'SHOPIFY_REDIRECT_URI is not configured',
        message: 'Please set SHOPIFY_REDIRECT_URI in your .env file'
      });
    }
    
    // Fix redirect URI for localhost - must use http:// not https://
    let finalRedirectUri = redirectUri;
    if (redirectUri.includes('localhost') && redirectUri.startsWith('https://')) {
      finalRedirectUri = redirectUri.replace('https://', 'http://');
      console.warn("⚠️ Changed redirect URI from https:// to http:// for localhost");
    }
    
    const url = `https://${cleanDomain}/admin/oauth/authorize?` +
      `client_id=${process.env.SHOPIFY_API_KEY}&` +
      `scope=${scopes}&` +
      `redirect_uri=${encodeURIComponent(finalRedirectUri)}&` +
      `state=${state}`;
    
    console.log("Shopify Auth URL:", url);
    console.log("Shop Domain:", cleanDomain);
    console.log("Redirect URI being used:", finalRedirectUri);
    console.log("⚠️ Make sure this EXACT redirect URI is whitelisted in your Shopify app settings!");
    console.log("⚠️ For localhost, it MUST be http:// (not https://)");
    
    res.json({ url, shopDomain: cleanDomain, redirectUri: finalRedirectUri });
  } catch (err) {
    console.error('Shopify connect error:', err);
    res.status(500).json({ error: 'Failed to generate Shopify OAuth URL' });
  }
});

// Step 2: Shopify Callback
router.get('/callback', async (req, res) => {
  const { code, shop, state } = req.query;

  if (!code || !shop || !state) {
    return res.status(400).send('Missing required parameters');
  }

  try {
    // 1️⃣ Find user
    const user = await User.findById(state);
    if (!user) return res.status(404).send('User not found');

    // 2️⃣ Exchange code for access token
    const tokenResponse = await axios.post(
      `https://${shop}/admin/oauth/access_token`,
      {
        client_id: process.env.SHOPIFY_API_KEY,
        client_secret: process.env.SHOPIFY_API_SECRET,
        code
      }
    );

    const { access_token } = tokenResponse.data;

    // 3️⃣ Get shop info
    const shopInfoResponse = await axios.get(
      `https://${shop}/admin/api/${SHOPIFY_API_VERSION}/shop.json`,
      {
        headers: {
          'X-Shopify-Access-Token': access_token
        }
      }
    );

    const shopInfo = shopInfoResponse.data.shop;

    // 4️⃣ Save or update Shopify account
    let shopifyAccount = await ShopifyAccount.findOne({ userId: user._id });
    
    if (!shopifyAccount) {
      shopifyAccount = new ShopifyAccount({
        userId: user._id,
        accessToken: access_token,
        shopDomain: shop,
        connected: true,
        shops: []
      });
    } else {
      shopifyAccount.accessToken = access_token;
      shopifyAccount.shopDomain = shop;
      shopifyAccount.connected = true;
    }

    // 5️⃣ Check if shop already exists in shops array
    const existingShop = shopifyAccount.shops.find(s => s.shopDomain === shop);
    
    if (!existingShop) {
      shopifyAccount.shops.push({
        shopId: shopInfo.id.toString(),
        shopDomain: shop,
        shopName: shopInfo.name, // Store name from Shopify
        email: shopInfo.email,
        currency: shopInfo.currency,
        timezone: shopInfo.timezone,
        // Additional store info available from shopInfo:
        // domain: shopInfo.domain,
        // phone: shopInfo.phone,
        // plan_name: shopInfo.plan_name,
        connected: true,
        lastFetched: new Date()
      });
    } else {
      // Update existing shop
      existingShop.shopName = shopInfo.name; // Store name
      existingShop.email = shopInfo.email;
      existingShop.currency = shopInfo.currency;
      existingShop.timezone = shopInfo.timezone;
      existingShop.connected = true;
      existingShop.lastFetched = new Date();
    }

    await shopifyAccount.save();

    // 6️⃣ Update user summary
    user.connectedChannels = user.connectedChannels || {};
    user.connectedChannels.shopify = true;
    await user.save();

    res.redirect('https://modulus-frontend-sand.vercel.app/dashboard/integration');
  } catch (err) {
    console.error('Shopify OAuth error:', err.response?.data || err.message);
    res.status(500).send('Shopify authentication failed');
  }
});

// Step 3: Fetch Shopify Shops
router.get("/shops", auth, async (req, res) => {
  try {
    // 1️⃣ Find Shopify account doc
    let shopifyAccount = await ShopifyAccount.findOne({ userId: req.user._id });
    if (!shopifyAccount) {
      return res.status(400).json({ 
        error: "Shopify not connected",
        shops: [] // Always return shops array
      });
    }

    if (!shopifyAccount.accessToken) {
      return res.status(400).json({ 
        error: "Access token not found",
        shops: shopifyAccount.shops || [] // Return existing shops if any
      });
    }

    const accessToken = shopifyAccount.accessToken;
    const shopDomain = shopifyAccount.shopDomain;

    if (!shopDomain) {
      console.error("Shop domain not found in Shopify account");
      return res.json({
        message: "Shop domain not found, using cached data",
        shops: shopifyAccount.shops || [],
      });
    }

    // 2️⃣ Get shop info from Shopify API
    try {
      const shopInfoResponse = await axios.get(
        `https://${shopDomain}/admin/api/${SHOPIFY_API_VERSION}/shop.json`,
        {
          headers: {
            'X-Shopify-Access-Token': accessToken
          }
        }
      );

      const shopInfo = shopInfoResponse.data.shop;

      // 3️⃣ Get existing connected shop IDs from DB
      const existingShopsMap = {};
      (shopifyAccount.shops || []).forEach(shop => {
        existingShopsMap[shop.shopId || shop.shopDomain] = shop.connected || false;
      });

      // 4️⃣ Format shop data
      const formattedShop = {
        shopId: shopInfo.id.toString(),
        shopDomain: shopDomain,
        shopName: shopInfo.name, // Store name from Shopify
        email: shopInfo.email,
        currency: shopInfo.currency || 'USD',
        timezone: shopInfo.timezone || 'UTC',
        // Additional store information available:
        // domain: shopInfo.domain,
        // phone: shopInfo.phone,
        // address1: shopInfo.address1,
        // city: shopInfo.city,
        // province: shopInfo.province,
        // country: shopInfo.country,
        // zip: shopInfo.zip,
        // plan_name: shopInfo.plan_name,
        connected: existingShopsMap[shopInfo.id.toString()] || existingShopsMap[shopDomain] || false,
        lastFetched: new Date()
      };

      // 5️⃣ Check if shop already exists in array
      if (!shopifyAccount.shops) {
        shopifyAccount.shops = [];
      }

      const shopIndex = shopifyAccount.shops.findIndex(
        s => (s.shopId === formattedShop.shopId) || (s.shopDomain === formattedShop.shopDomain)
      );

      if (shopIndex >= 0) {
        // Update existing shop
        shopifyAccount.shops[shopIndex] = formattedShop;
      } else {
        // Add new shop
        shopifyAccount.shops.push(formattedShop);
      }

      // 6️⃣ Save to DB
      shopifyAccount.lastFetched = new Date();
      await shopifyAccount.save();

      // 7️⃣ Return shops
      res.json({
        message: "Shopify shops fetched successfully",
        shops: shopifyAccount.shops || [],
      });
    } catch (apiErr) {
      console.error("Shopify API error:", {
        status: apiErr.response?.status,
        statusText: apiErr.response?.statusText,
        data: apiErr.response?.data,
        message: apiErr.message,
        shopDomain: shopDomain
      });
      
      // Always return shops from DB if API call fails (even if empty array)
      const shops = shopifyAccount.shops || [];
      
      if (shops.length > 0) {
        return res.json({
          message: "Using cached shop data (API call failed)",
          shops: shops,
          warning: "Unable to refresh shop data from Shopify API"
        });
      }
      
      // If no shops in DB, return empty array with helpful message
      return res.json({
        message: "No shops found. Please reconnect your Shopify account.",
        shops: [],
        error: apiErr.response?.data?.errors || apiErr.message
      });
    }
  } catch (err) {
    console.error("❌ Shopify shops fetch error:", err.response?.data || err.message);
    res.status(500).json({ 
      error: "Failed to fetch Shopify shops",
      shops: [] // Always return shops array
    });
  }
});

// POST: Connect/Disconnect a specific shop
router.post("/connect-shop", auth, async (req, res) => {
  const { shopId } = req.body;

  try {
    const shopifyAccount = await ShopifyAccount.findOne({ userId: req.user._id });
    if (!shopifyAccount) {
      return res.status(400).json({ error: "No Shopify account found" });
    }

    // Find shop by shopId or shopDomain
    const selectedShop = shopifyAccount.shops.find(
      shop => (shop.shopId === shopId) || (shop.shopDomain === shopId)
    );
    
    if (!selectedShop) {
      return res.status(404).json({ error: "Shop not found" });
    }

    // Toggle connection for this specific shop
    const wasConnected = selectedShop.connected;
    selectedShop.connected = !wasConnected;
    selectedShop.lastFetched = new Date();

    await shopifyAccount.save();

    // Count currently connected shops
    const connectedCount = shopifyAccount.shops.filter(shop => shop.connected).length;
    const totalShops = shopifyAccount.shops.length;

    res.json({
      message: selectedShop.connected
        ? "Shop connected successfully"
        : "Shop disconnected",
      shop: selectedShop,
      connectedCount,
      totalShops,
    });
  } catch (err) {
    console.error("❌ Shopify connect-shop error:", err.response?.data || err.message);
    res.status(500).json({ error: "Failed to connect/disconnect shop" });
  }
});

// POST: Disconnect Shopify Integration
router.post("/disconnect", auth, async (req, res) => {
  try {
    // 1️⃣ Update user's connectedChannels
    const user = await User.findById(req.user._id);
    if (user) {
      user.connectedChannels = user.connectedChannels || {};
      user.connectedChannels.shopify = false;
      await user.save();
    }

    // 2️⃣ Optionally delete or mark Shopify account as disconnected
    const shopifyAccount = await ShopifyAccount.findOne({ userId: req.user._id });
    if (shopifyAccount) {
      shopifyAccount.connected = false;
      // Optionally clear shops array or keep for reconnection
      // shopifyAccount.shops = [];
      await shopifyAccount.save();
    }

    res.json({ message: "Shopify account disconnected successfully" });
  } catch (err) {
    console.error("❌ Shopify disconnect error:", err.message);
    res.status(500).json({ error: "Failed to disconnect Shopify account" });
  }
});

module.exports = router;

