# Graph Report - gid-garage  (2026-09-28)

## Corpus Check
- 247 files · ~1,197,359 words
- Verdict: corpus is large enough that graph structure adds value.
- Unclassified: 14 file(s) not represented in the graph (top: (none) 7, .toml 2, .example 1)

## Summary
- 2519 nodes · 4945 edges · 141 communities (116 shown, 25 thin omitted)
- Extraction: 96% EXTRACTED · 4% INFERRED · 0% AMBIGUOUS · INFERRED: 193 edges (avg confidence: 0.88)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `ed0af96c`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- App.tsx
- JobOps.tsx
- Game2048.tsx
- Realtime voice cutover (LiveKit/WebRTC)
- jarvis-context.js
- adminPost
- onRequestPost
- jarvis-proactive.js
- BookingWidget.tsx
- CommandCenterPage.tsx
- db
- onRequestPost
- createSeoStore
- tokens.ts
- resultRenderer.tsx
- package.json
- CustomersTab
- GIDJarvis
- app.py
- PrePIModal
- Blackjack
- types.ts
- patchJob
- seo-auth.test.js
- compilerOptions
- lead-capture.js
- adminPost
- AxleSchematic
- devDependencies
- AdminSchedule
- BookingWidget
- business-metrics.js
- compilerOptions
- agent.py
- dependencies
- JarvisCore.tsx
- PhotoPanel
- providers.js
- react
- apiPost
- Hardening Controls
- Code Review and Quality
- job-context.js
- JobDetailPanel.tsx
- onRequestPost
- JobDetailPanel
- manifest.json
- Test-Driven Development
- Context Engineering
- createBusinessOps
- GID Garage Branding (mobile mechanic, red/black/chrome)
- localOpportunityScore
- Git Workflow and Versioning
- jarvis-livekit-token.js
- scripts
- Shipping and Launch
- sync.js
- local-intent.js
- .email_appointment_update
- API and Interface Design
- vehicleData.ts
- jarvis-intent.js
- seo-intelligence.test.js
- Brake Service
- business-rules.js
- google-reviews.js
- EstimatePanel
- SeoPanels.tsx
- Suspension / Shocks & Struts Service
- vite
- tsconfig.json
- graphify knowledge graph (graphify-out/)
- lead-capture.js public lead webhook
- Browser Testing with DevTools
- Engine Air Filter Before/After (new vs dirty filter over Toyota hybrid engine bay)
- Car Audio Installation
- Bolt.new project origin
- Frontend UI Engineering
- Performance Optimization
- CI/CD and Automation
- Constraint-Driven Development
- Deprecation and Migration
- Incremental Implementation
- Debugging and Error Recovery
- Documentation and ADRs
- ops.js
- Interview Me
- Planning and Task Breakdown
- ReOrder: Keep Your Regulars Ordering Direct
- Code Simplification
- Doubt-Driven Development
- Process
- Idea Refine
- Using Agent Skills
- Spec-Driven Development
- Source-Driven Development
- Refinement & Evaluation Criteria
- Trivia.tsx
- GamesPage.tsx
- .list_jobs
- .list_calls
- GIDData
- Ideation Frameworks Reference
- SlotMachine.tsx
- Snake.tsx
- AdminPhotoPanel
- Memory.tsx
- business-metrics.d.ts
- idea-refine.sh
- .gid_business
- BUSINESS_TZ
- kpis.js
- detectors.js
- SEO / Growth Mode — Setup
- link-notes.mjs
- admin-ai-chat.js
- gid_jarvis
- onRequestPost
- jarvis-telegram.js
- note-links.test.js
- InspectionPanel
- access-routes.test.js
- taxRatePercentLabel
- business-threads.test.js
- ref_node_assert
- access-auth.js
- LeadPipeline.tsx

## God Nodes (most connected - your core abstractions)
1. `createBusinessOps()` - 61 edges
2. `createSeoOps()` - 55 edges
3. `adminPost()` - 52 edges
4. `onRequestPost()` - 51 edges
5. `JobDetailPanel()` - 36 edges
6. `react` - 35 edges
7. `App()` - 34 edges
8. `GIDJarvis` - 33 edges
9. `AdminSchedule()` - 27 edges
10. `patchJob()` - 27 edges

## Surprising Connections (you probably didn't know these)
- `Summary table` --references--> `jobRevenue()`  [INFERRED]
  JARVIS_CONSISTENCY_AUDIT.md → functions/admin-api-data.js
- `How it fits together` --references--> `isInsideServiceArea()`  [INFERRED]
  SEO_SETUP.md → shared/seo/service-area.js
- `6. Write-safety invariants (audited and tested)` --references--> `cleanSearchText()`  [INFERRED]
  JARVIS_DATA_COVERAGE_AUDIT.md → functions/_lib/business-data.js
- `Third pass (2026-09-27): Telegram production bugs` --references--> `findPeople()`  [INFERRED]
  JARVIS_CONSISTENCY_AUDIT.md → functions/_lib/business-data.js
