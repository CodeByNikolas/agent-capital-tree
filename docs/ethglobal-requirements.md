# ETHGlobal Tokyo 2026 and Uniswap requirements

Checked 26 September 2026 against the live ETHGlobal Tokyo 2026 pages and the
live Uniswap Developer Feedback form. The event runs 25–27 September 2026.

## Requirements that affect the submission

### ETHGlobal project submission

- Submit through the ETHGlobal Hacker Dashboard by **Sunday, 27 September 2026,
  09:00 JST**. The Tokyo submission guide says late submissions are not
  accepted.
- The submission form requires a project title, description, and repository
  link. A demo video is optional but recommended; if uploaded, ETHGlobal asks
  for 2–4 minutes and rejects uploads below 720p, over four minutes, sped-up
  footage, music with text in place of spoken narration, mobile-phone
  recordings, or text-to-speech/AI voiceover.
- A project can select at most **three Partner Prizes**. A partner with several
  tracks still counts as one selected partner. For each selected partner, the
  submission asks for the integration explanation, feedback, and comments.
- The form offers a Finalist-plus-Partner route or Partner-Prizes-only route.
  Finalist entries must attend the finalist judging session: seven minutes per
  team, four minutes for the demo and three minutes for questions. Visiting
  partner booths is optional; partner judging uses the submitted materials.

### Track and provenance rules

- Classic/“From Scratch” entries must begin project-specific code, design, and
  assets after the hackathon starts. Public libraries and starter kits are
  allowed. A pre-event project can still participate, but is ineligible for
  ETHGlobal Finalist and Partner Prize consideration.
- Continuity entries may extend an existing codebase only under the selected
  Continuity track rules. They must disclose what existed before the event,
  include substantive new work made during the event, and keep new extension
  work open source; partner eligibility can vary.
- Use version control throughout the event and include the repository, Figma
  files, or equivalent evidence. ETHGlobal warns that a large single commit or
  missing history can disqualify a submission. The submission must distinguish
  new work from reused work.
- AI tools are allowed, but the submission must identify where and how they
  were used, including affected code files or assets. AI may assist the team
  but must not create the entire project without meaningful team contribution.
  If a spec-driven workflow was used, include its spec files, prompts, and
  planning artifacts in the submission repository.
- ETHGlobal’s judging categories are Technicality, Originality, Practicality,
  Usability (UI/UX/DX), and WOW Factor.

The event is in person. Each team member applies and stakes individually, and a
team has at most five members. ETHGlobal’s rules page also makes submission by
the deadline and physical check-in prerequisites for returning the attendance
stake.

## Uniswap Foundation prize

The Tokyo prize page lists two tiers under the same contribution brief:

| Prize | Availability | Amount | Integration brief |
| --- | --- | --- | --- |
| Best Uniswap Stack Contribution | General event prize | $6,000 total: $3,000 / $2,000 / $1,000 | Build on or integrate the Uniswap API, AMM v2/v3/v4, CCA, another Uniswap protocol, a new v4 hook, an extension or improvement to an official Uniswap repository, or tooling for the wider Uniswap ecosystem. |
| Best Uniswap Stack Contribution | Continuity Track only | $4,000 total: $2,000 / $1,000 / $1,000 | The same integration brief, subject to Continuity-track eligibility. |

Both tiers have the same qualification requirements:

1. A **public GitHub repository** with open-source code.
2. A `FEEDBACK.md` file in that repository.
3. A completed [Uniswap Developer Feedback Form](https://developers.uniswap.org/hackathon-feedback) that includes the link to `FEEDBACK.md`.
4. A README that clearly points reviewers to the relevant contracts and lines
   of code. The prize page says missing requirements may be reviewed and
   audited before winners are finalized.

The current Uniswap form asks for the participant’s first name, email, Telegram
handle, hackathon, project completion, project description, whether it is
AI-powered/agentic, whether Uniswap was integrated, time to first integration,
documentation/support ratings, continuation plans, support used, and legal
consent. The team must supply these personal and experience fields; they are
not repository evidence.

## Static repository compliance audit

This is a repository-only check; it cannot prove an authenticated dashboard
submission or an external form delivery.

| Requirement | Evidence in this checkout | Status / gap |
| --- | --- | --- |
| Public open-source GitHub repository | `README.md:56` points to `https://github.com/CodeByNikolas/agent-capital-tree`; the remote is public and the `main` branch is published. | Pass on the checked public repository. |
| Uniswap integration | `README.md:29`, `README.md:46`, `FEEDBACK.md:5-31`, and the linked contracts/evidence describe the fixed v4 pool, swaps, LP lifecycle, and vault custody. | Static evidence present; partner judges still decide eligibility. |
| `FEEDBACK.md` exists | `FEEDBACK.md` is tracked and contains integration findings and validation evidence. | Pass. |
| Uniswap feedback form completed with `FEEDBACK.md` link | `FEEDBACK.md:3` and `FEEDBACK.md:37` explicitly say the form has not been submitted; `STATUS.md:33` confirms this. | **Open external action.** Submit the form and include the public `FEEDBACK.md` URL. |
| README points to relevant contracts and exact lines | The Uniswap row in `README.md` links to the controller swap gate and vault swap/LP implementations with GitHub line anchors. | Pass for the Uniswap integration; verify anchors after later contract edits. |
| ETHGlobal project entry | `README.md:72` and `STATUS.md:33` explicitly say the ETHGlobal entry has not been submitted. | **Open external action.** Submit title, description, repository, selected partners, and required integration feedback in the Hacker Dashboard. |
| Partner selection and integration explanation | The repository explains the Uniswap integration, but no dashboard submission record exists in the checkout. | **Unverified until the ETHGlobal form is submitted.** Select Uniswap as one of at most three partners and provide its requested explanation/comments. |
| AI-use attribution | `docs/ai-use.md` maps AI assistance to contracts, packages, frontend, scripts, tests and documentation. | Repository disclosure present; repeat or link it in the ETHGlobal form. |
| Spec-driven artifact disclosure | `PLAN.md` and `docs/ai-use.md` identify tracked planning work, but private prompts/transcripts are not public. | **Needs a final submission audit.** Include any additional secret-free prompts/spec artifacts required by the form. |
| Version-control evidence | The repository has ordinary multi-commit history and published branches; it is not a single large commit. | Pass from static history. Preserve history through submission. |
| Demo video | No demo-video URL or video asset is present in the checkout. | Optional, but add a 2–4 minute, 720p-or-better video if using the ETHGlobal Showcase route. |

## Primary sources

- ETHGlobal, [Tokyo 2026 submission and judging guide](https://ethglobal.com/events/tokyo2026/info/details)
- ETHGlobal, [Tokyo 2026 event preparation guide](https://ethglobal.com/events/tokyo2026/info/start)
- ETHGlobal, [Tokyo 2026 event page](https://ethglobal.com/events/tokyo2026)
- ETHGlobal, [rules and code of conduct](https://ethglobal.com/rules)
- ETHGlobal, [Uniswap Foundation prize brief](https://ethglobal.com/events/tokyo2026/prizes/uniswap-foundation)
- Uniswap Developers, [Hackathon Feedback form](https://developers.uniswap.org/hackathon-feedback)
