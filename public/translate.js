(function () {
  const storageKey = 'yuri-language';

  function getLanguage() {
    return localStorage.getItem(storageKey) || 'en';
  }

  function setLanguage(lang) {
    localStorage.setItem(storageKey, lang);
  }

  function applyLanguage(lang) {
    document.querySelectorAll('[data-en], [data-es], [data-en-placeholder], [data-es-placeholder]').forEach((el) => {
      if (el.hasAttribute('data-en') && el.hasAttribute('data-es')) {
        el.textContent = lang === 'en' ? el.getAttribute('data-en') : el.getAttribute('data-es');
      }

      if (el.hasAttribute('data-en-placeholder') && el.hasAttribute('data-es-placeholder')) {
        el.placeholder = lang === 'en' ? el.getAttribute('data-en-placeholder') : el.getAttribute('data-es-placeholder');
      }
    });

    const toggle = document.querySelector('.lang-toggle');
    if (toggle) {
      toggle.textContent = lang === 'en' ? 'Español' : 'English';
      toggle.setAttribute('aria-label', lang === 'en' ? 'Translate to Spanish' : 'Translate to English');
    }

    document.documentElement.lang = lang === 'es' ? 'es' : 'en';
  }

  window.toggleLanguage = function () {
    const nextLang = getLanguage() === 'en' ? 'es' : 'en';
    setLanguage(nextLang);
    applyLanguage(nextLang);
  };

  document.addEventListener('DOMContentLoaded', function () {
    applyLanguage(getLanguage());
  });
})();
