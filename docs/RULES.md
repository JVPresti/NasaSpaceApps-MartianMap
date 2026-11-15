# Rules check

Answers to the three questions in #12, from the official 2026 rules. Checked 2026-11-15. Every quote below is copied from the page it links to.

Sources:

- [Participant FAQs](https://www.spaceappschallenge.org/resources/participant-faqs/), 2026
- [Team Formation Guide](https://www.spaceappschallenge.org/resources/team-formation-guide/), dated 23 September 2026
- [Project Submission Guide](https://www.spaceappschallenge.org/resources/project-submission-guide/), dated 13 November 2026
- [Judging and Awards Guide](https://www.spaceappschallenge.org/resources/judging-awards-guide/), dated 13 November 2026
- [2026 Participant Terms and Conditions](https://www.spaceappschallenge.org/legal/), updated 7 August 2026
- [NASA Images and Media Usage Guidelines](https://www.nasa.gov/nasa-brand-center/images-and-media/) and [NASA Brand Guidelines](https://www.nasa.gov/nasa-brand-center/brand-guidelines/)

## Short answers

1. **Work before the event is not allowed.** The rules do not ask teams to declare it. They forbid it. Our terrain, astronaut, habitat and test bench were made on 12 and 13 November. Tell the Ensenada local lead today, in writing, and put the prior-work statement below in the submission.
2. **SI (Super Intelligence, the 2026 term for AI) is allowed, with three disclosures.** SI images and videos need a visible watermark. Code and data need a note in text and in metadata. The form asks which SI uses we made. Our four AI images and the start video have no watermark yet. The guide also says SI "should not be used to (come up with your idea", and our challenge choice came out of an AI session.
3. **Keep the NASA insignia on the suit and habitat for the hackathon.** Space Apps limits NASA marks only in SI-generated content, and NASA allows its 3D model textures in educational simulations. Keep the logos out of our branding and out of any SI tool, and paint them out before any use after the event.

Deadline: Sunday 15 November, 11:59 pm Ensenada time (PST, UTC-8), which is 07:59 UTC on 16 November. "Any projects saved or submitted past this deadline will not be eligible for judging." Submit by 10:59 pm.

## 1. Work done before the event

### What the rules say

> Resources for each challenge will be published on November 13. Teams are not allowed to begin working on the challenges prior to the hackathon.

Participant FAQs.

> We appreciate the enthusiasm of participants who want to start as early as possible. However, participants should NOT begin working on their project until the hackathon begins on November 14, 2026 (9:00 a.m. local time) to ensure a fair and equitable process.

Team Formation Guide.

The Terms and Conditions do not repeat this rule and name no penalty. They do require every source to be cited:

> You must cite every source that is used in the creation of your project, even if it is open source or freely available. ... NASA also reserves the right to remove nominations, awards, or winner status from teams that do not cite resources used in their Solution

The submission form ends with a required checkbox: "I confirm that the submitted project represents my team's original work and that all external resources, including code, text, and images used in the project, are listed in the NASA Data and the Space Agency Partner & Other Data fields".

No 2026 page explains how to declare a team's own work from before the start. The rules assume there is none.

### What our history shows

The hackathon began at 9:00 am PST on 14 November. The repository has 139 commits on `main`. Four came before 9:00. One brought in work made on earlier days.

| When (PST) | Commit | What | Made before the event? |
|---|---|---|---|
| 14 Nov 08:47 | `710ed48` | Repository created with a one-line README | Yes, 13 minutes early. Empty |
| 14 Nov 08:52 | `41a6066`, `10c7e1a` | Stock Vite + React template | Yes, 8 minutes early. Template code, none of it ours |
| 14 Nov 09:49 | `9fb29fc` | "Add Marswalk graphics assets": 48 files, 2,866 lines of text plus binary models and textures | **Yes.** `docs/marswalk-assets/README.md` dates its own work: "terrain asset finished 2026-11-12", then passes dated 2026-11-12 and 2026-11-13 for the first-person arms, legs, sample clips, hand-over, props and the habitat interior and exterior |
| 14 Nov 11:03 onward | `#76` to `#279` | Cost grid, planner, event engine, app, data, HUD, everything else | No. Issue, branch and PR history all start after 9:00 |

What `9fb29fc` contains:

- The terrain cut from the HiRISE and CTX products: `terrain.json`, `ring.json`, the orthophotos, `route.json`, rock layout and textures.
- The Z-2 astronaut rigged and animated in Blender: `z2_astronaut.glb`, `z2_fp_legs.glb`, arm clips.
- The habitat built on NASA's Habitat Demonstration Unit, with its interior, furniture and baked lighting.
- The hand tool and sample case.
- A 1,509-line three.js test bench (`docs/marswalk-assets/testbench-reference/`). The app engine (`src/engine/`, PR #82) was ported from it, and each engine file names the test bench lines it came from.

Two more things predate the event:

- **The concept.** The idea (a map of everywhere the astronaut can reach and still get back from, shrinking during a replayed solar particle event) was settled on the night of 13 November. The challenge statement had been public since 28 October.
- **The plan.** `docs/IMPLEMENTATION_PLAN.md` arrived at 11:05 on 14 November, but its risk table proposes "Phase 0 and data work before the event if the rules allow it", which reads as written before the start. The team should confirm.

### Recommendation

Do not hide it. The git history is public to anyone the repo is shared with, and the assets README dates every pass. Hiding it would turn a rules question into an honesty question.

1. **Today, before submitting:** message the Ensenada local lead. Say what was made on 12 and 13 November, and ask whether the project stays eligible for local and global judging. Keep the reply.
2. **In the submission:** paste the statement below at the end of Project Details. It names the pre-event assets, so they need no separate list.
3. **If the local lead says no:** the code written during the event (planner, events, suit model, HUD, data files, every NASA dataset pipeline) does not depend on the pre-event textures. It does depend on `terrain.json` and the engine port. Ask whether a statement of what was rebuilt during the event is enough before anyone tries to rebuild assets in the last hours.

### Prior-work statement, ready to paste

> Prior work: before the hackathon started at 9:00 am on 14 November, our graphics team prepared assets on 12 and 13 November: the HiRISE and CTX terrain tile of Neretva Vallis cut for Blender (heights, orthophotos, the first waypoint list and the rock layout), the NASA Z-2 suit rigged and animated, the habitat built on NASA's Habitat Demonstration Unit, two props, and a three.js test bench that loads them. They arrived in one commit at 9:49 am on 14 November (`9fb29fc`), and `docs/marswalk-assets/README.md` dates each pass. During the event we ported the app's rendering engine from that test bench, and wrote everything else: the route planner and cost grid, the suit and oxygen model, the event engine, the dust storm, radiation and low-oxygen events, the shelters, the source tags on every number, the HUD and Plan mode, and the MEDA, RAD, DONKI and Perseverance traverse and image pipelines. We chose the challenge and the concept on 13 November, with help from an AI assistant. We told our local lead about this before submitting.

Edit the last sentence to match what happened.

## 2. Use of SI

"SI" means Super Intelligence. From the FAQ:

> In accordance with the September 29, 2026 U.S. Executive Order, "the executive branch shall use the terms 'Super Intelligence' and 'SI' in place of 'Artificial Intelligence' and 'AI.'" ... Examples include large language models, conversational assistants, image and video generation tools, foundation models, and code generation tools. Participants may use SI tools ... Each team's project submission must include a description of how SI tools were used during the development of their project.

From the Project Submission Guide:

> The use of SI tools, such as machine learning, chatbots, image generation, and large language models, is permitted for the NASA Space Apps Challenge and should be used as a tool to accelerate innovation and creativity for your challenge solution. SI should not be used to (come up with your idea of how to solve the challenge).
> Generated content may not use, contain, or modify any NASA branding or design elements (such as the NASA logos, flags, or mission identifiers).
> We require that you clearly indicate where and how SI tools were utilized in your project, including:
> Images and videos: Must include a visible watermark to indicate SI generation .
> Audio: Must acknowledge SI generation in descriptive text and metadata.
> Code and data: Must acknowledge SI generation in descriptive text and metadata.
> This SI question is for data‑collection purposes only, and your response will not be seen by the judges. However, judges will be able to see any SI‑generated indicators within your project—such as watermarks, descriptive text, or metadata.

NASA's own media guidelines add: "NASA does not permit our Insignia (i.e., NASA Meatball, Worm logotype, or Seal) to appear with SI generated imagery or in the training of SI tools."

### What we made with SI

| What | Tool | Disclosed today | Missing |
|---|---|---|---|
| Start screen video (`src/assets/ui/home.webm`, `home.mp4`) and its poster (`surface.webp`) | Higgsfield | Caption on the start screen: "Video: AI-generated illustration of an EVA". Listed in `docs/credits.md` | A visible watermark on the video and the poster |
| Hazard illustrations for dust, oxygen and radiation (`src/assets/ui/hazard_*.webp`) | Higgsfield | `docs/credits.md` | A visible watermark on each image |
| Code | AI coding agents (Claude Code), with three.js skills in `.agents/skills/` | `AGENTS.md`. Nine commits carry a `Co-authored-by: Claude` trailer, but most AI-written commits do not | A sentence in the README and the form text, and a metadata field |
| Data files and research | AI research agents opened the papers and NASA reports behind `public/data/hazards.json`. Scripts we wrote with SI build `meda_sol.json`, `rad.json`, `shelters.json`, `traverse.json` | `docs/data/hazards-research.md` describes "research passes" without naming SI | A sentence in text and a metadata field |
| Docs, plan, Spanish translation | Language models | Nothing | A sentence in text |
| Challenge choice and concept | A conversational assistant, 13 November | Nothing | See below |

I checked the poster and the three hazard images. None shows a NASA logo, flag or mission identifier, so the "generated content may not use NASA branding" rule holds for them. I did not check every frame of the video. Watch it once before submitting. The suit audio is synthesized by our code with the Web Audio API, not by an SI audio tool, so it falls under code.

**The ideation question.** The guide says SI "should not be used to (come up with your idea of how to solve the challenge)". The form also offers "Ideation or Brainstorming" as an SI use. One of us worked out the challenge choice and the concept with an AI assistant on 13 November. The team has to decide how to answer, and the honest answer is to tick "Ideation or Brainstorming". The form answer is not shown to judges.

### Gaps to close before submitting

- Watermark the video, the poster and the three hazard images: [#301](https://github.com/JVPresti/NasaSpaceApps-MartianMap/issues/301). The rule says "must". A small "SI-generated" label in a corner is enough.
- Add the SI note to code and data metadata: [#302](https://github.com/JVPresti/NasaSpaceApps-MartianMap/issues/302).
- Add the descriptive text to the README. The judge-facing README pass does this.

### Form answer

Tick these in "Use of Super Intelligence (SI)":

- Ideation or Brainstorming
- Research or Information Gathering
- Data Analysis and Interpretation
- Coding, Debugging, or Troubleshooting
- Writing, Editing, or Translation
- Visual Design or Image Creation
- Presentation, Video, or Audio (tick only if the demo video or slides use SI)

Do not tick "Building SI/ML Into the Project". Marswalk runs no model. The planner is A* and the suit model is a formula.

### SI disclosure text, ready to paste

For Project Details and the README:

> Use of SI: we built Marswalk with SI tools and reviewed their output. We used an AI assistant to compare challenges and talk through the concept on 13 November. AI coding agents (Claude Code) wrote most of the code from our issues, and every change went through a reviewed pull request with tests. AI research agents found and opened the NASA reports and papers behind our numbers, and an audit run with AI agents and reviewed by us checked all 109 numbers on screen against their sources (`docs/VALIDITY.md`). Language models helped write the docs and the Spanish translation. The start screen video, its poster and the three hazard illustrations were generated with Higgsfield. They are artwork, not mission images, contain no NASA marks, and are captioned or credited as AI-generated. No SI model runs inside the app. The terrain, the weather, the radiation and the rover data are NASA measurements, and the route planner is plain A* on the HiRISE height grid.

When #301 lands, change "captioned or credited as AI-generated" to "carry a visible SI-generated watermark".

## 3. NASA insignia on the suit and habitat

### What we show

- **Z-2 suit** (`public/marswalk/assets_astronaut/z2_astronaut.glb`), from [NASA 3D Resources](https://github.com/nasa/NASA-3D-Resources/tree/master/3D%20Models/Z2%20Spacesuit). Its texture keeps NASA and flag patches. `z2_accent_mask.png` never recolours them.
- **Habitat** (`public/marswalk/assets_habitat/habitat.glb`), built on NASA's [Habitat Demonstration Unit](https://github.com/nasa/NASA-3D-Resources/tree/master/3D%20Models/Habitat%20Demonstration%20Unit). On 13 November the team painted out the small NASA logos, flags, mission patches and X-Hab logos. One large NASA logo and one flag stay on the loft.
- No SI-generated image or video shows a NASA mark.

### What the rules say

Space Apps restricts NASA marks only in SI-generated content (quoted above). It says nothing about NASA's own textures.

NASA's Images and Media Usage Guidelines:

> NASA content – images, audio, video, and media files used in the rendition of 3-dimensional models, such as texture maps and polygon data in any format – generally are not subject to copyright in the United States. You may use this material for educational or informational purposes, including photo collections, textbooks, public exhibits, computer graphical simulations and Internet Web pages.

> NASA content used in a factual manner that does not imply endorsement may be used without needing explicit permission. NASA should be acknowledged as the source of the material.

> The NASA Insignia, Logotype, identifiers, and imagery are not in the public domain.

> For use of NASA images clearances may be necessary for images that include any NASA logos or NASA employees to be used as cover art or in promotional content.

NASA Brand Guidelines:

> The NASA Insignia (the blue "meatball" logo), the NASA Logotype (the "worm" logo) and the NASA Seal may not be used for any purpose without explicit permission. These images may not be used by persons who are not NASA employees or on products, publications or web pages that are not NASA-sponsored. These images may not be used to imply endorsement or support of any external organization, program, effort, or persons.

No page covers the exact case of a NASA logo inside a NASA-published 3D texture. The two NASA pages pull in opposite directions: model textures are fine in simulations, the insignia needs permission. The decision below is our reading. NASA's brand office (agency-brand@mail.nasa.gov) can give a definitive answer, but not before the deadline.

### Decision: keep it, with four limits

Keep the textures as they are for the hackathon. The models are NASA material used in a computer simulation for an educational, NASA-run challenge, and `docs/credits.md` credits NASA. Removing the marks now would mean texture work in the last hours for a rule that Space Apps does not state.

1. Never use the meatball, the worm or the flag as Marswalk's own branding: not in the title, the favicon, the slide cover, the README hero image or the video thumbnail. Pick screenshots where the logo is not the subject.
2. Never pass a frame that shows the suit or habitat logos through an SI tool. An SI image that shows a NASA logo breaks both the Space Apps rule and NASA's.
3. Never write that NASA endorses, supports or is a partner of Marswalk. "Built on NASA data" is fine. NASA also bars "according to NASA" phrasing inside SI products.
4. Before any use after the hackathon, paint out the last logo and flag on the habitat and the patches on the suit: [#303](https://github.com/JVPresti/NasaSpaceApps-MartianMap/issues/303).

## Other rules we meet

- **NASA data for a Global Award.** "To be eligible for a Global Award, you must use at least one NASA data or resource." We use 13 NASA datasets and services, 3 Photojournal images, 13 NASA documents and pages, the NASA GISS Mars24 notes and 2 NASA 3D models. `docs/SUBMISSION.md` lists them.
- **No one under 18.** "Project demonstrations and final projects may not include any images, video, audio, or other likeness to persons under 18 years old." The astronauts are 3D models and the start video is generated. Check the demo video before upload: no team member under 18 on camera or voice.
- **Public links.** Demo and final project links must open "with no logins, permissions, or registrations required". The repository is private today. Make it public, or use the deployed site as the final project link.
- **Licence.** Original content must be open source. Without a licence, NASA distributes it under Apache 2.0. Every third-party asset needs its licence listed, which `docs/credits.md` already does.
- **English.** The form, the slides and the subtitles must be in English.
- **Demo length.** At most 7 slides or 30 seconds of video. "Projects that exceed these limits will not be eligible for Global Judging."
