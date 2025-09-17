const BaseIntegrationService = require('./BaseIntegrationService');
const SellingPartnerAPI = require('amazon-sp-api');

class AmazonIntegrationService extends BaseIntegrationService {
    constructor(serviceType = 'seller') { // 'seller', 'vendor', 'ads'
        super(`amazon_${serviceType}`);
        this.serviceType = serviceType;
    }

    // Initialize SP-API client
    async initializeSPAPI(userId) {
        const credentials = await this.getCredentials(userId);
        
        return new SellingPartnerAPI({
            region: 'na', // or 'eu', 'fe'
            refresh_token: credentials.refreshToken,
            access_token: credentials.accessToken,
            client_id: credentials.clientId,
            client_secret: credentials.clientSecret,
            role_arn: process.env.AMAZON_ROLE_ARN // AWS IAM role
        });
    }

    // Get orders (Seller Central)
    async getOrders(userId, params = {}) {
        const spapi = await this.initializeSPAPI(userId);
        
        const defaultParams = {
            MarketplaceIds: ['ATVPDKIKX0DER'], // US marketplace
            CreatedAfter: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString(),
            OrderStatuses: ['Shipped', 'Unshipped']
        };

        const response = await spapi.callAPI({
            operation: 'getOrders',
            endpoint: 'orders',
            query: { ...defaultParams, ...params }
        });

        return response.Orders;
    }

    // Get inventory (Seller Central)
    async getInventory(userId) {
        const spapi = await this.initializeSPAPI(userId);
        
        const response = await spapi.callAPI({
            operation: 'getInventorySummaries',
            endpoint: 'fba-inventory',
            query: {
                granularityType: 'Marketplace',
                granularityId: 'ATVPDKIKX0DER',
                marketplaceIds: ['ATVPDKIKX0DER']
            }
        });

        return response.inventorySummaries;
    }

    // Get products (Seller Central)
    async getProducts(userId) {
        const spapi = await this.initializeSPAPI(userId);
        
        const response = await spapi.callAPI({
            operation: 'getCatalogItems',
            endpoint: 'catalog-items',
            query: {
                marketplaceIds: ['ATVPDKIKX0DER'],
                includedData: ['attributes', 'dimensions', 'images', 'productTypes']
            }
        });

        return response.items;
    }

    // Sync seller data
    async syncSellerData(userId) {
        try {
            const [orders, inventory] = await Promise.all([
                this.getOrders(userId),
                this.getInventory(userId)
            ]);

            // Store orders
            for (const order of orders) {
                const orderTotal = parseFloat(order.OrderTotal?.Amount || 0);
                
                await this.storeUnifiedData(userId, 'order', order.AmazonOrderId, {
                    name: `Amazon Order ${order.AmazonOrderId}`,
                    status: order.OrderStatus,
                    metrics: {
                        revenue: orderTotal,
                        orders: 1,
                        units: order.NumberOfItemsShipped + order.NumberOfItemsUnshipped
                    },
                    attributes: {
                        marketplace: order.MarketplaceId,
                        fulfillmentChannel: order.FulfillmentChannel,
                        purchaseDate: order.PurchaseDate,
                        shippingAddress: order.ShippingAddress
                    }
                });
            }

            // Store inventory
            for (const item of inventory) {
                await this.storeUnifiedData(userId, 'inventory', item.asin, {
                    name: item.fnSku,
                    status: 'active',
                    metrics: {
                        units: item.totalQuantity
                    },
                    attributes: {
                        asin: item.asin,
                        condition: item.condition,
                        lastUpdated: item.lastUpdatedTime
                    }
                });
            }

            await this.updateSyncStatus(userId, new Date());
            return { orders: orders.length, inventory: inventory.length };

        } catch (error) {
            await this.updateSyncStatus(userId, new Date(), error);
            throw error;
        }
    }
}

// Amazon Ads Service
class AmazonAdsIntegrationService extends BaseIntegrationService {
    constructor() {
        super('amazon_ads');
        this.apiUrl = 'https://advertising-api.amazon.com';
    }

    // Get campaigns
    async getCampaigns(userId) {
        const credentials = await this.getCredentials(userId);
        
        const response = await axios.get(`${this.apiUrl}/v2/campaigns`, {
            headers: {
                'Authorization': `Bearer ${credentials.accessToken}`,
                'Amazon-Advertising-API-ClientId': credentials.clientId,
                'Amazon-Advertising-API-Scope': credentials.profileId
            }
        });

        return response.data;
    }

