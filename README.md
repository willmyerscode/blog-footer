# Blog Footer

Blog Footer adds sections from a Squarespace layout page below blog posts.

Copyright Will Myers. All rights reserved.

This repository contains the browser assets. Installation instructions are supplied separately with the plugin.

## Development

The browser source is the distribution file; no build step or package installation is needed.

- `npm run check` checks JavaScript syntax.
- `npm test` checks rule selection and source validation with Node's built-in test runner.

Squarespace initialization uses the shared Will Myers toolkit. The fallback loader pins toolkit v1.0.32. An existing compatible toolkit on the page is reused. The plugin does not load Section Loader.
