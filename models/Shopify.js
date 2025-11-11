const mongoose = require("mongoose");

const ShopifyAccountSchema = new mongoose.Schema({
  userId: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: "User", 
    required: true 
  },
  accessToken: { 
    type: String, 
    required: true 
  },
  shopDomain: {
    type: String,
    required: true
  },
  connected: { 
    type: Boolean, 
    default: false 
  },
  shops: [
    {
      shopId: String,
      shopDomain: String,
      shopName: String,
      email: String,
      currency: String,
      timezone: String,
      connected: { type: Boolean, default: false },
      lastFetched: Date,
    }
  ],
  lastFetched: Date,
}, { timestamps: true });

module.exports = mongoose.model("ShopifyAccount", ShopifyAccountSchema);

