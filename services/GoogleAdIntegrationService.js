const BaseIntegrationService = require('./BaseIntegrationService');
const { GoogleAdsApi } = require('google-ads-api');

class GoogleAdsIntegrationService extends BaseIntegrationService {
    constructor() {
        super('google_ads');
        this.googleAds = new GoogleAdsApi({
            client_id: process.env.GOOGLE_ADS_CLIENT_ID,
            client_secret: process.env.GOOGLE_ADS_CLIENT_SECRET,
            developer_token: process.env.GOOGLE_ADS_DEVELOPER_TOKEN
        });
    }

    // Get OAuth URL
    getOAuthUrl(state) {
        const scopes = ['https://www.googleapis.com/auth/adwords'];
        
        return `https://accounts.google.com/oauth2/v2/auth?` +
               `client_id=${process.env.GOOGLE_ADS_CLIENT_ID}&` +
               `redirect_uri=${encodeURIComponent(process.env.GOOGLE_ADS_REDIRECT_URI)}&` +
               `scope=${encodeURIComponent(scopes.join(' '))}&` +
               `response_type=code&` +
               `access_type=offline&` +
               `state=${state}`;
    }

    // Exchange code for token
    async exchangeCodeForToken(code) {
        const response = await axios.post('https://oauth2.googleapis.com/token', {
            client_id: process.env.GOOGLE_ADS_CLIENT_ID,
            client_secret: process.env.GOOGLE_ADS_CLIENT_SECRET,
            code,
            grant_type: 'authorization_code',
            redirect_uri: process.env.GOOGLE_ADS_REDIRECT_URI
        });

        return response.data;
    }

    // Get customer accounts
    async getCustomerAccounts(userId) {
        const credentials = await this.getCredentials(userId);
        const customer = this.googleAds.Customer({
            customer_id: credentials.customerId,
            refresh_token: credentials.refreshToken
        });

        const response = await customer.customerClients.list();
        return response.results;
    }

    // Get campaigns
    async getCampaigns(userId, customerId = null) {
        const credentials = await this.getCredentials(userId);
        const customer = this.googleAds.Customer({
            customer_id: customerId || credentials.customerId,
            refresh_token: credentials.refreshToken
        });

        const response = await customer.campaigns.list({
            attributes: [
                'campaign.id',
                'campaign.name',
                'campaign.status',
                'campaign.advertising_channel_type',
                'campaign.start_date',
                'campaign.end_date'
            ]
        });

        return response.results;
    }

    // Get campaign performance
    async getCampaignPerformance(userId, customerId, dateRange = 'LAST_30_DAYS') {
        const credentials = await this.getCredentials(userId);
        const customer = this.googleAds.Customer({
            customer_id: customerId || credentials.customerId,
            refresh_token: credentials.refreshToken
        });

        const response = await customer.campaigns.report({
            attributes: [
                'campaign.id',
                'campaign.name'
            ],
            metrics: [
                'metrics.impressions',
                'metrics.clicks',
                'metrics.cost_micros',
                'metrics.conversions',
                'metrics.ctr',
                'metrics.average_cpc'
            ],
            date_range: dateRange
        });

        return response.results;
    }

    // Sync user data
    async syncUserData(userId) {
        try {
            const campaigns = await this.getCampaigns(userId);
            const credentials = await this.getCredentials(userId);
            const performance = await this.getCampaignPerformance(userId, credentials.customerId);

            // Store campaign data
            for (const campaign of campaigns) {
                const campaignPerf = performance.find(p => p.campaign.id === campaign.campaign.id);
                
                await this.storeUnifiedData(userId, 'campaign', campaign.campaign.id, {
                    name: campaign.campaign.name,
                    status: campaign.campaign.status,
                    metrics: campaignPerf ? {
                        impressions: parseInt(campaignPerf.metrics.impressions),
                        clicks: parseInt(campaignPerf.metrics.clicks),
                        spend: parseInt(campaignPerf.metrics.cost_micros) / 1000000,
                        conversions: parseFloat(campaignPerf.metrics.conversions),
                        ctr: parseFloat(campaignPerf.metrics.ctr),
                        cpc: parseInt(campaignPerf.metrics.average_cpc) / 1000000
                    } : {},
                    attributes: {
                        channelType: campaign.campaign.advertising_channel_type,
                        startDate: campaign.campaign.start_date,
                        endDate: campaign.campaign.end_date
                    }
                });
            }

            await this.updateSyncStatus(userId, new Date());
            return { campaigns: campaigns.length };

        } catch (error) {
            await this.updateSyncStatus(userId, new Date(), error);
            throw error;
        }
    }
}

module.exports = new GoogleAdsIntegrationService();