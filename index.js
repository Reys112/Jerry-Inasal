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
    .loader {
      margin-top: 15px;
      color: #888;
      font-size: 0.95rem;
    }
  </style>
</head>
<body>
  <div class="thank-you-box">
    <h1>Thank You!</h1>
    <p id="message">Verifying your payment...</p>
    <p class="loader" id="loader">Please wait while we confirm your order status.</p>
    <a href="index.html" class="btn btn-success mt-4" style="display:none;" id="backBtn">← Back to Home</a>
  </div>

  <script>
  const params = new URLSearchParams(window.location.search);
  const sessionId = params.get('checkout_session_id'); // This matches your success_url key

  const messageEl = document.getElementById('message');
  const loaderEl = document.getElementById('loader');
  const backBtn = document.getElementById('backBtn');

  if (sessionId) {
    fetch(`https://jerry-inasal.onrender.com/verify-payment?sessionId=${sessionId}`)
      .then(resp => resp.json())
      .then(data => {
        console.log('✅ Payment verification result:', data);
        if (data.status === 'paid') {
          messageEl.textContent = "Payment confirmed! 🎉";
        } else {
          messageEl.textContent = "Payment not completed yet. Contact support if needed.";
        }
      })
      .catch(err => {
        console.error('❌ Verification error:', err);
        messageEl.textContent = "Error verifying payment. Please try again later.";
      })
      .finally(() => {
        loaderEl.style.display = 'none';
        backBtn.style.display = 'inline-block';
      });
  } else {
    messageEl.textContent = "No session ID found in URL.";
    loaderEl.style.display = 'none';
    backBtn.style.display = 'inline-block';
  }
</script>

</body>
</html>
