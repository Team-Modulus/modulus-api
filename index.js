require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const authRoutes = require('./routes/authRoutes');
const googleAdsRoutes = require('./routes/googleAds'); // Assuming you have this route set up
const facebookAdsRoutes = require('./routes/facebookAds'); // Assuming you have this route set up

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

// MongoDB Connection


app.use('/api/auth', authRoutes);
app.use("/api/google-auth", require("./routes/googleAuth"));
app.use('/api/google',googleAdsRoutes); // Google Ads routes);
app.use('/api/facebook',facebookAdsRoutes); // Google Ads routes);

// Basic Route
app.get('/', (req, res) => {
  res.send('Hello from the backend!');
});

mongoose.connect(process.env.MONGO_URI)
  .then(() => {
    console.log("✅ MongoDB connected successfully")})

app.listen(port, () => {
  console.log(`Server running on port ${port}`);
}); 