- `Third pass (2026-09-27): Telegram production bugs` --references--> `planTurn()`  [INFERRED]
  JARVIS_CONSISTENCY_AUDIT.md → functions/_lib/jarvis-context.js

## Import Cycles
- None detected.

## Hyperedges (group relationships)
- **Realtime LiveKit voice flow** — livekit_jarvis_setup_jarvis_livekit_token, livekit_jarvis_setup_uselivekitjarvis, livekit_jarvis_setup_realtimevoicecontrol, livekit_jarvis_setup_agent_py, livekit_jarvis_setup_livekit_cloud [EXTRACTED 1.00]
- **Tool result card rendering** — codebase_admin_ai_chat, codebase_presentable_tools, codebase_resultrenderer_registry [EXTRACTED 1.00]
- **Brake Work Photos** — public_photo_brakes_image, public_rotor_before_image, public_rotor_after_image [INFERRED 0.85]
- **Legacy multi-hop voice stack** — all_in_one_changes_removed_multihop_voice, setup_jarvis_talkback, voice_service_render_gid_jarvis_voice, voice_service_requirements_piper_tts [INFERRED 0.85]
- **GID Garage Logo Asset Set** — public_website_logo_image, public_apple_touch_icon_image, public_favicon_192_image, public_banner_image [INFERRED 0.95]

## Communities (141 total, 25 thin omitted)

### Community 0 - "App.tsx"
Cohesion: 0.05
Nodes (56): AdminSchedule, AnimatedWords(), apiPost(), App(), openBooking(), BeforeAfterSlider(), BookingSection(), BookingWidget (+48 more)

### Community 1 - "JobOps.tsx"
Cohesion: 0.03
Nodes (76): ADD_JOB_SERVICES, apiPost(), AUDIO_LABELS, AxleConfig, BRAKE_LABELS, calcTax(), CUSTOMER_ACCENTS, CustomerAgg (+68 more)

### Community 2 - "Game2048.tsx"
Cohesion: 0.25
Nodes (10): addRandomTile(), canMove(), emptyGrid(), Game2048(), reset(), Grid, move(), rotateCW() (+2 more)

### Community 3 - "Realtime voice cutover (LiveKit/WebRTC)"
Cohesion: 0.06
Nodes (42): LiveKit JARVIS All-in-One Build, Removed multi-hop voice chain (MediaRecorder, /jarvis-transcribe, /jarvis-speak, Piper/Railway), admin-ai-chat.js Ask GID Claude agent (NDJSON streaming), admin-api-data.js action-router CRUD API, api-customer.js public booking/quote API, App.tsx pathname router, Command Center build phases 1-6, Cf-Access-Jwt-Assertion auth gate (+34 more)

### Community 4 - "jarvis-context.js"
Cohesion: 0.12
Nodes (25): cap(), CLAIM_PATTERNS, claimsWriteSuccess(), detectFacet(), extractJobId(), FACET_JOB_FIELDS, FACET_VEHICLE_FIELDS, facetInstruction() (+17 more)

### Community 5 - "adminPost"
Cohesion: 0.07
Nodes (49): adminPost(), BackupBookingInspector(), run(), BusinessHub(), resetAllNotes(), csvCell(), EquityTracker(), addEntry() (+41 more)

### Community 6 - "onRequestPost"
Cohesion: 0.10
Nodes (26): json(), namesLikelyMatch(), onRequestPost(), fetchCurrentTaxRate(), jobRevenue(), onRequestPost(), handle(), onRequestGet() (+18 more)

### Community 7 - "jarvis-proactive.js"
Cohesion: 0.16
Nodes (35): addDate(), cleanTime(), configuredHour(), deliverDueReminders(), formatEveningPreview(), formatLeadAlert(), formatMorningBrief(), formatUnpaidAlert() (+27 more)

### Community 8 - "BookingWidget.tsx"
Cohesion: 0.07
Nodes (30): verify(), AUDIO_LABELS, BlackoutDate, Booking, BRAKE_LABELS, CardStepProps, DAY_LABELS, FormData (+22 more)

### Community 9 - "CommandCenterPage.tsx"
Cohesion: 0.10
Nodes (22): livekit-client, lucide-react, CommandCenterPage(), fadeRise, CommandPalette(), useCommandPalette(), LiveFeed(), timeAgo() (+14 more)

### Community 10 - "db"
Cohesion: 0.14
Nodes (13): db(), Get current tax, overhead, and Stripe fee settings., Log a marketing-spend entry., Log a phone call and its outcome., List recent marketing spend entries, optionally by channel., Update a job pipeline status. Never use this for PAID., List recent leads. Pass an empty string for status/source when no filter is…, Update a lead's status using its lead id. (+5 more)

### Community 11 - "onRequestPost"
Cohesion: 0.16
Nodes (29): ALLOWED_BETS, BET_PRIZE_TABLES, canSplitPair(), dealerPlay(), freshDeck(), genCode(), handTotal(), isBlackjack() (+21 more)

### Community 12 - "createSeoStore"
Cohesion: 0.17
Nodes (17): ACTIONS, json(), onRequestPost(), SEO_ACTIONS, safeEqual(), boundFetch(), workerFetch(), createSeoStore() (+9 more)

