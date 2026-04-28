import { defineConfig } from 'wxt'
import tailwindcss from '@tailwindcss/vite'

// See https://wxt.dev/api/config.html
export default defineConfig({
  modules: ['@wxt-dev/module-react', '@wxt-dev/auto-icons'],
  vite: () => ({
    plugins: [tailwindcss()],
  }),
  manifest: {
    name: '__MSG_appTitle__',
    description: '__MSG_appDesc__',
    default_locale: 'en',
    host_permissions: [
      '*://*.bilibili.com/',
      'https://bilibili.com/',
      '*://*.laplace.live/',
      'https://laplace.live/',
    ],
    permissions: ['cookies', 'tabs', 'storage', 'alarms', 'unlimitedStorage'],
  },
})
