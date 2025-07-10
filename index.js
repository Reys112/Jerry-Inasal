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
const RETURN_URL = 'https://jerrys-inasal.onrender.com/thankyou.html';

app.post('/order', async (req, res) => {
  let { dish, location, contact, date, time } = req.body;

  // ✅ Ensure dish is a string and split into array
  const dishArray = Array.isArray(dish)
    ? dish
    : dish.split(',').map(d => d.trim()).filter(Boolean);

  // ✅ Group dish quantities and extract prices
  const dishMap = {};

  dishArray.forEach(entry => {
    // Expect format: "Isaw - 20" or "BBQ - 25"
    const match = entry.match(/^(.+?)\s*-\s*(\d+(?:\.\d{1,2})?)$/);
    if (match) {
      const name = match[1].trim();
      const price = parseFloat(match[2]) * 100; // Convert to centavos

      if (!dishMap[name]) {
        dishMap[name] = { amount: price, quantity: 1 };
      } else {
        dishMap[name].quantity += 1;
      }
    }
  });

  const lineItems = Object.entries(dishMap).map(([name, item]) => ({
    name,
    amount: Math.round(item.amount),
    currency: 'PHP',
    quantity: item.quantity,
  }));

  if (lineItems.length === 0) {
    return res.status(400).json({ error: 'No valid dishes selected.' });
  }

  try {
    // ✅ Create PayMongo Checkout Session
    const checkoutResponse = await axios.post(
      'https://api.paymongo.com/v1/checkout_sessions',
      {
        data: {
          attributes: {
            send_email_receipt: true,
            show_description: true,
            description: `Order for ${dishArray.join(', ')}`,
            show_line_items: true,
            line_items: lineItems,
            payment_method_types: ['gcash', 'card', 'paymaya'],
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
        dish: dishArray.join(', '),
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

// ✅ Webhook handler (optional)
app.post('/webhook', async (req, res) => {
  const payload = req.body;

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