### Community 13 - "tokens.ts"
Cohesion: 0.13
Nodes (26): AttentionPanel(), CHECKLIST_LABELS, severityFor(), stableKey(), BusinessMetrics(), shortDate(), StatRow(), useCountUp() (+18 more)

### Community 14 - "resultRenderer.tsx"
Cohesion: 0.21
Nodes (15): BusinessSummaryCard(), CallCard(), CustomerCard(), GenericCard(), JobCard(), STATUS_COLOR, LeadCard(), MarketingCard() (+7 more)

### Community 15 - "package.json"
Cohesion: 0.09
Nodes (23): name, private, type, version, autoprefixer, eslint, @eslint/js, eslint-plugin-react-hooks (+15 more)

### Community 16 - "CustomersTab"
Cohesion: 0.16
Nodes (15): accentFor(), aggregateCustomers(), CustomerFileModal(), CustomersTab(), DuplicateCustomersModal(), defaultKeeper(), jobStatsFor(), loadCustomers() (+7 more)

### Community 17 - "GIDJarvis"
Cohesion: 0.16
Nodes (11): Agent, Any, GIDJarvis, Undo the most recent reversible Jarvis change., Deterministically intercept pasted lead forms before the LLM can improvise., Collect human-entered text from an arbitrary raw lead payload., Parse Meta lead text whether fields are separated by newlines or spaces., Analyze a pasted Meta/Facebook/Instagram lead form directly from the user's… (+3 more)

### Community 18 - "app.py"
Cohesion: 0.11
Nodes (20): BaseModel, fastapi, fastapi_responses, get, huggingface_hub, io, on_event, os (+12 more)

### Community 19 - "PrePIModal"
Cohesion: 0.13
Nodes (16): defaultPPIChecklist(), insertPPI(), listAllPPIs(), mapPPI(), patchPPI(), PrePIModal(), handleComplete(), handlePhotoFileChosen() (+8 more)

### Community 20 - "Blackjack"
Cohesion: 0.24
Nodes (19): apiGame(), BET_OPTIONS, Blackjack(), applyMidHand(), applyResolution(), deal(), digitsOf(), double() (+11 more)

### Community 21 - "types.ts"
Cohesion: 0.20
Nodes (12): ActivityFeed(), CommandInput(), Workspace(), toolLabel(), ActivityItem, ChatMsg, DataCard, GidUiEvent (+4 more)

### Community 22 - "patchJob"
Cohesion: 0.15
Nodes (28): adminPostIdempotent(), EmailQuickEdit(), save(), findOrCreateCustomerSafe(), saveAppt(), patchJob(), PaymentLinkBox(), handleRemove() (+20 more)

### Community 23 - "seo-auth.test.js"
Cohesion: 0.19
Nodes (10): handleSeoData(), isDate(), json(), onRequest(), slug(), b64url(), enc(), ENV (+2 more)

### Community 24 - "compilerOptions"
Cohesion: 0.11
Nodes (17): compilerOptions, allowImportingTsExtensions, isolatedModules, jsx, lib, module, moduleDetection, moduleResolution (+9 more)

### Community 25 - "lead-capture.js"
Cohesion: 0.27
Nodes (15): classifyService(), fetchMetaLead(), insertLead(), json(), looksLikeVehicle(), metaFieldMap(), normalize(), normalizedKey() (+7 more)

### Community 26 - "adminPost"
Cohesion: 0.15
Nodes (16): adminPost(), deleteBooking(), saveGarageNotes(), updateStatus(), BlackoutDatesModal(), addDate(), load(), removeDate() (+8 more)

### Community 27 - "AxleSchematic"
Cohesion: 0.29
Nodes (6): AxleSchematic(), classifyVehicle(), getShopAvg(), QuoteCalculator(), buildLineItems(), handleServiceChange()

### Community 28 - "devDependencies"
Cohesion: 0.12
Nodes (16): devDependencies, autoprefixer, eslint, @eslint/js, eslint-plugin-react-hooks, eslint-plugin-react-refresh, globals, postcss (+8 more)

### Community 29 - "AdminSchedule"
Cohesion: 0.12
Nodes (9): AdminPasswordGate(), AdminSchedule(), fmtConfirmWhen(), handleDropReschedule(), ordinal(), GarageNotesField(), getSlotsForDate(), getJobById() (+1 more)

### Community 30 - "BookingWidget"
Cohesion: 0.11
Nodes (14): BookingWidget(), isAvailable(), isAvailableSync(), parseSlotHour(), BrakePadSelector(), CardOnFileStep(), dateKey(), getBookedTimesForDate() (+6 more)

### Community 31 - "business-metrics.js"
Cohesion: 0.12
Nodes (32): comparePeriods(), ownerPaySummary(), revenueSummary(), patchVerified(), Canonical definitions, Jarvis Consistency Audit, Summary table, Third pass (2026-09-27): Telegram production bugs (+24 more)

