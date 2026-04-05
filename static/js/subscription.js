// subscription.js - Handles Razorpay checkout and subscription flow

import { auth } from '../js/firebase_config.js';

// Razorpay key (publishable) - replace with your actual key
const RAZORPAY_KEY = 'YOUR_RAZORPAY_KEY_ID';

// Utility to format amount in paise (₹ -> paise)
function toPaise(amount) {
  return amount * 100;
}

async function getCurrentUser() {
  return new Promise((resolve) => {
    const unsubscribe = auth.onAuthStateChanged((user) => {
      unsubscribe();
      resolve(user);
    });
  });
}

async function createOrder(plan, amount) {
  const user = await getCurrentUser();
  if (!user) {
    alert('Please login to subscribe');
    return null;
  }
  const response = await fetch('/api/create_order', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ plan, amount, email: user.email, uid: user.uid }),
  });
  return response.json();
}

function openRazorpay(options) {
  const rzp = new Razorpay(options);
  rzp.on('payment.failed', function (response) {
    console.error('Payment failed', response);
    alert('Payment failed. Please try again.');
  });
  rzp.open();
}

async function handleSubscribe(event) {
  const btn = event.currentTarget;
  const card = btn.closest('.plan-card');
  const plan = card.dataset.plan;
  const amount = parseInt(card.dataset.amount, 10);

  const orderData = await createOrder(plan, amount);
  if (!orderData || !orderData.order) return;

  const options = {
    key: RAZORPAY_KEY,
    amount: toPaise(amount), // in paise
    currency: 'INR',
    name: 'AirWrite AI',
    description: `${plan} subscription`,
    order_id: orderData.order.id,
    handler: async function (response) {
      // Verify payment on server
      const verifyResp = await fetch('/api/verify_payment', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          razorpay_payment_id: response.razorpay_payment_id,
          razorpay_order_id: response.razorpay_order_id,
          razorpay_signature: response.razorpay_signature,
          email: orderData.email,
          uid: orderData.uid,
          plan,
          amount,
        }),
      });
      const result = await verifyResp.json();
      if (result.success) {
        alert('Subscription successful!');
        // Optionally refresh dashboard
        window.location.href = '/dashboard';
      } else {
        alert('Payment verification failed.');
      }
    },
    prefill: {
      email: orderData.email,
    },
    theme: {
      color: '#3399cc',
    },
  };
  openRazorpay(options);
}

// Attach listeners to all subscribe buttons
document.querySelectorAll('.subscribe-btn').forEach((btn) => {
  btn.addEventListener('click', handleSubscribe);
});
