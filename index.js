// index.js
const express = require('express');
const cors = require('cors');
const { createClient } = require('@supabase/supabase-js');
const axios = require('axios');
require('dotenv').config();

const app = express();
app.use(cors());
app.use(express.json());

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);

const PAYMONGO_SECRET = process.env.PAYMONGO_SECRET;
const RETURN_URL = 'https://your-website.com/success.html'; // Update to your thank-you page

app.post('/order', async (req, res) => {
  const { dish, location, contact, date, time } = req.body;

  // 1. Create PayMongo Checkout Link
  try {
    const checkoutResponse = await axios.post(
      'https://api.paymongo.com/v1/checkout_sessions',
      {
        data: {
          attributes: {
            send_email_receipt: true,
            show_description: true,
            show_line_items: true,
            line_items: [{
              name: dish,
              amount: 10000, // Change price (in cents: ₱100.00 = 10000)
              currency: 'PHP',
              quantity: 1
            }],
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

    // 2. Save order to Supabase with status "Pending Payment"
    const { error } = await supabase.from('orders').insert([{
      dish, location, contact, date, time,
      payment_status: 'unpaid',
      status: 'Pending'
    }]);

    if (error) {
      console.error('Supabase insert error:', error);
      return res.status(500).json({ error: 'Error saving order.' });
    }

    // 3. Respond with checkout URL
    return res.json({ url: checkout_url });

  } catch (err) {
    console.error('PayMongo error:', err.response?.data || err.message);
    return res.status(500).json({ error: 'Payment failed.' });
  }
});

app.post('/webhook', async (req, res) => {
  const payload = req.body;

  // Example webhook structure: https://developers.paymongo.com/reference/webhooks
  if (payload?.data?.attributes?.payment?.status === 'paid') {
    const reference = payload.data.attributes.payment.metadata.order_id;

    await supabase.from('orders')
      .update({ payment_status: 'paid' })
      .eq('id', reference);
  }

  return res.status(200).send('Webhook received.');
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