### Community 32 - "compilerOptions"
Cohesion: 0.12
Nodes (15): compilerOptions, allowImportingTsExtensions, isolatedModules, lib, module, moduleDetection, moduleResolution, noEmit (+7 more)

### Community 33 - "agent.py"
Cohesion: 0.12
Nodes (15): asyncio, datetime, dotenv, html, httpx, money(), Look up historical GID Garage prices for a repair/service., # IMPORTANT: explicitly bind the AgentSession to the actual browser (+7 more)

### Community 34 - "dependencies"
Cohesion: 0.13
Nodes (15): dependencies, gsap, lenis, livekit-client, @livekit/protocol, livekit-server-sdk, lucide-react, maplibre-gl (+7 more)

### Community 35 - "JarvisCore.tsx"
Cohesion: 0.21
Nodes (13): @react-three/fiber, three, CoreSphere(), GlowSphere(), JarvisCore(), NetworkGlobe(), Ring(), Scene() (+5 more)

### Community 36 - "PhotoPanel"
Cohesion: 0.24
Nodes (13): PhotoPanel(), compressImage(), deletePhoto(), handleCapture(), persist(), saveNotes(), uploadBlob(), VideoPanel() (+5 more)

### Community 37 - "providers.js"
Cohesion: 0.08
Nodes (32): b64url(), b64urlJson(), googleApiError(), parseServiceAccount(), pemToDer(), ProviderError, refreshTokenAccess(), serviceAccountToken() (+24 more)

### Community 38 - "react"
Cohesion: 0.17
Nodes (11): react, MicDiagnostics(), valueColor(), encodeMonoWav(), HearingState, initialDiag(), MicDiagnostics, Options (+3 more)

### Community 39 - "apiPost"
Cohesion: 0.22
Nodes (13): apiPost(), handleAdvanceToCard(), handleCardSaved(), handleFinalSubmit(), handleOtherSubmit(), generateCancelToken(), getBlackoutDates(), insertSupabaseBooking() (+5 more)

### Community 40 - "Hardening Controls"
Cohesion: 0.05
Nodes (42): Broken Access Control, Broken Authentication, Cross-Site Scripting (XSS), Data Classification, Dependency Audit Triage, Destructive Operations on Derived Paths, File Upload Safety, Hardening Patterns (+34 more)

### Community 41 - "Code Review and Quality"
Cohesion: 0.07
Nodes (29): 1. Correctness, 2. Readability & Simplicity, 3. Architecture, 4. Security, 5. Performance, Change Descriptions, Change Sizing, Code Review and Quality (+21 more)

### Community 42 - "job-context.js"
Cohesion: 0.15
Nodes (32): customerContext(), digits(), 3. How deep retrieval works, isAwaitingPayment(), isCancelled(), jobMoney(), belongsToPerson(), BOOKING_NOTE_PREFIXES (+24 more)

### Community 43 - "JobDetailPanel.tsx"
Cohesion: 0.33
Nodes (8): adminPost(), FullJob, JobDetailPanel(), Row(), Section(), useBusinessSummary(), submitSpend(), updateLeadStatus()

### Community 44 - "onRequestPost"
Cohesion: 0.33
Nodes (7): json(), makeToken(), namesLikelyMatch(), onRequestPost(), fetchCurrentTaxRate(), findOrCreateCustomerId(), safeEqual()

### Community 45 - "JobDetailPanel"
Cohesion: 0.09
Nodes (23): apptTimeLabel(), CopyableField(), ExternalLeadModal(), handleSendEmail(), from12h(), JobDetailPanel(), handleUpdate(), onVinInput() (+15 more)

### Community 46 - "manifest.json"
Cohesion: 0.25
Nodes (7): background_color, description, display, icons, name, short_name, theme_color

### Community 47 - "Test-Driven Development"
Cohesion: 0.07
Nodes (29): Browser Testing with DevTools, Common Rationalizations, DAMP Over DRY in Tests, Decision Guide, Discover the Stack First, Name Tests Descriptively, One Assertion Per Concept, Overview (+21 more)

### Community 48 - "Context Engineering"
Cohesion: 0.07
Nodes (28): Anti-Patterns, Common Rationalizations, Compress before dropping, Confusion Management, Context Budget Management, Context Engineering, Context Packing Strategies, Level 1: Rules Files (+20 more)

### Community 49 - "createBusinessOps"
Cohesion: 0.17
Nodes (31): cleanSearchText(), CONTEXT_COLUMNS, createBusinessOps(), actionCenter(), attachPhotos(), businessSummary(), cancelJob(), findPeople() (+23 more)

### Community 50 - "GID Garage Branding (mobile mechanic, red/black/chrome)"
Cohesion: 0.38
Nodes (7): GID Garage Badge Logo (apple touch icon), Professional Car Care Banner (Arizona automotive repair, phone, gidgarage.com), GID Garage Branding (mobile mechanic, red/black/chrome), GID Garage Mobile Mechanic Wordmark Logo (car silhouette + wrench), GID Garage Badge Logo (192px favicon), Merch SVG (traced black 2172x711 vector logo artwork, likely GID Garage wordmark), GID Garage Badge Logo (full size, Trust Quality Performance)

