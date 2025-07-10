<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Thank You | Jerry's Inasal</title>
  <link href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.3/dist/css/bootstrap.min.css" rel="stylesheet" />
  <style>
    body {
      background-color: #f7fff5;
      display: flex;
      justify-content: center;
      align-items: center;
      height: 100vh;
      font-family: 'Segoe UI', sans-serif;
    }
    .thank-you-box {
      background-color: #ffffff;
      border: 2px solid #28a745;
      padding: 40px;
      border-radius: 12px;
      text-align: center;
      max-width: 500px;
      box-shadow: 0 0 10px rgba(0,0,0,0.1);
    }
    .thank-you-box h1 {
      color: #28a745;
      font-size: 2.5rem;
      margin-bottom: 15px;
    }
    .thank-you-box p {
      font-size: 1.2rem;
    }
    .thank-you-box a {
      margin-top: 20px;
    }
  </style>
</head>
<body>
  <div class="thank-you-box">
    <h1>Thank You!</h1>
    <p>Your order has been placed successfully. We’ll contact you soon!</p>
    <p class="mt-3"><strong>God bless and enjoy your meal, Ka-Inasal!</strong></p>
    <a href="index.html" class="btn btn-success mt-4">← Back to Home</a>
  </div>

  <script>
    // ✅ Extract checkout_session_id from URL
    const params = new URLSearchParams(window.location.search);
    const sessionId = params.get('checkout_session_id');

    if (sessionId) {
      fetch(`https://jerry-inasal.onrender.com/verify-payment?sessionId=${sessionId}`)
        .then(response => response.json())
        .then(data => {
          console.log('✅ Payment verified:', data);
        })
        .catch(err => {
          console.error('❌ Error verifying payment:', err);
        });
    } else {
      console.warn('⚠️ No checkout_session_id found in URL');
    }
  </script>
</body>
</html>import express from 'express';
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

// ✅ Create new order and generate checkout URL
app.post('/order', async (req, res) => {
  let { dish, location, contact, date, time } = req.body;

  const dishArray = Array.isArray(dish)
    ? dish
    : dish.split(',').map(d => d.trim()).filter(Boolean);

  const dishMap = {};
  dishArray.forEach(entry => {
    const match = entry.match(/^(.+?)\s*-\s*(\d+(?:\.\d{1,2})?)$/);
    if (match) {
      const name = match[1].trim();
      const price = parseFloat(match[2]) * 100;
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

  // ✅ Insert to Supabase and get order ID
  const { data: orderData, error: insertError } = await supabase
    .from('orders')
    .insert([{
      dish: dishArray.join(', '),
      location,
      contact,
      date,
      time,
      payment_status: 'unpaid',
      status: 'Pending',
    }])
    .select()
    .single();

  if (insertError) {
    console.error('Supabase insert error:', insertError);
    return res.status(500).json({ error: 'Error saving order.' });
  }

  try {
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
            metadata: {
              order_id: orderData.id
            },
            payment_method_types: ['gcash', 'card', 'paymaya'],
            success_url: `${RETURN_URL}?checkout_session_id={CHECKOUT_SESSION_ID}`,
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

    const checkoutUrl = checkoutResponse.data.data.attributes.checkout_url;
    res.json({ url: checkoutUrl });

  } catch (err) {
    console.error('PayMongo error:', err.response?.data || err.message);
    res.status(500).json({ error: 'Payment failed.' });
  }
});

// ✅ Verify Payment after redirect from PayMongo
app.get('/verify-payment', async (req, res) => {
  const sessionId = req.query.sessionId;

  if (!sessionId) {
    return res.status(400).json({ error: 'Missing session ID' });
  }

  try {
    const result = await axios.get(`https://api.paymongo.com/v1/checkout_sessions/${sessionId}`, {
      headers: {
        Authorization: `Basic ${Buffer.from(PAYMONGO_SECRET + ':').toString('base64')}`,
        'Content-Type': 'application/json'
      }
    });

    const session = result.data.data;
    const paymentStatus = session.attributes.payment_status;
    const orderId = session.attributes.metadata?.order_id;

    if (paymentStatus === 'paid' && orderId) {
      await supabase.from('orders')
        .update({ payment_status: 'paid' })
        .eq('id', orderId);
    }

    return res.json({ status: paymentStatus, order_id: orderId });

  } catch (error) {
    console.error('Error verifying payment:', error.response?.data || error.message);
    res.status(500).json({ error: 'Failed to verify payment' });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`✅ Server running on port ${PORT}`));
