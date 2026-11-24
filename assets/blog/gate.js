// Light lock for the pages under a locked section: without a current unlock on this device, go to the
// front page and ask for the four digits. This hides the page; it does not protect what is in it.
(function () {
  // The lock needs a secure page; the host does not force HTTPS.
  if (location.protocol === 'http:' && !/^(localhost|127\.0\.0\.1)$/.test(location.hostname)) { location.replace('https://' + location.host + location.pathname + location.search); return; }
  try { var s = JSON.parse(localStorage.getItem('blog-key') || 'null'); if (s && s.exp > Date.now()) return; } catch (e) {}
  document.documentElement.style.visibility = 'hidden';
  location.replace('/?unlock=reading&next=' + encodeURIComponent(location.pathname + location.search));
})();
