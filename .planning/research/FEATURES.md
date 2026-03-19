# Feature Research

**Domain:** Indian weekly meal planner (personal use, web app)
**Researched:** 2026-03-19
**Confidence:** MEDIUM-HIGH (eatthismuch.com UX confirmed from official help docs; Indian meal patterns from multiple food blogs and Wikipedia; lock/regenerate UX confirmed from ETM tutorials)

---

## Feature Landscape

### Table Stakes (Users Expect These)

Features users assume exist. Missing these = product feels incomplete.

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| Full-week view (Mon-Sun grid) | Every meal planner shows the week at a glance; absence is jarring | LOW | 7-day grid with breakfast/lunch/dinner rows per day |
| One-click weekly plan generation | Core value proposition; eatthismuch.com built its brand on this | MEDIUM | Must call the randomization engine with all rules applied |
| Meal lock + regenerate rest | Standard eatthismuch.com UX; users expect to fix one meal and randomize everything else | MEDIUM | Lock is per-slot (e.g., lock Wednesday lunch, regenerate all others) |
| Individual meal swap | After generating, users need to swap one bad suggestion without redoing the whole week | LOW | Click a slot → pick an alternative from the meal library |
| Meal library CRUD | Users must be able to add, edit, and delete their own meals | MEDIUM | Core data model: meals have Base + Curry + Subzi + Extras as structured fields |
| Meal composition structure (Base + Curry + Subzi + Extras) | Indian meals are not a single dish — the thali model with rice/roti + dal + subzi + accompaniments is the household norm | HIGH | Data model must support multi-component meals; each component is independently selectable |
| Configurable meal slots | Not every household has three meals; users need to toggle which slots exist per day | LOW | Toggle breakfast/lunch/dinner per day or globally |
| Save/persist plans | Users expect to revisit past plans and compare | LOW | Simple named plan save; at minimum persist the current week |
| Export / share plan | Print to paper, share via WhatsApp, or screenshot to phone; very common Indian household behavior | MEDIUM | PDF and image (PNG) export are table stakes; plain text copy is a bonus |

### Differentiators (Competitive Advantage)

Features that set the product apart. Not required, but valued — especially in the Indian context.

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| Natural language scheduling rules (LLM-translated) | No other Indian meal planner supports rules like "Fridays are fish days" or "Never repeat the same subzi in one week" — users currently maintain this in their heads | HIGH | English rule → LLM → structured filter applied at generation time; requires Claude/OpenAI API integration |
| Component-level randomization (not just meal-level) | The real variety in Indian cooking comes from varying the subzi and curry with the same base — rice + sambar + beans subzi vs rice + rasam + potato subzi are meaningfully different | HIGH | Randomization engine must operate at Base/Curry/Subzi/Extras level, not just at the "meal" level |
| Day-of-week rule types | Indian households have strong day-based patterns: no meat on Tuesdays/Thursdays, fish only on certain days, "khichdi Fridays," ekadashi fasting | MEDIUM | Rule engine must understand day-of-week as a first-class constraint dimension |
| Rotation rules (no-repeat within N days) | "Don't repeat the same subzi twice this week" or "same dal not two days in a row" are common mental rules Indian cooks apply | MEDIUM | Requires tracking what was generated in current/prior week and filtering it from candidate pool |
| Indian food taxonomy (regional dish categories) | Generic meal planners have Western food databases; Indian users must manually enter everything — a pre-seeded library of Indian dishes reduces friction massively | HIGH | Need meaningful categories: South Indian, North Indian, breakfast idli/dosa types, rice dishes, roti dishes, seasonal subzi |
| Extras / accompaniments as first-class fields | Rasam, sambar, pappad, pickle, curd, sweets — these are not "toppings" in Indian cooking, they are distinct courses on the plate | MEDIUM | Extras field on the meal model; extras can also have their own rotation rules |
| Leftover / planned-ahead slot support | Indian households often cook extra on weekends for Monday; flagging a slot as "planned/leftover" prevents it from being randomized | LOW | Slot state: randomizable vs locked vs planned-manually |
| Plan history and comparison | Looking back at last week's plan to avoid repeating entire meal combinations across weeks | LOW | Store N past plans; display side-by-side or show "last served" date per meal |

### Anti-Features (Commonly Requested, Often Problematic)

Features that seem good but create problems. Build these in v2+ only if validated.

