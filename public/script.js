
document.addEventListener('DOMContentLoaded', () => {
  const form = document.getElementById('login-form');
  if (!form) return;

  const emailEl = document.getElementById('email');
  const passwordEl = document.getElementById('password');
  const errBox = document.getElementById('error-message');

  // Διάβασε τυχόν ?next=/student-dashboard από το URL
  const qs = new URLSearchParams(location.search);
  const next = qs.get('next') || '';

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    errBox.style.display = 'none';

    const email = emailEl.value.trim();
    const password = passwordEl.value;

    try {
      const response = await fetch('/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        // στείλε και το next στον server
        body: JSON.stringify({ email, password, next })
      });

      const data = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(data.message || 'Invalid credentials');
      }

      // Ο server στέλνει redirectUrl έτοιμο
      if (data.redirectUrl) {
        window.location.href = data.redirectUrl;
      } else {
        window.location.href = '/';
      }
    } catch (error) {
      console.error('Error:', error);
      errBox.innerText = error.message || 'An error occurred';
      errBox.style.display = 'block';
    }
  });
});
