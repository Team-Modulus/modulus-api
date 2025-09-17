const BaseIntegrationService = require('./BaseIntegrationService');
const axios = require('axios');

class ShopifyIntegrationService extends BaseIntegrationService {
    constructor() {
        super('shopify');
        this.apiVersion = '2023-10';
    }

    // Get OAuth URL
    getOAuthUrl(shopDomain, state) {
        const scopes = [
            'read_orders',
            'read_products',
            'read_analytics',
            'read_customers',
            'read_inventory'
        ].join(',');

        return `https://${shopDomain}.myshopify.com/admin/oauth/authorize?` +
               `client_id=${process.env.SHOPIFY_API_KEY}&` +
               `scope=${scopes}&` +
               `redirect_uri=${encodeURIComponent(process.env.SHOPIFY_REDIRECT_URI)}&` +
               `state=${state}`;
    }

    // Exchange code for token
    async exchangeCodeForToken(shopDomain, code) {
        const response = await axios.post(
            `https://${shopDomain}.myshopify.com/admin/oauth/access_token`,
            {
                client_id: process.env.SHOPIFY_API_KEY,
                client_secret: process.env.SHOPIFY_API_SECRET,
                code
            }
        );

        return response.data;
    }

    // Get shop info
    async getShopInfo(userId) {
        const credentials = await this.getCredentials(userId);
        const response = await axios.get(
            `https://${credentials.shopDomain}.myshopify.com/admin/api/${this.apiVersion}/shop.json`,
            {
                headers: {
                    'X-Shopify-Access-Token': credentials.accessToken
                }
            }
        );

        return response.data.shop;
    }

    // Get orders
    async getOrders(userId, params = {}) {
        const credentials = await this.getCredentials(userId);
        const response = await axios.get(
            `https://${credentials.shopDomain}.myshopify.com/admin/api/${this.apiVersion}/orders.json`,
            {
                headers: {
                    'X-Shopify-Access-Token': credentials.accessToken
                },
                params: {
                    status: 'any',
                    limit: 250,
                    ...params
                }
            }
        );

        return response.data.orders;
    }

    // Get products
    async getProducts(userId, params = {}) {
        const credentials = await this.getCredentials(userId);
        const response = await axios.get(
            `https://${credentials.shopDomain}.myshopify.com/admin/api/${this.apiVersion}/products.json`,
            {
                headers: {
                    'X-Shopify-Access-Token': credentials.accessToken
                },
                params: {
                    limit: 250,
                    ...params
                }
            }
        );

        return response.data.products;
    }

    // Sync user data
    async syncUserData(userId) {
        try {
            const [orders, products] = await Promise.all([
                this.getOrders(userId, { created_at_min: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) }),
                this.getProducts(userId)
            ]);

            // Store orders
            for (const order of orders) {
                await this.storeUnifiedData(userId, 'order', order.id.toString(), {
                    name: `Order #${order.order_number}`,
                    status: order.financial_status,
                    metrics: {
                        revenue: parseFloat(order.total_price),
                        orders: 1,
                        units: order.line_items.reduce((sum, item) => sum + item.quantity, 0)
                    },
                    attributes: {
                        customerEmail: order.email,
                        createdAt: order.created_at,
                        tags: order.tags
                    }
                });
            }

            // Store products
            for (const product of products) {
                await this.storeUnifiedData(userId, 'product', product.id.toString(), {
                    name: product.title,
                    status: product.status,
                    metrics: {
                        units: product.variants.reduce((sum, variant) => 
                            sum + (variant.inventory_quantity || 0), 0)
                    },
                    attributes: {
                        vendor: product.vendor,
                        productType: product.product_type,
                        tags: product.tags,
                        variants: product.variants.length
                    }
                });
            }

            await this.updateSyncStatus(userId, new Date());
            return { orders: orders.length, products: products.length };

        } catch (error) {
            await this.updateSyncStatus(userId, new Date(), error);
            throw error;
        }
    }
}

module.exports = new ShopifyIntegrationService();
