# Shopify Integration Setup Guide

## Required Environment Variables

You need to add the following environment variables to your `.env` file:

```env
SHOPIFY_API_KEY=your_api_key_here
SHOPIFY_API_SECRET=your_api_secret_here
SHOPIFY_REDIRECT_URI=https://your-backend-domain.com/api/shopify/callback
```

## How to Get Shopify API Credentials

### Step 1: Create a Shopify Partner Account
1. Go to [https://partners.shopify.com](https://partners.shopify.com)
2. Sign up for a free Shopify Partner account (if you don't have one)
3. Log in to your Partner Dashboard

### Step 2: Create a New App
1. In your Partner Dashboard, click on **"Apps"** in the left sidebar
2. Click **"Create app"** button
3. Choose **"Create app manually"** (not from template)
4. Fill in the app details:
   - **App name**: Your app name (e.g., "Modulus Integration")
   - **App URL**: Your app's homepage URL
   - Click **"Create app"**

### Step 3: Configure OAuth Settings
1. In your app settings, go to **"App setup"** tab
2. Scroll down to **"App URL"** section:
   - **Allowed redirection URL(s)**: Add your callback URL
     ```
     https://your-backend-domain.com/api/shopify/callback
     ```
     Or for local development:
     ```
     http://localhost:5000/api/shopify/callback
     ```

### Step 4: Configure API Scopes
1. In the same **"App setup"** tab, scroll to **"Admin API integration"** section
2. Click **"Configure"** under Admin API integration
3. Select the following scopes (permissions):
   - ✅ `read_orders` - Read orders
   - ✅ `read_products` - Read products
   - ✅ `read_analytics` - Read analytics
   - ✅ `read_customers` - Read customers
   - ✅ `read_inventory` - Read inventory
4. Click **"Save"**

### Step 5: Get Your API Credentials
1. In your app settings, go to **"API credentials"** tab
2. You'll see:
   - **Client ID** (this is your `SHOPIFY_API_KEY`)
   - **Client secret** (this is your `SHOPIFY_API_SECRET`)
3. Copy these values

### Step 6: Install the App (for Testing)
1. Go to **"Overview"** tab in your app
2. Click **"Get shareable link"** or **"Test on development store"**
3. Create a development store if needed (free)
4. Install your app on the development store to test

## Setting Up Your .env File

Add these variables to your `.env` file in the `server` directory:

```env
# Shopify Integration
SHOPIFY_API_KEY=your_client_id_from_step_5
SHOPIFY_API_SECRET=your_client_secret_from_step_5
SHOPIFY_REDIRECT_URI=http://localhost:5000/api/shopify/callback
```

**For Production:**
```env
SHOPIFY_REDIRECT_URI=https://your-production-domain.com/api/shopify/callback
```

## Important Notes

1. **Redirect URI Must Match Exactly**: The redirect URI in your Shopify app settings must exactly match the `SHOPIFY_REDIRECT_URI` in your `.env` file (including `http://` vs `https://`)

2. **Development vs Production**: 
   - For local development, use: `http://localhost:5000/api/shopify/callback`
   - For production, use: `https://your-domain.com/api/shopify/callback`

3. **Shop Domain Format**: Users will enter their shop domain in one of these formats:
   - `mystore.myshopify.com` (full domain)
   - `mystore` (just the shop name - the code will add `.myshopify.com`)

4. **API Version**: The code uses Shopify API version `2023-10`. Make sure your app is compatible with this version.

## Testing the Integration

1. Start your backend server
2. Make sure all environment variables are set
3. Try connecting a Shopify store through your frontend
4. The OAuth flow should redirect to Shopify, then back to your callback URL

## Troubleshooting

- **"Invalid redirect_uri"**: Make sure the redirect URI in Shopify app settings matches exactly with your `.env` file
- **"Invalid API credentials"**: Double-check your `SHOPIFY_API_KEY` and `SHOPIFY_API_SECRET`
- **"Shop not found"**: Make sure the user enters a valid Shopify shop domain

