# Lessons from building this

Engineering notes moved out of the README. Line numbers point at the files as of this commit.

1. **Compare snapshots, not live pages.** The whole engine is one pure function: list of
   snapshots in, report out, nothing else touched. That makes it easy to test and to run
   anywhere. See `src/engine.js:182`.
2. **A time with no zone is a bug waiting to happen.** Beijing midnight is 16:00 UTC the day
   before, so a missing zone moves posts to the wrong day. The engine refuses such times
   (`src/engine.js:37`) and groups days with a fixed offset (`src/engine.js:51`). Tests at
   23:59 and 00:01 Beijing are in `test/engine.test.mjs`.
3. **Guard against your own scraper failing.** An empty capture looks exactly like mass
   censorship. The guard only ignores a capture when the missing posts come back in the next
   one, so real deletions are never thrown away (`src/engine.js:133`). The first version of
   this guard got stuck and ignored every later capture; running it on the sample data
   caught that, and a test now pins it.
4. **Say what you do not know.** Survival time is reported as a range, from last seen to
   gone by (`src/engine.js:324`), and the page lists the method's blind spots.
5. **Show untrusted text as text.** Every word from a data file goes into the page through
   `textContent`, never as HTML (`web/app.js:137`), and a test loads a post containing an
   `<img onerror>` trick to prove it is not run.
6. **A browser test without a browser library.** Node 22 has WebSocket built in, so the tests
   talk to headless Chromium directly over the DevTools protocol, each page in its own fresh
   profile, with sound switched off (`test/helpers/cdp.mjs:26`, `test/helpers/cdp.mjs:75`).