### Community 51 - "localOpportunityScore"
Cohesion: 0.46
Nodes (7): clamp01(), conversionFactor(), INTENT_RELEVANCE, LOCALITY_WEIGHT, localOpportunityScore(), visibilityHeadroom(), volumeFactor()

### Community 52 - "Git Workflow and Versioning"
Cohesion: 0.07
Nodes (26): 1. Commit Early, Commit Often, 2. Atomic Commits, 3. Descriptive Messages, 4. Keep Concerns Separate, 5. Size Your Changes, Branch Naming, Branching Strategy, Change Summaries (+18 more)

### Community 53 - "jarvis-livekit-token.js"
Cohesion: 0.36
Nodes (7): apiHost(), handleGet(), handlePost(), json(), onRequestGet, onRequestPost, livekit-server-sdk

### Community 54 - "scripts"
Cohesion: 0.29
Nodes (7): scripts, build, dev, lint, preview, test, typecheck

### Community 55 - "Shipping and Launch"
Cohesion: 0.08
Nodes (25): Accessibility, Code Quality, Common Rationalizations, Documentation, Error Budget Release Gate, Error Reporting, Feature Flag Strategy, Infrastructure (+17 more)

### Community 56 - "sync.js"
Cohesion: 0.20
Nodes (13): subrequestBudget(), SubrequestBudgetExceeded, addDays(), eachDay(), PROVIDERS, ymd(), BATCH_COST, CADENCE_DAYS (+5 more)

### Community 57 - "local-intent.js"
Cohesion: 0.12
Nodes (28): CHAINS, classifyCompetitor(), host(), SEARCH_RESULT_DOMAINS, TIER_WEIGHT, BRAND_TERMS, cityLocality(), classifyQuery() (+20 more)

### Community 58 - ".email_appointment_update"
Cohesion: 0.40
Nodes (3): Prepare/send the standard appointment-updated email for a booking. Always…, Send a customer email. Call with confirmed=false first; only set true after…, send_brevo_email()

### Community 59 - "API and Interface Design"
Cohesion: 0.08
Nodes (24): 1. Contract First, 2. Consistent Error Semantics, 3. Validate at Boundaries, 4. Prefer Addition Over Modification, 5. Predictable Naming, 6. Honouring an Idempotency Key, API and Interface Design, Common Rationalizations (+16 more)

### Community 60 - "vehicleData.ts"
Cohesion: 0.40
Nodes (3): MAKES, MODEL_YEARS, ModelEntry

### Community 61 - "jarvis-intent.js"
Cohesion: 0.18
Nodes (16): extractExplicitSubjects(), BUSINESS_ENTITY, classifyFocusedIntent(), classifyWithContext(), CUSTOMER_HISTORY, focusedRoutingInstruction(), INTENT_TOOL_NAMES, isExplicitBusinessAction() (+8 more)

### Community 62 - "seo-intelligence.test.js"
Cohesion: 0.23
Nodes (13): aiAssistant(), DEFAULT_EVENT_TEMPLATES, firstColdSnap(), forecastColdSnap(), round1(), round2(), seasonalFindings(), statement() (+5 more)

### Community 63 - "Brake Service"
Cohesion: 0.67
Nodes (4): Brake Service, New Brake Rotor and Pads with Caliper, Rotor After (new rotor installed on truck hub), Rotor Before (worn rusty rotor, tools on floor)

### Community 64 - "business-rules.js"
Cohesion: 0.15
Nodes (20): dataHealth(), phoenixDateParts(), bookedValue(), CLOSED_LEAD_STATUSES, CONTACT_LEAD_STATUSES, dataHealthIssues(), fullName(), HEALTH (+12 more)

### Community 69 - "EstimatePanel"
Cohesion: 0.15
Nodes (10): EstimateSummary(), EstimatePanel(), saveEstimate(), sendEstimate(), sendEstimateEmail(), taxableAmount(), taxFromItems(), TaxSummary() (+2 more)

### Community 70 - "SeoPanels.tsx"
Cohesion: 0.07
Nodes (54): maplibre-gl, MAP_COLORS, MapFeature, mapFeatures(), MapStat, mapStats(), plural(), radiusBounds() (+46 more)

### Community 71 - "Suspension / Shocks & Struts Service"
Cohesion: 1.00
Nodes (3): Suspension / Shocks & Struts Service, MagneRide Replacement Strut (new Arnott coilover installed on truck front suspension), RAV4 New Front Strut Assembly Installed

### Community 83 - "Browser Testing with DevTools"
Cohesion: 0.08
Nodes (24): Accessibility Verification with DevTools, Available Tools, Browser Testing with DevTools, Clean Console Standard, Common Rationalizations, Console Analysis Patterns, Content Boundary Markers, For Network Issues (+16 more)

### Community 91 - "Frontend UI Engineering"
Cohesion: 0.08
Nodes (24): Accessibility (WCAG 2.1 AA), ARIA Labels, Avoid the AI Aesthetic, Color, Common Rationalizations, Component Architecture, Component Patterns, Design System Adherence (+16 more)

