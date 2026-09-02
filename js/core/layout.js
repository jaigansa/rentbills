// RentBill Pro — Layout Engine (Modular HTML Loader)

/**
 * Asynchronously loads and mounts modular HTML layout files into the DOM
 */
export async function loadLayout() {
  const replaceMounts = [
    { id: 'auth-mount', url: 'layout/auth.html' },
    { id: 'sidebar-mount', url: 'layout/sidebar.html' },
    { id: 'mobile-nav-mount', url: 'layout/mobile-nav.html' },
    { id: 'header-mount', url: 'layout/header.html' },
    { id: 'modals-mount', url: 'layout/modals.html' }
  ];

  const pageMounts = [
    'layout/pages/dashboard.html',
    'layout/pages/properties.html',
    'layout/pages/bills.html',
    'layout/pages/payments.html',
    'layout/pages/finances.html',
    'layout/pages/settings.html'
  ];

  // 1. Load and replace structural mounts
  await Promise.all(replaceMounts.map(async (m) => {
    try {
      const res = await fetch(m.url);
      if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText}`);
      const html = await res.text();
      const el = document.getElementById(m.id);
      if (el) {
        el.outerHTML = html;
      }
    } catch (err) {
      console.error(`Error loading layout module ${m.url}:`, err);
    }
  }));

  // 2. Load and append page sections into the pages container
  const pagesContainer = document.getElementById('pages-container');
  if (pagesContainer) {
    const pageHtmls = await Promise.all(pageMounts.map(async (url) => {
      try {
        const res = await fetch(url);
        if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText}`);
        return await res.text();
      } catch (err) {
        console.error(`Error loading page module ${url}:`, err);
        return '';
      }
    }));

    pagesContainer.innerHTML = pageHtmls.join('\n');
  }
}
