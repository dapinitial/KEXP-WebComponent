// Runs on davidpuerto.com/kexp: hands the site's device-id to the extension
// host so toolbar likes and site likes land in one cloud playlist. Plain
// script (no bundling) — copied verbatim into the extension root.
(() => {
  const KEY = 'kexp-player:device-id';
  let sent = null;

  const send = () => {
    let id = null;
    try {
      id = localStorage.getItem(KEY);
    } catch {
      return false;
    }
    if (!id || id === sent) return false;
    sent = id;
    try {
      chrome.runtime.sendMessage({ type: 'kexp:adopt-device-id', id }).catch(() => {});
    } catch {
      // Extension reloaded under us — nothing to do.
    }
    return true;
  };

  if (!send()) {
    // The site mints its id on first backend reconcile — poll briefly.
    let tries = 0;
    const timer = setInterval(() => {
      if (send() || ++tries >= 20) clearInterval(timer);
    }, 500);
  }
})();
