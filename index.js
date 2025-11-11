require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const authRoutes = require('./routes/authRoutes');
const googleAdsRoutes = require('./routes/googleAds'); // Assuming you have this route set up
const facebookAdsRoutes = require('./routes/facebookAds'); // Assuming you have this route set up
const shopifyRoutes = require('./routes/shopify');

const app = express();
const port = process.env.PORT || 5000;

// Middleware

const corsOptions = {
  origin: "https://modulus-frontend-sand.vercel.app", // Allow only this origin
  methods: ["GET", "POST", "PUT", "DELETE"],
  credentials: true,
};

app.use(cors(corsOptions));


// app.use(cors());
app.use(express.json());

const connectDB = async () => {
  try {
    await mongoose.connect(process.env.MONGODB_URI, {
      serverSelectionTimeoutMS: 10000, // 10 seconds
    });
    console.log("✅ MongoDB connected successfully");
  } catch (error) {
    console.error("❌ MongoDB connection failed:", error.message);
    process.exit(1);
  }
};

connectDB();


app.use('/api/auth', authRoutes);
app.use("/api/google-auth", require("./routes/googleAuth"));
app.use('/api/google',googleAdsRoutes); // Google Ads routes);
app.use('/api/facebook',facebookAdsRoutes); // Facebook Ads routes);
app.use('/api/shopify', shopifyRoutes); // Shopify routes

// Basic Route
app.get('/', (req, res) => {
  res.send('Hello from the backend!');
});

app.listen(port, () => {
  console.log(`Server running on port ${port}`);
}); 