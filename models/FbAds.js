const mongoose = require("mongoose");

const FacebookAccountSchema = new mongoose.Schema({
  userId: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: "User", 
    required: true 
  },
  accessToken: { 
    type: String, 
    required: true 
  },
  connected: { 
    type: Boolean, 
    default: false 
  },
  accounts: [
    {
        accountId: String,
      accountName: String,
      accountStatus: Number,
      businessName: String,
      currency: String,
      timezone: String,
      spendCap: String,
      amountSpent: String,
      connected: { type: Boolean, default: false },
      insights: { type: Array, default: [] },
    }
  ]
}, { timestamps: true });

module.exports = mongoose.model("FacebookAccount", FacebookAccountSchema);
