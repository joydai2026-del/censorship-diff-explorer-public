# Blockers

Nothing blocks the code. These items need Rowan:

| What | Why it matters | What to do |
|---|---|---|
| PR `chore/self-maintaining` is open, not merged | CI, the weekly Monday check, Dependabot, and auto-merge only become active on `main` after the merge. | Review it, then `gh pr merge <PR URL> --squash`. |
| Repo is private | GitHub Free cannot serve Pages from a private repo. | When ready: `gh repo edit joydai2026-del/censorship-diff-explorer --visibility public --accept-visibility-change-consequences`. |
| Hosting not switched on | Pages workflow is manual-only by design. | After going public: Settings > Pages > Source = GitHub Actions, then run "Deploy to GitHub Pages (manual only)" from the Actions tab. |
| Only sample data | The page says "Sample data for demo, not real posts". There is no real scraper. | Decide later whether to connect a real snapshot source (README, "How real data could plug in later"). Real snapshots must stay out of git. |