| Feature | Why Requested | Why Problematic | Alternative |
|---------|---------------|-----------------|-------------|
| Calorie and macro tracking | Meal planners typically bundle nutrition; users may ask for it | Completely changes the data model and UX — requires a food nutrition database (USDA/Edamam), per-ingredient weights, and daily tracking UI; scope doubles | Explicitly out of scope for v1; link out to Cronometer if a user asks |
| Grocery list generation | Every major meal planner has it; eatthismuch.com premium feature | Requires ingredient-level data on every meal (quantities, units); the current model only stores meal names + components, not recipes | Build meal library first; add grocery list in v1.x once meal data model is stable |
| Recipe storage (full instructions) | Users want to store how to cook each meal, not just its name | Turns this into a recipe manager (separate product category); adds enormous content scope | Keep meals as metadata only (name, component tags, notes field); link to an external recipe if desired |
| Multi-user / family accounts | Households often want a shared plan | Auth complexity, data isolation, conflict resolution when two people edit the same plan — not warranted for a personal tool | Single-user, no auth complexity; share via export (PDF/image) instead |
| Social features (share plans, follow cooks) | Seems like natural growth | Completely different product; requires moderation, CDN, content policy | Out of scope; this is a personal tool |
| Mobile native app | Users want it on their phone | Porting to native is a separate engineering effort; responsive web covers the core use case first | Ship as a PWA with good mobile layout; revisit native in v2 |
| AI-generated recipes from scratch | LLMs can write recipes; seems like a natural add-on | Hallucinated recipes can be wrong/unsafe; requires validation pipeline; distracts from the scheduling/planning core value | Use LLM only for rule translation, not recipe generation |
| Real-time collaboration | Google Docs-style live editing of the meal plan | WebSockets complexity for no real benefit — this is a personal, low-frequency use case | Save-on-edit is sufficient |

---

## Feature Dependencies

```
[Meal Library (CRUD)]
    └──requires──> [Meal Composition Model (Base+Curry+Subzi+Extras)]
                       └──enables──> [Component-Level Randomization]
                       └──enables──> [Rotation Rules (no-repeat subzi)]

[One-Click Plan Generation]
    └──requires──> [Meal Library]
    └──requires──> [Randomization Engine]
        └──enhanced by──> [Natural Language Rules (LLM)]
        └──enhanced by──> [Day-of-Week Rules]
        └──enhanced by──> [Rotation Rules]

[Meal Lock + Regenerate Rest]
    └──requires──> [One-Click Plan Generation]
    └──requires──> [Slot-Level State (locked / randomizable / planned)]

[Individual Meal Swap]
    └──requires──> [Meal Library]
    └──requires──> [Week Grid View]

[Save Plans]
    └──requires──> [Week Grid View]
    └──enables──> [Plan History / Last Served tracking]
    └──enables──> [Rotation Rules (cross-week no-repeat)]

[Export (PDF/Image)]
    └──requires──> [Week Grid View]
    └──requires──> [Save Plans]

[Natural Language Rules]
    └──requires──> [LLM API integration]
    └──requires──> [Randomization Engine with filter interface]

[Grocery List] (v1.x)
    └──requires──> [Meal Library with ingredient-level data]
    └──requires──> [Save Plans]
```

### Dependency Notes

- **Meal Library requires Composition Model:** The Base+Curry+Subzi+Extras structure is what makes component-level randomization possible. If meals are stored as flat strings ("Rice + Sambar + Potato Subzi"), the system cannot independently vary components.
- **Plan Generation requires Meal Library:** Generation is a sampling operation over the library. The library must be seeded with enough meals before generation produces useful output.
- **Natural Language Rules require LLM API:** This is the highest-risk dependency. The LLM must translate English phrases into structured filter predicates (e.g., `{day: "friday", component: "protein", include: ["fish"]}`) reliably. Requires careful prompt engineering and fallback behavior.
- **Save Plans enables Rotation Rules across weeks:** Cross-week no-repeat rules (e.g., "don't repeat same curry this week as last week") require reading history. Save Plans must be implemented first.
- **Grocery List conflicts with current data model:** Grocery list generation requires ingredient + quantity data per meal. The v1 model only stores meal metadata. Adding grocery list forces a data model change — defer to v1.x after the model is stable.

---

## MVP Definition

### Launch With (v1)

Minimum viable product — what's needed to validate the scheduling concept.

