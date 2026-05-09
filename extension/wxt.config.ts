import tailwindcss from '@tailwindcss/vite'
import { defineConfig } from 'wxt'

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
    host_permissions: ['*://*.bilibili.com/', 'https://bilibili.com/', '*://*.laplace.live/', 'https://laplace.live/'],
    permissions: ['cookies', 'tabs', 'storage', 'alarms', 'unlimitedStorage'],
    // Firefox built-in data consent (required for new submissions from 2025-11-03).
    // The extension's purpose is to sync login/session cookies to the user's own
    // sync server, so authentication info is required for the extension to work.
    // https://extensionworkshop.com/documentation/develop/firefox-builtin-data-consent/
    browser_specific_settings: {
      gecko: {
        // Stable add-on ID matching the existing AMO listing
        // (https://addons.mozilla.org/api/v5/addons/addon/3007316/ -> guid).
        // Required by AMO going forward; without it AMO auto-assigns a GUID
        // each upload, which would break updates for installed users.
        // https://mzl.la/3PLZYdo
        id: '{bea1d1bb-2ed3-46bc-92ca-34bcdb3baa85}',
        data_collection_permissions: {
          required: ['authenticationInfo'],
        },
      },
    },
  },
})