### Community 92 - "Performance Optimization"
Cohesion: 0.08
Nodes (24): Common Rationalizations, Connection Pool Exhaustion, Core Web Vitals Targets, Large Bundle Size, Log every attempt, including the reverted ones, Missing Caching (Backend), Missing Image Optimization (Frontend), N+1 Queries (Backend) (+16 more)

### Community 93 - "CI/CD and Automation"
Cohesion: 0.08
Nodes (23): Automation Beyond CI, Basic CI Pipeline, Build Cop Role, CI/CD and Automation, CI Optimization, Common Rationalizations, Dependabot / Renovate, Deployment Strategies (+15 more)

### Community 94 - "Constraint-Driven Development"
Cohesion: 0.08
Nodes (22): Adapting it, Contract, Floor guard: reference implementation, Reference (Node, ~stack-agnostic patterns), Common Rationalizations, Constraint-Driven Development, Escalation Path, Loading Constraints (+14 more)

### Community 95 - "Deprecation and Migration"
Cohesion: 0.08
Nodes (23): Adapter Pattern, Code Is a Liability, Common Rationalizations, Compulsory vs Advisory Deprecation, Core Principles, Database Schema Migrations (Expand/Contract), Deprecation and Migration, Deprecation Planning Starts at Design Time (+15 more)

### Community 96 - "Incremental Implementation"
Cohesion: 0.09
Nodes (22): Common Rationalizations, Contract-First Slicing, Implementation Rules, Increment Checklist, Incremental Implementation, Overview, Red Flags, Risk-First Slicing (+14 more)

### Community 97 - "Debugging and Error Recovery"
Cohesion: 0.09
Nodes (21): Build Failure Triage, Common Rationalizations, Debugging and Error Recovery, Error-Specific Patterns, Instrumentation Guidelines, Overview, Red Flags, Runtime Error Triage (+13 more)

### Community 98 - "Documentation and ADRs"
Cohesion: 0.09
Nodes (21): ADR Lifecycle, ADR Template, API Documentation, Architecture Decision Records (ADRs), Changelog Maintenance, Common Rationalizations, Document Known Gotchas, Documentation and ADRs (+13 more)

### Community 99 - "ops.js"
Cohesion: 0.11
Nodes (42): createSeoOps(), analysisContext(), analyze(), briefing(), businessInputs(), competitorsView(), connections(), customerGeography() (+34 more)

### Community 100 - "Interview Me"
Cohesion: 0.11
Nodes (18): Common Rationalizations, Example, Interaction with Other Skills, Interview Me, Loading Constraints, Output, Overview, Red Flags (+10 more)

### Community 101 - "Planning and Task Breakdown"
Cohesion: 0.11
Nodes (18): Common Rationalizations, Output Files, Overview, Parallelization Opportunities, Plan Document Template, Planning and Task Breakdown, Red Flags, See Also (+10 more)

### Community 102 - "ReOrder: Keep Your Regulars Ordering Direct"
Cohesion: 0.11
Nodes (17): Example 1: Vague Early-Stage Concept (Full 3-Phase Session), Example 2: Feature Idea Within an Existing Product (Codebase-Aware), Example 3: Process/Workflow Idea (Non-Product), Ideation Session Examples, Key Assumptions to Validate, MVP Scope, Not Doing (and Why), Open Questions (+9 more)

### Community 103 - "Code Simplification"
Cohesion: 0.10
Nodes (20): 1. Preserve Behavior Exactly, 2. Follow Project Conventions, 3. Prefer Clarity Over Cleverness, 4. Maintain Balance, 5. Scope to What Changed, Code Simplification, Common Rationalizations, Language-Specific Guidance (+12 more)

### Community 104 - "Doubt-Driven Development"
Cohesion: 0.12
Nodes (15): Common Rationalizations, Cross-model escalation, Doubt-Driven Development, Interaction with Other Skills, Loading Constraints, Overview, Red Flags, Step 1: CLAIM — Surface what stands (+7 more)

### Community 105 - "Process"
Cohesion: 0.12
Nodes (15): 1. Define "working" before instrumenting, 2. Pick the right signal for each question, 3. Structured logging, 4. Metrics, 5. Distributed tracing, 6. Alerting, 7. Verify the telemetry itself, Common Rationalizations (+7 more)

### Community 106 - "Idea Refine"
Cohesion: 0.13
Nodes (14): Anti-patterns to Avoid, Detailed Instructions, How It Works, Idea Refine, Output, Phase 1: Understand & Expand (Divergent), Phase 2: Evaluate & Converge, Phase 3: Sharpen & Ship (+6 more)

### Community 107 - "Using Agent Skills"
Cohesion: 0.13
Nodes (14): 1. Surface Assumptions, 2. Manage Confusion Actively, 3. Push Back When Warranted, 4. Enforce Simplicity, 5. Maintain Scope Discipline, 6. Verify, Don't Assume, Core Operating Behaviors, Failure Modes to Avoid (+6 more)

