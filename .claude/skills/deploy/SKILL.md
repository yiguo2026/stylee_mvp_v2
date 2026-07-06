# Deploy Skill

Deploy the Stylee app to Vercel production with full verification.

## Steps

1. **Verify directory** — Run `pwd` and confirm we are in the stylee_mvp_v2 project root. If not, STOP and report the error.

2. **Verify branch** — Run `git branch --show-current` and confirm we are on `main`. If on another branch (e.g. dev), ask the user whether to merge into main first. Vercel production deploys from main.

3. **Check for uncommitted changes** — Run `git status`. If there are uncommitted changes, list them and ask the user whether to commit before deploying.

4. **Rebuild dist/** — Run `npm run build:web` to regenerate dist/ from scratch. This runs `expo export --platform web` followed by the HTML patch script. NEVER deploy a stale dist/ folder.

5. **Verify build output** — Check that `dist/` was updated by comparing its timestamp or checking that `dist/index.html` exists and is recent. If the build failed, STOP and report the error.

6. **Deploy to Vercel** — Run `npx vercel --prod` to deploy to production.

7. **Verify live site** — After deployment completes, fetch the live URL and verify the change is actually reflected. Do NOT report success until the live site confirms the change.

8. **Report** — Output a summary:
   - URL deployed
   - Branch used
   - Build command used
   - Confirmation that live site reflects changes (or list of issues found)
