# Deploy Skill

Deploy the Stylee app to GitHub Pages with full verification.

**Deployment architecture:** Expo static export → dist/ → push to `yiguo2026.github.io` repo → GitHub Pages serves at https://yiguo2026.github.io

**IMPORTANT:**
- This is NOT a Next.js app. It's Expo (React Native for web) with static export.
- Do NOT use Vercel for deployment. The production site is on GitHub Pages.
- The deployment target is a SEPARATE repo: `yiguo2026/yiguo2026.github.io` (NOT the gh-pages branch of stylee_mvp_v2).
- Always clone/fetch `yiguo2026.github.io` into a temp directory for deployment — NEVER modify the main working directory's branch.

## Steps

1. **Verify directory** — Run `pwd` and confirm we are in the stylee_mvp_v2 project root. If not, STOP and report the error.

2. **Verify branch** — Run `git branch --show-current` and confirm we are on `main`. If on another branch, ask the user whether to switch/merge first.

3. **Check for uncommitted changes** — Run `git status`. If there are uncommitted changes, list them and ask the user whether to commit before deploying.

4. **Rebuild dist/** — Run `npm run build:web` to regenerate dist/ from scratch. This runs `expo export --platform web` followed by the HTML patch script. NEVER deploy a stale dist/ folder.

5. **Verify build output** — Check that `dist/` was updated (timestamp is recent, `dist/index.html` exists). If the build failed, STOP and report the error.

6. **Deploy to yiguo2026.github.io** — Clone the deployment repo into a temp directory, replace contents, and push:
   ```bash
   git clone git@github.com:yiguo2026/yiguo2026.github.io.git /tmp/stylee-deploy
   cd /tmp/stylee-deploy
   # Remove old build artifacts (keep privacy.html, terms.html, .nojekyll)
   rm -rf _expo assets favicon.ico index.html metadata.json
   # Copy fresh dist/ contents
   cp -r <project_root>/dist/* .
   git add -A
   git commit -m "deploy: <message>"
   git push origin main
   # Clean up
   rm -rf /tmp/stylee-deploy
   ```

7. **Verify live site** — Wait ~30s for GitHub Pages to build, then fetch https://yiguo2026.github.io and verify the change is reflected. Check that the JS bundle hash in the HTML matches the new build.

8. **Report** — Output a summary:
   - URL deployed: https://yiguo2026.github.io
   - Source repo: stylee_mvp_v2 (main branch)
   - Target repo: yiguo2026.github.io
   - Build command used
   - Confirmation that live site reflects changes (or list of issues found)
