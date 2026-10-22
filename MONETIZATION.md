# Monetization: an honest take

**Recommendation: open source it (MIT) to promote Rowan's work. Do not try to sell it yet.**

## Why not sell it now

| Option | How it would work | Honest problem |
|---|---|---|
| Paid hosted version (Stripe) | Free core, paid dashboard that runs scrapers and stores snapshots | The hard, valuable part (reliable collection from Weibo and others) does not exist here. Running scrapers against Chinese platforms is legally and technically fragile, and storing ordinary users' deleted posts creates personal-data risk. That is not a low-maintenance business. |
| Paid API | Charge per diff run | The diff is a small pure function. Anyone can run it locally for free, which is the point of the design. |
| Newsroom or NGO licensing | License to newsrooms tracking censorship | Buyers in this space (China Digital Times, GreatFire, Citizen Lab, HKU Weiboscope) already have their own pipelines and real datasets. A sample-data tool does not compete. |
| Grants | Internet-freedom funds (for example OTF-style programs) | Plausible only with real collection, a partner organization, and a safety plan. That is a project, not this repo. |

## Why open source works

- It is a clean, well-tested, dependency-free example of a careful method (time zones, broken-capture
  guard, honest survival ranges, safe rendering). That is good portfolio material.
- MIT lets researchers and journalists adopt the engine with no friction, which is the realistic
  route to it being used and cited.
- Costs nothing to keep alive: no servers, no keys, weekly CI.

## If Rowan later wants revenue

Build the collector as a separate, private project with a real partner (newsroom or research lab),
then consider a grant or a paid hosted service. Keep this repo as the open engine either way.
