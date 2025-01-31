require('dotenv').config();
const express = require('express');
const cors = require('cors');
const multer = require('multer');
const { createClient } = require('@supabase/supabase-js');

const app = express();
app.use(express.json());
app.use(cors());
// server.js or app.js
app.use((req, res, next) => {
    if (req.headers["x-forwarded-proto"] !== "https") {
      res.redirect(301, `https://${req.headers.host}${req.url}`);
    } else {
      next();
    }
  });

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_KEY;

if (!supabaseUrl || !supabaseKey) {
    console.error("❌ ERROR: Supabase URL or Key is missing in .env");
    process.exit(1); // Exit if no URL or key found
}

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);

supabase 
    .from('messages')
    
    .select('*')
    .then(response => {
        console.log(response.data);
    })
    .catch(error => {
        console.error('Supabase error:', error);
    });
 
// File Upload Setup
const storage = multer.memoryStorage();
const upload = multer({ storage });

// Fetch Messages
app.get('/messages', async (req, res) => {
    const { data, error } = await supabase.from("messages").select("*");
    if (error) return res.status(500).json({ error });
    res.json(data);
});

// Send Message
app.post('/messages', async (req, res) => {
    const { text } = req.body;
    const { data, error } = await supabase.from("messages").insert([{ text }]);
    if (error) return res.status(500).json({ error });
    res.json(data);
});

// Start Server
const PORT = 5000;
app.listen(PORT, () => console.log(`✅ Backend running on http://localhost:${PORT}`));
