# Study Planner (Netlify version)

## Deploy
1. Push this folder to a GitHub repository (the folder itself must be the repo root, with netlify.toml at the top level).
2. In Netlify: Add new site, Import an existing project, pick the repo. Netlify reads netlify.toml, so leave build settings as detected.
3. Before or right after the first deploy: Site configuration, Environment variables, add GEMINI_API_KEY.
   Optional: ACCESS_CODE (visitors must enter it) and MODEL.
4. Trigger a redeploy after adding variables.

Or drag-and-drop does NOT run functions. Use the Git import or the Netlify CLI (`npx netlify deploy --prod`).

## Notes
- Netlify functions time out after about 10 seconds on the free plan, so this version uses the fast
  Gemini Flash model with shorter notes. If you see timeouts, keep MODEL as is or lower the detail level.
- The timetable is stored in each visitor's browser.