### Community 108 - "Spec-Driven Development"
Cohesion: 0.14
Nodes (13): Common Rationalizations, Keeping the Spec Alive, Overview, Phase 0: Scope Check, Phase 1: Specify, Phase 2: Plan, Phase 3: Tasks, Phase 4: Implement (+5 more)

### Community 109 - "Source-Driven Development"
Cohesion: 0.15
Nodes (12): Common Rationalizations, Overview, Red Flags, Retrieval Safety: Treat Fetched Content as Data, Source-Driven Development, Step 1: Detect Stack and Versions, Step 2: Fetch Official Documentation, Step 3: Implement Following Documented Patterns (+4 more)

### Community 110 - "Refinement & Evaluation Criteria"
Cohesion: 0.17
Nodes (11): 1. User Value, 2. Feasibility, 3. Differentiation, Assumption Audit, Core Evaluation Dimensions, Decision Framework, Might Be True (Nice to Have), Must Be True (Dealbreakers) (+3 more)

### Community 111 - "Trivia.tsx"
Cohesion: 0.20
Nodes (7): buildRound(), Difficulty, LEVELS, QUESTION_BANK, RawQ, shuffle(), Trivia()

### Community 112 - "GamesPage.tsx"
Cohesion: 0.27
Nodes (10): Blackjack, Game2048, GameId, GameLoader(), GAMES, GamesPage(), Memory, SlotMachine (+2 more)

### Community 113 - ".list_jobs"
Cohesion: 0.22
Nodes (8): Find a customer by name, phone, or VIN., List jobs/bookings. Pass empty strings for filters that are not needed. Use 15…, Still open, 2. Question → data → tool coverage, 4. How analysis stays tied to evidence, 5. Business threads / active context: decision, 7. Still not covered / known gaps, Jarvis Data Coverage Audit

### Community 114 - ".list_calls"
Cohesion: 0.40
Nodes (4): List recently logged calls., 1. Source-of-truth map (what actually exists), `bookings` (one row per job), Other tables

### Community 116 - "Ideation Frameworks Reference"
Cohesion: 0.22
Nodes (8): Analogous Inspiration, Constraint-Based Ideation, First Principles Thinking, How Might We (HMW), Ideation Frameworks Reference, Jobs to Be Done (JTBD), Pre-mortem, SCAMPER

### Community 117 - "SlotMachine.tsx"
Cohesion: 0.32
Nodes (7): apiGame(), BET_OPTIONS, SlotMachine(), handleJoin(), spin(), SpinResult, SYMBOLS

### Community 118 - "Snake.tsx"
Cohesion: 0.33
Nodes (3): Pt, randCell(), Snake()

### Community 119 - "AdminPhotoPanel"
Cohesion: 0.12
Nodes (17): AdminPhotoPanel(), compressPhoto(), deletePhoto(), handleUploadMany(), saveAllNotes(), savePhotosToDb(), DocViewerModal(), PartsCostPanel() (+9 more)

### Community 120 - "Memory.tsx"
Cohesion: 0.47
Nodes (4): ICONS, Memory(), reset(), shuffled()

### Community 121 - "business-metrics.d.ts"
Cohesion: 0.40
Nodes (4): MetricJob, MetricPayment, OwnerPaySettings, PeriodWindow

### Community 123 - ".gid_business"
Cohesion: 0.40
Nodes (4): function_tool, backend_business(), Use GID Garage business data/actions. action must be one of:…, Run one deterministic business operation on the website backend…

### Community 125 - "kpis.js"
Cohesion: 0.17
Nodes (13): computeOverview(), customerGeography(), DISCOVERY_SOURCES, discoveryFunnel(), GBP_ACTIONS, GBP_VISIBILITY, gbpSide(), gscSide() (+5 more)

### Community 126 - "detectors.js"
Cohesion: 0.10
Nodes (43): authority(), AI_SOURCES, authorityScore(), citationIssues(), contentGuard(), demandGaps(), digits(), host() (+35 more)

### Community 127 - "SEO / Growth Mode — Setup"
Cohesion: 0.08
Nodes (23): 0. One-time: auth, database + cron, apple — Apple Business Connect (research / manual), Auth (done: env vars set), bing — Bing Webmaster Tools (optional), business-profile — Google Business Profile Performance, competitors — website monitoring, Database + cron, Environment variables (+15 more)

### Community 128 - "link-notes.mjs"
Cohesion: 0.29
Nodes (4): apply, headers, linked, ops

### Community 129 - "admin-ai-chat.js"
Cohesion: 0.21
Nodes (16): analyzeLeadFields(), classifyLeadService(), flattenLeadPayload(), isPastedLeadForm(), issueQuality(), looksLikeVehicle(), ndjsonFinal(), normalizeLeadText() (+8 more)

### Community 130 - "gid_jarvis"
Cohesion: 0.50
Nodes (5): gid_jarvis(), _handle_speak_stream(), _speak_stream(), JobContext, rtc_session