- [ ] **Meal Composition Model (Base + Curry + Subzi + Extras)** — foundation for everything; without this structure, differentiation is impossible
- [ ] **Meal Library CRUD** — users must be able to build and manage their personal Indian food library
- [ ] **Mon-Sun Grid View** — the core planning surface; shows breakfast/lunch/dinner per day
- [ ] **One-Click Weekly Plan Generation** — the primary value action; randomizes all unlocked slots
- [ ] **Meal Lock + Regenerate Rest** — essential UX for iterating on a plan without starting over
- [ ] **Individual Meal Swap** — fallback for when a generated meal is wrong; must be frictionless
- [ ] **Natural Language Rules (LLM)** — this is the key differentiator vs any existing Indian meal planner; worth the complexity in v1
- [ ] **Day-of-Week Rules** — tightly coupled to natural language rules; "Fridays are fish days" is the first example users will try
- [ ] **Rotation Rules (no-repeat within week)** — "same subzi twice" is the most common Indian scheduling frustration
- [ ] **Save Plans** — even basic persistence is needed to make the tool useful beyond session
- [ ] **Export (PDF or Image)** — WhatsApp sharing of the weekly plan is a key Indian household behavior; drives organic discovery

### Add After Validation (v1.x)

Features to add once core generation UX is validated.

- [ ] **Plan History + Last Served tracking** — trigger: users ask "when did I last make rajma?"
- [ ] **Cross-week rotation rules** — trigger: users complain that the tool repeats meals from last week
- [ ] **Pre-seeded Indian dish library** — trigger: onboarding is painful because users must enter 30+ meals before generation is useful
- [ ] **Grocery List (basic)** — trigger: users start adding ingredient data to meals voluntarily

### Future Consideration (v2+)

Features to defer until product-market fit is established.

- [ ] **Calorie / macro tracking** — explicitly out of scope; changes product category
- [ ] **Full recipe storage** — turns tool into a recipe manager; separate product
- [ ] **Multi-user / family accounts** — auth complexity; defer until clear demand
- [ ] **Native mobile app** — responsive web + PWA covers v1; native is a separate project

---

## Feature Prioritization Matrix

| Feature | User Value | Implementation Cost | Priority |
|---------|------------|---------------------|----------|
| Meal Composition Model (Base+Curry+Subzi+Extras) | HIGH | MEDIUM | P1 |
| Meal Library CRUD | HIGH | MEDIUM | P1 |
| Mon-Sun Grid View | HIGH | LOW | P1 |
| One-Click Plan Generation | HIGH | MEDIUM | P1 |
| Meal Lock + Regenerate Rest | HIGH | LOW | P1 |
| Individual Meal Swap | HIGH | LOW | P1 |
| Natural Language Rules (LLM) | HIGH | HIGH | P1 |
| Day-of-Week Rules | HIGH | MEDIUM | P1 |
| Rotation Rules (no-repeat in week) | HIGH | MEDIUM | P1 |
| Save Plans | HIGH | LOW | P1 |
| Export PDF / Image | MEDIUM | MEDIUM | P1 |
| Plan History / Last Served | MEDIUM | LOW | P2 |
| Cross-week Rotation Rules | MEDIUM | MEDIUM | P2 |
| Pre-seeded Indian Dish Library | HIGH | HIGH | P2 |
| Grocery List | MEDIUM | HIGH | P2 |
| Calorie / Macro Tracking | LOW | HIGH | P3 |
| Full Recipe Storage | LOW | HIGH | P3 |
| Multi-user / Family Accounts | LOW | HIGH | P3 |

**Priority key:**
- P1: Must have for launch
- P2: Should have, add when possible
- P3: Nice to have, future consideration

---

## Competitor Feature Analysis

| Feature | eatthismuch.com | Generic Indian recipe blogs | Our Approach |
|---------|-----------------|---------------------------|--------------|
| Weekly grid view | Yes (premium) | No (static PDF/image) | Yes — core UI surface |
| One-click generation | Yes (calorie-driven) | No | Yes — rules-driven, not calorie-driven |
| Meal lock + regenerate | Yes (via "I ate this" padlock) | No | Yes — explicit lock button per slot |
| Individual swap | Yes (regenerate single meal) | No | Yes — click slot, pick from library |
| Custom food/meal library | Yes (custom foods + recipes) | No | Yes — Indian meals as structured components |
| Indian food database | No (Western-centric) | Yes (static, not machine-readable) | Planned — user-built library + seeded Indian dishes (v1.x) |
| Scheduling rules | Basic (diet type, calorie cycling) | No | Yes — natural language rules via LLM, Indian-specific patterns |
| Day-of-week rules | Nutrition profile per day, not meal-type rules | No | Yes — "Fridays fish, Tuesdays no meat" etc. |
| Rotation / no-repeat rules | Recurring foods (always appear) | No | Yes — no-repeat within week and cross-week |
| Indian meal structure (Base+Curry+Subzi+Extras) | No (single-dish model) | Implicit in content, not codified | Yes — first-class data model |
| Export PDF | Yes (premium) | Yes (static) | Yes — free feature |
| Grocery list | Yes (premium, integrates Instacart) | No | Deferred to v1.x |
| Nutrition tracking | Yes (core feature) | No | Explicitly out of scope for v1 |

