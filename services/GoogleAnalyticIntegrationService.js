const BaseIntegrationService = require('./BaseIntegrationService');
const { BetaAnalyticsDataClient } = require('@google-analytics/data');

class GoogleAnalyticsIntegrationService extends BaseIntegrationService {
    constructor() {
        super('google_analytics');
    }

    // Get OAuth URL (same as Google Ads but different scopes)
    getOAuthUrl(state) {
        const scopes = [
            'https://www.googleapis.com/auth/analytics.readonly',
            'https://www.googleapis.com/auth/analytics'
        ];
        
        return `https://accounts.google.com/oauth2/v2/auth?` +
               `client_id=${process.env.GOOGLE_ANALYTICS_CLIENT_ID}&` +
               `redirect_uri=${encodeURIComponent(process.env.GOOGLE_ANALYTICS_REDIRECT_URI)}&` +
               `scope=${encodeURIComponent(scopes.join(' '))}&` +
               `response_type=code&` +
               `access_type=offline&` +
               `state=${state}`;
    }

    // Get properties
    async getProperties(userId) {
        const credentials = await this.getCredentials(userId);
        
        // Initialize GA4 client with credentials
        const analyticsDataClient = new BetaAnalyticsDataClient({
            credentials: {
                client_email: credentials.clientEmail,
                private_key: credentials.privateKey
            }
        });

        // Get properties would require Management API
        // This is a simplified version
        return [{ propertyId: credentials.propertyId }];
    }

    // Get analytics data
    async getAnalyticsData(userId, propertyId, dateRange = { startDate: '30daysAgo', endDate: 'today' }) {
        const credentials = await this.getCredentials(userId);
        
        const analyticsDataClient = new BetaAnalyticsDataClient({
            credentials: {
                client_email: credentials.clientEmail,
                private_key: credentials.privateKey
            }
        });

        const [response] = await analyticsDataClient.runReport({
            property: `properties/${propertyId}`,
            dateRanges: [dateRange],
            dimensions: [
                { name: 'date' },
                { name: 'sourceMedium' }
            ],
            metrics: [
                { name: 'sessions' },
                { name: 'totalUsers' },
                { name: 'conversions' },
                { name: 'totalRevenue' }
            ]
        });

        return response;
    }

    // Sync user data
    async syncUserData(userId) {
        try {
            const credentials = await this.getCredentials(userId);
            const data = await this.getAnalyticsData(userId, credentials.propertyId);

            // Process and store analytics data
            const totalMetrics = {
                sessions: 0,
                users: 0,
                conversions: 0,
                revenue: 0
            };

            data.rows?.forEach(row => {
                totalMetrics.sessions += parseInt(row.metricValues[0].value);
                totalMetrics.users += parseInt(row.metricValues[1].value);
                totalMetrics.conversions += parseFloat(row.metricValues[2].value);
                totalMetrics.revenue += parseFloat(row.metricValues[3].value);
            });

            await this.storeUnifiedData(userId, 'analytics', 'website_overview', {
                name: 'Website Analytics',
                status: 'active',
                metrics: totalMetrics,
                attributes: {
                    propertyId: credentials.propertyId,
                    reportDate: new Date()
                }
            });

            await this.updateSyncStatus(userId, new Date());
            return { records: data.rows?.length || 0 };

        } catch (error) {
            await this.updateSyncStatus(userId, new Date(), error);
            throw error;
        }
    }
}

module.exports = new GoogleAnalyticsIntegrationService();