    // Get campaign performance
    async getCampaignPerformance(userId, reportDate = 'yesterday') {
        const credentials = await this.getCredentials(userId);
        
        // Create report request
        const reportResponse = await axios.post(`${this.apiUrl}/v2/reports`, {
            campaignType: 'sponsoredProducts',
            segment: 'campaign',
            reportDate: reportDate,
            metrics: [
                'campaignName',
                'campaignId',
                'impressions',
                'clicks',
                'cost',
                'orders',
                'sales'
            ]
        }, {
            headers: {
                'Authorization': `Bearer ${credentials.accessToken}`,
                'Amazon-Advertising-API-ClientId': credentials.clientId,
                'Amazon-Advertising-API-Scope': credentials.profileId
            }
        });

        // Download report (simplified - actual implementation would poll for completion)
        return reportResponse.data;
    }

    // Sync ads data
    async syncUserData(userId) {
        try {
            const [campaigns, performance] = await Promise.all([
                this.getCampaigns(userId),
                this.getCampaignPerformance(userId)
            ]);

            // Store campaign data
            for (const campaign of campaigns) {
                await this.storeUnifiedData(userId, 'campaign', campaign.campaignId.toString(), {
                    name: campaign.name,
                    status: campaign.state,
                    metrics: {
                        spend: parseFloat(campaign.budget?.amount || 0)
                    },
                    attributes: {
                        targetingType: campaign.targetingType,
                        startDate: campaign.startDate,
                        endDate: campaign.endDate
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

// services/FlipkartIntegrationService.js
class FlipkartIntegrationService extends BaseIntegrationService {
    constructor() {
        super('flipkart_seller');
        this.apiUrl = 'https://api.flipkart.net';
    }

    // Get orders
    async getOrders(userId, params = {}) {
        const credentials = await this.getCredentials(userId);
        
        const response = await axios.get(`${this.apiUrl}/sellers/orders`, {
            headers: {
                'Authorization': `Bearer ${credentials.accessToken}`,
                'Content-Type': 'application/json'
            },
            params: {
                filter: JSON.stringify({
                    orderDate: {
                        fromDate: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
                        toDate: new Date().toISOString().split('T')[0]
                    }
                }),
                ...params
            }
        });

        return response.data.orderItems;
    }

    // Get listings
    async getListings(userId) {
        const credentials = await this.getCredentials(userId);
        
        const response = await axios.get(`${this.apiUrl}/sellers/listings`, {
            headers: {
                'Authorization': `Bearer ${credentials.accessToken}`,
                'Content-Type': 'application/json'
            }
        });

        return response.data.listings;
    }

    // Sync user data
    async syncUserData(userId) {
        try {
            const [orders, listings] = await Promise.all([
                this.getOrders(userId),
                this.getListings(userId)
            ]);

            // Store orders
            for (const order of orders) {
                await this.storeUnifiedData(userId, 'order', order.orderItemId, {
                    name: `Flipkart Order ${order.orderItemId}`,
                    status: order.orderItemStatus,
                    metrics: {
                        revenue: parseFloat(order.priceComponents.sellingPrice),
                        orders: 1,
                        units: order.quantity
                    },
                    attributes: {
                        fsn: order.fsn,
                        sku: order.sku,
                        shipmentDate: order.shipmentDate,
                        deliveryDate: order.deliveryDate
                    }
                });
            }

            // Store listings
            for (const listing of listings) {
                await this.storeUnifiedData(userId, 'product', listing.fsn, {
                    name: listing.productTitle,
                    status: listing.status,
                    metrics: {
                        units: listing.availableQuantity
                    },
                    attributes: {
                        sku: listing.sku,
                        mrp: listing.mrp,
                        sellingPrice: listing.sellingPrice,
                        category: listing.category
                    }
                });
            }

            await this.updateSyncStatus(userId, new Date());
            return { orders: orders.length, listings: listings.length };

        } catch (error) {
            await this.updateSyncStatus(userId, new Date(), error);
            throw error;
        }
    }
}

module.exports = {
    ShopifyIntegrationService: require('./ShopifyIntegrationService'),
    GoogleAdsIntegrationService: require('./GoogleAdsIntegrationService'),
    GoogleAnalyticsIntegrationService: require('./GoogleAnalyticsIntegrationService'),
    AmazonSellerIntegrationService: () => new AmazonIntegrationService('seller'),
    AmazonVendorIntegrationService: () => new AmazonIntegrationService('vendor'),
    AmazonAdsIntegrationService: new AmazonAdsIntegrationService(),
    FlipkartIntegrationService: new FlipkartIntegrationService()
};