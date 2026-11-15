# Marswalk deployment

Marswalk is a static site. The deploy package contains `public/`, the checked-in runtime data under `data/`, and `SOURCES.md`; it does not run `server.mjs` in production.

## Free Cloudflare Pages setup

The repository is private, so the included GitHub Actions workflow uploads the site to Cloudflare Pages. It avoids exposing the repository and avoids depending on Cloudflare's Git checkout to retrieve source files.

1. In Cloudflare, create a Pages project with Wrangler and use the branch name below as its production branch:

   ```sh
   npx wrangler login
   npx wrangler pages project create marswalk --production-branch codex/terrain-route-preferences
   ```

   This is a Direct Upload project; keep using Direct Upload for this project. Later uploads come from GitHub Actions. If `marswalk` is already taken, choose another project name and use that same name in the GitHub variable below.
2. Create a Cloudflare API token with Pages deployment permissions and copy the account ID from the Cloudflare dashboard.
3. In the GitHub repository settings, add these Actions repository secrets:
   - `CLOUDFLARE_API_TOKEN`
   - `CLOUDFLARE_ACCOUNT_ID`
4. Add the Actions repository variable `CLOUDFLARE_PAGES_PROJECT` with the project name (`marswalk` unless you chose another name).
5. Build and deploy the first version from the repository root:

   ```sh
   cd Sim
   npm run build:pages
   npx wrangler pages deploy dist --project-name=marswalk --branch=codex/terrain-route-preferences
   ```

6. Push a commit affecting `Sim/` on `codex/terrain-route-preferences`. GitHub Actions packages the app and uploads it to the Pages project.

The package is assembled by `npm run build:pages`. The build checks for the active DTM and source list, rejects a DTM-sized Git LFS pointer, then copies the app and its runtime data into `Sim/dist/`. The generated folder is ignored by Git.

The workflow intentionally deploys one production branch. Other branches remain available for review and do not replace the live site. Once the integration owner approves a release branch, update both the workflow branch filter and the Pages production branch to that release branch.

## Local package

```sh
cd Sim
npm run build:pages
```

The output directory can be previewed with any static file server. Application paths such as `/data/...` are intended to resolve from the Pages site root.