---

## Indian Meal Composition Reference

This section documents the domain model that drives the feature design.

### Standard Indian Lunch/Dinner Structure (Thali Model)

A typical Indian household meal is not a single dish. It is a composed plate:

| Component | Role | Examples |
|-----------|------|---------|
| **Base** | Starchy foundation; sets the meal type | Rice (steamed, jeera, lemon), Roti, Chapati, Paratha, Dosa, Idli, Puri, Naan |
| **Curry / Dal** | Protein and flavor — the wet, saucy element | Sambar, Dal Fry, Dal Tadka, Rajma, Chana, Palak Paneer, Chicken Curry, Fish Curry, Rasam |
| **Subzi** | Dry or semi-dry vegetable side | Aloo Jeera, Beans Poriyal, Cabbage Thoran, Bhindi Masala, Gobi Sabzi, Brinjal Fry |
| **Extras** | Accompaniments — optional but culturally expected | Rasam (if sambar is curry), Pappad/Papadum, Pickle (achar), Curd/Raita, Sweet (payasam, kheer) |

### Key Scheduling Rules Observed in Indian Households

These are the domain-specific rules the natural language system must handle:

1. **Day-protein rules:** "No meat on Tuesdays and Thursdays" / "Fish only on Fridays and Saturdays"
2. **No-repeat subzi within week:** Same dry vegetable dish should not appear twice in 7 days
3. **Base rotation:** "Not rice for both lunch and dinner on the same day" / "Alternate roti lunch and rice dinner"
4. **Fasting slots:** Ekadashi, Navratri, Monday fasts — certain days have no regular meal or a restricted set
5. **Special-occasion meals:** Sundays are for biryani or special non-veg; override normal generation
6. **Seasonal availability:** Methi in winter, raw mango in summer — ingredient-based filtering
7. **Leftovers rule:** "Sunday curry carries to Monday lunch" — lock Monday lunch to whatever Sunday dinner was

---

## Sources

- [Eat This Much — choose plan / pricing](https://www.eatthismuch.com/choose-plan/) — confirmed free vs premium feature split
- [ETM Help: How to prevent a meal or day from generating](https://help.eatthismuch.com/help/how-do-i-prevent-a-specific-meal-or-day-from-generating) — lock mechanic details
- [ETM Tutorial: Regenerate meals, favorite and block foods](https://www.eatthismuch.com/blog/eat-this-much-tutorial-3-getting-meals-you-like-part-1-how-to-regenerate-meals-favorite-and-block-foods/) — regenerate UX confirmed
- [Thali — Wikipedia](https://en.wikipedia.org/wiki/Thali) — Indian meal plate structure, component breakdown
- [South Indian Thali Recipe — Hebbar's Kitchen](https://hebbarskitchen.com/) — South Indian meal component patterns
- [Weekly South Indian Meal Planner — Vidhya's Vegetarian Kitchen](https://www.vidhyashomecooking.com/weekly-south-indian-meal-planner/) — weekly rotation patterns
- [Indian Meal Planning 101 — Simple Indian Meals](https://simpleindianmeals.com/meal-planning-101/) — household planning patterns
- [Best Meal Planning Apps 2025 — Ollie](https://ollie.ai/2025/10/21/best-meal-planning-apps-in-2025/) — swap/lock UX pattern industry norms
- [AI Diet Planner App Development 2025 — AppInventiv](https://appinventiv.com/blog/ai-diet-planner-app-development/) — feature landscape overview
- [Mealie — self-hosted recipe manager](https://github.com/mealie-recipes/mealie) — CRUD food database design pattern reference

---

*Feature research for: Indian weekly meal planner (personal use)*
*Researched: 2026-03-19*
