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

// CORS configuration - allow both production and local development
const allowedOrigins = [
  "https://modulus-frontend-sand.vercel.app",
  "http://localhost:5173",
  "http://localhost:3000",
  "http://localhost:5174",
  "http://127.0.0.1:5173",
  "http://127.0.0.1:3000",
];

const corsOptions = {
  origin: function (origin, callback) {
    // Allow requests with no origin (like mobile apps or curl requests)
    if (!origin) return callback(null, true);
    
    if (allowedOrigins.indexOf(origin) !== -1) {
      callback(null, true);
    } else {
      callback(null, true); // Allow all origins for development (change in production)
      // For production, uncomment the line below and comment the line above:
      // callback(new Error('Not allowed by CORS'));
    }
  },
  methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
  credentials: true,
  allowedHeaders: ["Content-Type", "Authorization"],
};

app.use(cors(corsOptions));
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