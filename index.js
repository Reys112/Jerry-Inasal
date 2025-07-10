// index.js (ESM version for Render)
import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';
import axios from 'axios';

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());

// Supabase config
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);

// Replace with your public PayMongo secret key
const PAYMONGO_SECRET = process.env.PAYMONGO_SECRET;

// ✅ This must be your frontend hosted URL
const RETURN_URL = 'https://jerrys-inasal.onrender.com/thankyou.html';

// ➤ ORDER CREATION AND PAYMENT SESSION
app.post('/order', async (req, res) => {
  const { dish, location, contact, date, time } = req.body;

  try {
    // Insert order first and retrieve the generated ID
    const { data: insertedOrder, error } = await supabase
      .from('orders')
      .insert([
        {
          dish,
          location,
          contact,
          date,
          time,
          payment_status: 'unpaid',
          status: 'Pending',
        },
      ])
      .select()
      .single();

    if (error) {
      console.error('Supabase insert error:', error);
      return res.status(500).json({ error: 'Error saving order.' });
    }

    // Create a PayMongo Checkout session with metadata for order_id
    const checkoutResponse = await axios.post(
      'https://api.paymongo.com/v1/checkout_sessions',
      {
        data: {
          attributes: {
            send_email_receipt: true,
            show_description: true,
            show_line_items: true,
            line_items: [
              {
                name: dish,
                amount: 10000, // ₱100.00
                currency: 'PHP',
                quantity: 1,
              },
            ],
            success_url: RETURN_URL,
            cancel_url: RETURN_URL,
            metadata: {
              order_id: insertedOrder.id,
            },
          },
        },
      },
      {
        headers: {
          Authorization: `Basic ${Buffer.from(PAYMONGO_SECRET + ':').toString('base64')}`,
          'Content-Type': 'application/json',
        },
      }
    );

    const checkout_url = checkoutResponse.data.data.attributes.checkout_url;
    res.json({ url: checkout_url });

  } catch (err) {
    console.error('PayMongo error:', err.response?.data || err.message);
    res.status(500).json({ error: 'Payment session failed.' });
  }
});

// ➤ WEBHOOK (PayMongo POSTs here after payment success)
app.post('/webhook', async (req, res) => {
  const payload = req.body;
  const reference = payload?.data?.attributes?.payment?.metadata?.order_id;

  if (payload?.data?.attributes?.payment?.status === 'paid' && reference) {
    await supabase
      .from('orders')
      .update({ payment_status: 'paid' })
      .eq('id', reference);
  }

  res.status(200).send('Webhook received.');
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`✅ API running on port ${PORT}`));
