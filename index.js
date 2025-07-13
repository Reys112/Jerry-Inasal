import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';
import axios from 'axios';

dotenv.config();

const app = express();

// Webhook must be raw before using express.json()
app.use('/webhook', express.raw({ type: 'application/json' }));
app.use(cors());
app.use(express.json()); // JSON parser for other routes

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);
const PAYMONGO_SECRET = process.env.PAYMONGO_SECRET;
const BASE_URL = 'https://jerrys-inasal.onrender.com';
const RETURN_URL = `${BASE_URL}/thankyou.html`;

// ✅ Order route
app.post('/order', async (req, res) => {
  const { dish, location, contact, date, time } = req.body;

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
    return res.status(500).json({ error: 'Failed to save order.' });
  }

  try {
    const sessionResponse = await axios.post(
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
            cancel_url: BASE_URL,
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

    const checkoutUrl = sessionResponse.data.data.attributes.checkout_url;
    res.json({ url: checkoutUrl });

  } catch (err) {
    console.error('PayMongo session creation failed:', err.response?.data || err.message);
    res.status(500).json({ error: 'Unable to generate checkout session.' });
  }
});

// ✅ Webhook route (comes after .raw setup)
app.post('/webhook', async (req, res) => {
  try {
    const event = JSON.parse(req.body.toString());

    if (event.data?.type === 'payment.paid') {
      const attributes = event.data.attributes;
      const orderId = attributes.metadata?.order_id;

      if (orderId) {
        console.log('✅ Webhook: Payment paid for Order ID:', orderId);

        await supabase
          .from('orders')
          .update({ payment_status: 'paid', status: 'Confirmed' })
          .eq('id', orderId);

        return res.status(200).json({ message: 'Order updated successfully' });
      } else {
        console.warn('⚠️ Missing order ID in metadata');
        return res.status(400).json({ error: 'Missing order_id in metadata' });
      }
    }

    res.status(200).json({ message: 'Event ignored' });
  } catch (error) {
    console.error('❌ Webhook error:', error.message);
    res.status(500).json({ error: 'Webhook error' });
  }
});

// ✅ Manual payment verification for thankyou.html
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
      await supabase
        .from('orders')
        .update({ payment_status: 'paid', status: 'Confirmed' })
        .eq('id', orderId);
    }

    res.json({ status: paymentStatus, order_id: orderId });

  } catch (error) {
    console.error('Failed to verify session:', error.response?.data || error.message);
    res.status(500).json({ error: 'Payment verification failed.' });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`✅ Server running on port ${PORT}`));