### Community 131 - "onRequestPost"
Cohesion: 0.21
Nodes (19): json(), onRequestPost(), addPhoenixDays(), brevoSend(), execTool(), finish(), localDayBoundsIso(), money() (+11 more)

### Community 132 - "jarvis-telegram.js"
Cohesion: 0.32
Nodes (14): clearHistory(), contextKey(), extractFinalText(), json(), loadContext(), loadHistory(), normalizeId(), onRequestPost() (+6 more)

### Community 133 - "note-links.test.js"
Cohesion: 0.10
Nodes (33): applyUiEvent(), chat(), ENV, setup(), claudeText(), claudeTool(), fakeFetch(), fakeSupabase() (+25 more)

### Community 134 - "InspectionPanel"
Cohesion: 0.53
Nodes (6): InspectionPanel(), addCode(), markDirty(), removeCode(), save(), updateCode()

### Community 135 - "access-routes.test.js"
Cohesion: 0.22
Nodes (11): handleGet(), handlePost(), json(), onRequestGet, onRequestPost, _clearAccessCertCache(), accessToken(), b64url() (+3 more)

### Community 136 - "taxRatePercentLabel"
Cohesion: 0.20
Nodes (9): buildInvoicesPdf(), InvoiceExport(), printInvoices(), shareInvoicePreview(), JobsCSVExport(), shareCsv(), loadJsPDF(), shareOrDownloadFile() (+1 more)

### Community 137 - "business-threads.test.js"
Cohesion: 0.20
Nodes (9): chat(), ENV, NEWER_DONE, NEWER_WAITING, NOW, OLD, pgTimestamp(), postgresLike() (+1 more)

### Community 138 - "ref_node_assert"
Cohesion: 0.16
Nodes (15): SYNC_RUN_KEY, syncGate(), ref_node_assert, ref_node_test, gscLocality(), applyFilters(), cond(), fakeSeoStore() (+7 more)

### Community 139 - "access-auth.js"
Cohesion: 0.23
Nodes (13): handleGet(), handlePost(), json(), onRequestGet, onRequestPost, b64urlToBytes(), certCache, decodePart() (+5 more)

### Community 142 - "LeadPipeline.tsx"
Cohesion: 0.27
Nodes (8): motion, LeadDetailPanel(), Row(), Section(), LeadPipeline(), Lead, LEAD_STATUS_OPTIONS, fmtSource()

## Ambiguous Edges - Review These
- `GID Garage Mobile Mechanic Wordmark Logo (car silhouette + wrench)` → `Merch SVG (traced black 2172x711 vector logo artwork, likely GID Garage wordmark)`  [AMBIGUOUS]
  public/svg merch.svg · relation: semantically_similar_to

## Knowledge Gaps
- **892 isolated node(s):** `idea-refine.sh script`, `idea-refine.sh script`, `certCache`, `TABLES`, `CRITICAL_TABLES` (+887 more)
  These have ≤1 connection - possible missing edges or undocumented components. (Counts symbols only; 1140 node(s) total have ≤1 connection when file, concept and rationale nodes are included.)
- **25 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **What is the exact relationship between `GID Garage Mobile Mechanic Wordmark Logo (car silhouette + wrench)` and `Merch SVG (traced black 2172x711 vector logo artwork, likely GID Garage wordmark)`?**
  _Edge tagged AMBIGUOUS (relation: semantically_similar_to) - confidence is low._
- **Why does `react` connect `react` to `App.tsx`, `JobOps.tsx`, `Game2048.tsx`, `JarvisCore.tsx`, `SeoPanels.tsx`, `BookingWidget.tsx`, `CommandCenterPage.tsx`, `JobDetailPanel.tsx`, `tokens.ts`, `LeadPipeline.tsx`, `package.json`, `Trivia.tsx`, `GamesPage.tsx`, `Blackjack`, `types.ts`, `SlotMachine.tsx`, `Snake.tsx`, `Memory.tsx`?**
  _High betweenness centrality (0.151) - this node is a cross-community bridge._
- **Why does `isAwaitingPayment()` connect `job-context.js` to `business-rules.js`, `JobOps.tsx`, `.list_jobs`, `createBusinessOps`, `business-metrics.js`?**
  _High betweenness centrality (0.054) - this node is a cross-community bridge._
- **Why does `Still open` connect `.list_jobs` to `job-context.js`, `business-metrics.js`?**
  _High betweenness centrality (0.045) - this node is a cross-community bridge._
- **Are the 19 inferred relationships involving `createBusinessOps()` (e.g. with `actionCenter()` and `applyNoteLinks()`) actually correct?**
  _`createBusinessOps()` has 19 INFERRED edges - model-reasoned connections that need verification._
- **Are the 12 inferred relationships involving `createSeoOps()` (e.g. with `analyze()` and `authority()`) actually correct?**
  _`createSeoOps()` has 12 INFERRED edges - model-reasoned connections that need verification._
- **Are the 3 inferred relationships involving `onRequestPost()` (e.g. with `sbGet()` and `sbInsert()`) actually correct?**
  _`onRequestPost()` has 3 INFERRED edges - model-reasoned connections that need verification._