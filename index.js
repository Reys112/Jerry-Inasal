import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';
import axios from 'axios';

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);

const PAYMONGO_SECRET = process.env.PAYMONGO_SECRET;
const RETURN_URL = 'https://jerrys-inasal.onrender.com/thankyou.html'; // ✅ Your thank-you page

app.post('/order', async (req, res) => {
  const { dish, location, contact, date, time } = req.body;

  try {
    // Fixed price: ₱5.00 = 500 centavos
    const amount = 500;

    // ✅ Create PayMongo Checkout Session
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
                amount: amount,
                currency: 'PHP',
                quantity: 1
              }
            ],
            payment_method_types: ['gcash', 'card', 'paymaya'], // ✅ support GCash, Card, PayMaya
            success_url: RETURN_URL,
            cancel_url: RETURN_URL,
          }
        }
      },
      {
        headers: {
          Authorization: `Basic ${Buffer.from(PAYMONGO_SECRET + ':').toString('base64')}`,
          'Content-Type': 'application/json'
        }
      }
    );

    const checkout_url = checkoutResponse.data.data.attributes.checkout_url;

    // ✅ Save order to Supabase
    const { error } = await supabase.from('orders').insert([
      {
        dish,
        location,
        contact,
        date,
        time,
        payment_status: 'unpaid',
        status: 'Pending',
      }
    ]);

    if (error) {
      console.error('Supabase error:', error);
      return res.status(500).json({ error: 'Error saving order.' });
    }

    res.json({ url: checkout_url });

  } catch (err) {
    console.error('PayMongo error:', err.response?.data || err.message);
    res.status(500).json({ error: 'Payment failed.' });
  }
});

app.post('/webhook', async (req, res) => {
  const payload = req.body;

  // Optional: add raw logging
  console.log('Webhook received:', JSON.stringify(payload));

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
app.listen(PORT, () => console.log(`✅ Server running on port ${PORT}`));
