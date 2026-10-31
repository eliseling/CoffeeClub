# Coffee Club

A shared, cozy tasting journal for workplace coffee breaks. Add coffees, keep recipes, rate each cup by name, and compare the club's favorites.

## Run locally

Requires Node.js 24 or newer and npm. SQLite is provided by Node, so no database service is needed.

```sh
npm install
npm run dev
```

Open http://localhost:5173. The API runs on port 3001. Vite automatically uses the next available frontend port if 5173 is occupied. Without cloud configuration, entries are saved to the local SQLite database.

The club starts with **Korean coffee**, **Brazilian coffee**, and **Iced Biscoff spread coffee**. These are real, unrated entries, not examples. Unspecified dates, roast levels, origins, and brewing methods are left unrecorded. You can edit the details and add recipes as you go. The entries are initialized once; deleting one will not bring it back after a restart.

## Publish on GitHub Pages

GitHub Pages only hosts static files. It cannot run the SQLite/Express server or save changes back into your repository. The app therefore uses **Supabase PostgreSQL** for shared storage when published. Everyone using the site connects to the same cloud journal; your laptop does not need to stay running. Creating a GitHub Pages URL alone is not enough: complete the database setup below first.

1. Create a project at https://supabase.com/dashboard. Use a dedicated project for this club.
2. Open its **SQL Editor** and run [the database setup](supabase/migrations/001_shared_journal.sql). This creates the journal tables, validates inputs, enables shared access, and adds the three coffees without invented ratings or recipes.
3. In the Supabase **Connect** dialog or **Settings > API Keys**, find the project URL and the **publishable key** (`sb_publishable_...`). Never use a secret key or the legacy `service_role` key in this app. Publishable keys are intentionally visible to browsers; they are not member passwords.
4. In your GitHub repository, open **Settings > Secrets and variables > Actions** and create two repository secrets: `VITE_SUPABASE_URL` with the project URL, and `VITE_SUPABASE_PUBLISHABLE_KEY` with the publishable key. Enter them directly in GitHub, not in chat or source code.
5. Open **Settings > Pages** and select **GitHub Actions** as the source, not **Deploy from a branch**.
6. Push the application to `main`, or run **Publish Coffee Club** from the **Actions** tab. The workflow tests the app, builds with the cloud settings and correct repository URL prefix, and publishes the site. If your default branch is not `main`, update the branch in [.github/workflows/deploy-pages.yml](.github/workflows/deploy-pages.yml).
7. Open the URL shown in **Settings > Pages** or the completed deployment. Add a tasting or rating, then open the same URL in another browser to verify it is shared. Other visitors receive updates within 15 seconds.

**Access warning:** this is a shared notebook without sign-in. Anyone who can access the public app/database can read, create, change, or delete the club's entries and rate using any name. The database's shared-access policies intentionally permit this. A hard-to-guess URL is not access control. Keep sensitive information out of it and add member authentication/restrictive policies before using it for private or controlled records. GitHub repository privacy does not make the database private.

Check your Supabase plan's quotas, inactivity/pause rules, and backup policy. Export the journal regularly. Storage is persistent independently of browsers and redeployments, but it is not a substitute for backups.

## Same journal on localhost and online

Create an ignored `.env.local` file in the project root using the variable names in [.env.example](.env.example), with **the same Supabase URL and publishable key** used in GitHub. Restart `npm run dev` after changing the file. Localhost will then read and write the same cloud data as GitHub Pages.

Without `.env.local`, localhost deliberately uses its own SQLite journal. Existing SQLite data is not automatically uploaded to Supabase; the local and cloud journals are separate unless localhost is configured to use the cloud. Both databases initialize the same three coffees, but later edits/ratings only synchronize when the same cloud project is used.

Do not commit `.env.local`. For a custom Pages domain, the workflow obtains the correct base path from GitHub Pages automatically. After changing repository secrets, rerun deployment because Vite embeds the public configuration at build time.

## Shared use

Everyone accessing the same server shares the same journal. For colleagues on the same network, use the host machine's network address and frontend port instead of `localhost`. The host must remain running and its firewall must allow access.

For a single production server:

```sh
npm run build
npm start
```

Open http://localhost:3001. `PORT` sets the production port. `COFFEE_DB` sets the database file location; the default is `data/coffee-club.sqlite`. Use persistent storage when deploying, not an ephemeral container filesystem. This application is intended for a trusted internal network: it has no authentication, and visitors can edit/delete entries or rate using any name. Add authentication and HTTPS before exposing it publicly.

## Your journal

- Coffees, recipes, and individual ratings are stored in SQLite locally or in Supabase when cloud-configured, never just in a browser. Data survives refreshes; local entries survive server restarts and cloud entries survive website redeployments.
- One rating per member name per coffee. Names are case-insensitive; saving again updates that member's rating. Only the last-used name is remembered in browser local storage.
- Overall, aroma, flavor, and body scores range from 1 to 5. Insights rank coffees by average overall score.
- Only saved coffees and recipes are displayed. Statistics only count saved entries.
- Use **Export club journal** to download a JSON snapshot from whichever database the app is connected to. To back up and restore the local database itself, stop the server and copy/restore `data/coffee-club.sqlite`. For the cloud database, use Supabase's backup/export tools. JSON exports are for archival use; there is no in-app import.
- Deleting a coffee also deletes its ratings, after confirmation.
- Shared entries refresh every 15 seconds. Coffee photography and fonts use Unsplash and Google Fonts; data storage does not rely on those services.

## Verify

```sh
npm test
npm run build
```

The tests cover SQLite persistence across database reopen, case-insensitive rating updates, cascading deletion, one-time initial entries, cloud adapter mapping/writes, and invalid input rejection. They also execute the real Supabase migration in embedded PostgreSQL to verify shared permissions and database constraints. Live Supabase/GitHub deployment still requires your account configuration and the cross-browser check above.