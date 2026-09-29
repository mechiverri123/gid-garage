# Graph Report - gid-garage  (2026-09-28)

## Corpus Check
- 248 files · ~1,223,810 words
- Verdict: corpus is large enough that graph structure adds value.
- Unclassified: 15 file(s) not represented in the graph (top: (none) 7, .toml 2, .css 2)

## Summary
- 2635 nodes · 5420 edges · 148 communities (123 shown, 25 thin omitted)
- Extraction: 96% EXTRACTED · 4% INFERRED · 0% AMBIGUOUS · INFERRED: 199 edges (avg confidence: 0.88)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `e27ad014`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- App.tsx
- JobOps.tsx
- Game2048.tsx
- Realtime voice cutover (LiveKit/WebRTC)
- jarvis-context.js
- adminPost
- reportError
- jarvis-proactive.js
- BookingWidget.tsx
- CommandCenterPage.tsx
- db
- onRequestPost
- admin-ai-chat.js
- react
- resultRenderer.tsx
- package.json
- JobsTab
- GIDJarvis
- app.py
- PrePIModal
- Blackjack
- primitives.tsx
- patchJob
- seo-auth.test.js
- compilerOptions
- lead-capture.js
- adminPost
- AxleSchematic
- devDependencies
- AdminSchedule
- BookingWidget
- jarvis-telegram.js
- compilerOptions
- agent.py
- dependencies
- JarvisCore.tsx
- PhotoPanel
- providers.js
- useJarvisListener.ts
- apiPost
- Hardening Controls
- Code Review and Quality
- jarvis-intent.js
- MarketingPanel.tsx
- onRequestPost
- JobDetailPanel
- manifest.json
- Test-Driven Development
- Context Engineering
- business-threads.test.js
- GID Garage Branding (mobile mechanic, red/black/chrome)
- demand.js
- Git Workflow and Versioning
- jarvis-livekit-token.js
- scripts
- Shipping and Launch
- sync.js
- local-intent.js
- .email_appointment_update
- API and Interface Design
- vehicleData.ts
- seo-data.js
- kpis.js
- Brake Service
- business-rules.js
- google-reviews.js
- seo-intelligence.test.js
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
- createSeoOps
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
- OwnerPayPanel
- detectors.js
- SEO / Growth Mode — Setup
- CardOnFileStep
- onRequestPost
- command-center-extras.js
- job-context.js
- business-metrics.js
- note-links.test.js
- InspectionPanel
- createBusinessOps
- EstimatePanel
- ServiceAreaMap.tsx
- BusinessSections.tsx
- access-auth.js
- createSeoStore
- ErrorBoundary.tsx
- Reveal
- PromptGenerator.tsx
- link-notes.mjs
- PhotoGallery
- GameRedeem.tsx
- CancelPage

## God Nodes (most connected - your core abstractions)
1. `createBusinessOps()` - 61 edges
2. `createSeoOps()` - 59 edges
3. `adminPost()` - 52 edges
4. `onRequestPost()` - 51 edges
5. `react` - 39 edges
6. `JobDetailPanel()` - 36 edges
7. `App()` - 34 edges
8. `CommandCenterPage()` - 34 edges
9. `GIDJarvis` - 33 edges
10. `CommandCard()` - 30 edges

## Surprising Connections (you probably didn't know these)
- `How it fits together` --references--> `isInsideServiceArea()`  [INFERRED]
  SEO_SETUP.md → shared/seo/service-area.js
- `6. Write-safety invariants (audited and tested)` --references--> `cleanSearchText()`  [INFERRED]
  JARVIS_DATA_COVERAGE_AUDIT.md → functions/_lib/business-data.js
- `Third pass (2026-09-27): Telegram production bugs` --references--> `patchVerified()`  [INFERRED]
  JARVIS_CONSISTENCY_AUDIT.md → functions/_lib/business-data.js
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

## Communities (148 total, 25 thin omitted)

### Community 0 - "App.tsx"
Cohesion: 0.13
Nodes (26): AdminSchedule, App(), openBooking(), BookingSection(), BookingWidget, ContactBar(), DEFAULT_FAQ_SCHEMA, EstimatePage (+18 more)

### Community 1 - "JobOps.tsx"
Cohesion: 0.03
Nodes (72): ADD_JOB_SERVICES, apiPost(), AUDIO_LABELS, AxleConfig, BRAKE_LABELS, calcTax(), CUSTOMER_ACCENTS, CustomerAgg (+64 more)

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
Cohesion: 0.08
Nodes (42): adminPost(), BackupBookingInspector(), run(), BusinessHub(), resetAllNotes(), csvCell(), EquityTracker(), addEntry() (+34 more)

### Community 6 - "reportError"
Cohesion: 0.17
Nodes (13): onRequestPost(), handle(), onRequestGet(), onRequestPost(), handle(), onRequestGet(), onRequestPost(), corsHeaders() (+5 more)

### Community 7 - "jarvis-proactive.js"
Cohesion: 0.16
Nodes (35): addDate(), cleanTime(), configuredHour(), deliverDueReminders(), formatEveningPreview(), formatLeadAlert(), formatMorningBrief(), formatUnpaidAlert() (+27 more)

### Community 8 - "BookingWidget.tsx"
Cohesion: 0.07
Nodes (30): verify(), AUDIO_LABELS, BlackoutDate, Booking, BRAKE_LABELS, CardStepProps, DAY_LABELS, FormData (+22 more)

### Community 9 - "CommandCenterPage.tsx"
Cohesion: 0.08
Nodes (37): lucide-react, CommandCenterPage(), DashboardSkeleton(), orbStateFor(), VOICE_LABEL, CommandPalette(), useCommandPalette(), RealtimeVoiceControl() (+29 more)

### Community 10 - "db"
Cohesion: 0.14
Nodes (13): db(), Undo the most recent reversible Jarvis change., Get current tax, overhead, and Stripe fee settings., Log a marketing-spend entry., Log a phone call and its outcome., Update a job pipeline status. Never use this for PAID., List recent leads. Pass an empty string for status/source when no filter is…, Update a lead's status using its lead id. (+5 more)

### Community 11 - "onRequestPost"
Cohesion: 0.16
Nodes (29): ALLOWED_BETS, BET_PRIZE_TABLES, canSplitPair(), dealerPlay(), freshDeck(), genCode(), handTotal(), isBlackjack() (+21 more)

### Community 12 - "admin-ai-chat.js"
Cohesion: 0.21
Nodes (16): analyzeLeadFields(), classifyLeadService(), flattenLeadPayload(), isPastedLeadForm(), issueQuality(), looksLikeVehicle(), ndjsonFinal(), normalizeLeadText() (+8 more)

### Community 13 - "react"
Cohesion: 0.08
Nodes (29): react, ActivityFeed(), CommandInput(), PaletteCommand, Workspace(), useAdminAI(), UiModeEvent, COLORS (+21 more)

### Community 14 - "resultRenderer.tsx"
Cohesion: 0.21
Nodes (15): BusinessSummaryCard(), CallCard(), CustomerCard(), GenericCard(), JobCard(), STATUS_COLOR, LeadCard(), MarketingCard() (+7 more)

### Community 15 - "package.json"
Cohesion: 0.09
Nodes (23): name, private, type, version, autoprefixer, eslint, @eslint/js, eslint-plugin-react-hooks (+15 more)

### Community 16 - "JobsTab"
Cohesion: 0.10
Nodes (25): accentFor(), aggregateCustomers(), CustomerFileModal(), CustomersTab(), DuplicateCustomersModal(), defaultKeeper(), jobStatsFor(), loadCustomers() (+17 more)

### Community 17 - "GIDJarvis"
Cohesion: 0.16
Nodes (11): Agent, Any, GIDJarvis, List recent marketing spend entries, optionally by channel., Deterministically intercept pasted lead forms before the LLM can improvise., Collect human-entered text from an arbitrary raw lead payload., Parse Meta lead text whether fields are separated by newlines or spaces., Analyze a pasted Meta/Facebook/Instagram lead form directly from the user's… (+3 more)

### Community 18 - "app.py"
Cohesion: 0.11
Nodes (20): BaseModel, fastapi, fastapi_responses, get, huggingface_hub, io, on_event, os (+12 more)

### Community 19 - "PrePIModal"
Cohesion: 0.14
Nodes (15): defaultPPIChecklist(), insertPPI(), listAllPPIs(), mapPPI(), patchPPI(), PrePIModal(), handleComplete(), handlePhotoFileChosen() (+7 more)

### Community 20 - "Blackjack"
Cohesion: 0.24
Nodes (19): apiGame(), BET_OPTIONS, Blackjack(), applyMidHand(), applyResolution(), deal(), digitsOf(), double() (+11 more)

### Community 21 - "primitives.tsx"
Cohesion: 0.10
Nodes (45): maplibre-gl, LeadPipeline(), QuickCommandTiles(), RecentActivity(), RevenueTrend(), StatPanel(), ThisMonth(), UpcomingJobsTable() (+37 more)

### Community 22 - "patchJob"
Cohesion: 0.11
Nodes (33): EmailQuickEdit(), save(), patchJob(), PaymentLinkBox(), handleRemove(), handleSave(), PaymentPanel(), applyPaymentsUpdate() (+25 more)

### Community 23 - "seo-auth.test.js"
Cohesion: 0.22
Nodes (9): safeEqual(), runSeoSync(), json(), onRequestPost(), b64url(), enc(), ENV, NOW (+1 more)

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
Cohesion: 0.13
Nodes (7): AdminPasswordGate(), AdminSchedule(), fmtConfirmWhen(), handleDropReschedule(), ordinal(), GarageNotesField(), getSlotsForDate()

### Community 30 - "BookingWidget"
Cohesion: 0.17
Nodes (9): BookingWidget(), isAvailable(), isAvailableSync(), parseSlotHour(), BrakePadSelector(), dateKey(), getBookedTimesForDate(), getPhoenixNow() (+1 more)

### Community 31 - "jarvis-telegram.js"
Cohesion: 0.32
Nodes (14): clearHistory(), contextKey(), extractFinalText(), json(), loadContext(), loadHistory(), normalizeId(), onRequestPost() (+6 more)

### Community 32 - "compilerOptions"
Cohesion: 0.12
Nodes (15): compilerOptions, allowImportingTsExtensions, isolatedModules, lib, module, moduleDetection, moduleResolution, noEmit (+7 more)

### Community 33 - "agent.py"
Cohesion: 0.11
Nodes (18): asyncio, datetime, dotenv, html, httpx, gid_jarvis(), _handle_speak_stream(), _speak_stream() (+10 more)

### Community 34 - "dependencies"
Cohesion: 0.13
Nodes (15): dependencies, gsap, lenis, livekit-client, @livekit/protocol, livekit-server-sdk, lucide-react, maplibre-gl (+7 more)

### Community 35 - "JarvisCore.tsx"
Cohesion: 0.24
Nodes (11): motion, @react-three/fiber, three, CoreSphere(), GlowSphere(), JarvisCore(), NetworkGlobe(), Ring() (+3 more)

### Community 36 - "PhotoPanel"
Cohesion: 0.24
Nodes (13): PhotoPanel(), compressImage(), deletePhoto(), handleCapture(), persist(), saveNotes(), uploadBlob(), VideoPanel() (+5 more)

### Community 37 - "providers.js"
Cohesion: 0.08
Nodes (35): b64url(), b64urlJson(), googleApiError(), parseServiceAccount(), pemToDer(), ProviderError, refreshTokenAccess(), serviceAccountToken() (+27 more)

### Community 38 - "useJarvisListener.ts"
Cohesion: 0.38
Nodes (6): encodeMonoWav(), HearingState, initialDiag(), MicDiagnostics, Options, useJarvisListener()

### Community 39 - "apiPost"
Cohesion: 0.22
Nodes (13): apiPost(), handleAdvanceToCard(), handleCardSaved(), handleFinalSubmit(), handleOtherSubmit(), generateCancelToken(), getBlackoutDates(), insertSupabaseBooking() (+5 more)

### Community 40 - "Hardening Controls"
Cohesion: 0.05
Nodes (42): Broken Access Control, Broken Authentication, Cross-Site Scripting (XSS), Data Classification, Dependency Audit Triage, Destructive Operations on Derived Paths, File Upload Safety, Hardening Patterns (+34 more)

### Community 41 - "Code Review and Quality"
Cohesion: 0.07
Nodes (29): 1. Correctness, 2. Readability & Simplicity, 3. Architecture, 4. Security, 5. Performance, Change Descriptions, Change Sizing, Code Review and Quality (+21 more)

### Community 42 - "jarvis-intent.js"
Cohesion: 0.18
Nodes (16): extractExplicitSubjects(), BUSINESS_ENTITY, classifyFocusedIntent(), classifyWithContext(), CUSTOMER_HISTORY, focusedRoutingInstruction(), INTENT_TOOL_NAMES, isExplicitBusinessAction() (+8 more)

### Community 43 - "MarketingPanel.tsx"
Cohesion: 0.14
Nodes (21): adminPost(), FullJob, JobDetailPanel(), Row(), Section(), LeadDetailPanel(), Row(), Section() (+13 more)

### Community 44 - "onRequestPost"
Cohesion: 0.33
Nodes (7): json(), makeToken(), namesLikelyMatch(), onRequestPost(), fetchCurrentTaxRate(), findOrCreateCustomerId(), safeEqual()

### Community 45 - "JobDetailPanel"
Cohesion: 0.09
Nodes (24): adminPostIdempotent(), apptTimeLabel(), CopyableField(), ExternalLeadModal(), handleSendEmail(), findOrCreateCustomerSafe(), from12h(), JobDetailPanel() (+16 more)

### Community 46 - "manifest.json"
Cohesion: 0.25
Nodes (7): background_color, description, display, icons, name, short_name, theme_color

### Community 47 - "Test-Driven Development"
Cohesion: 0.07
Nodes (29): Browser Testing with DevTools, Common Rationalizations, DAMP Over DRY in Tests, Decision Guide, Discover the Stack First, Name Tests Descriptively, One Assertion Per Concept, Overview (+21 more)

### Community 48 - "Context Engineering"
Cohesion: 0.07
Nodes (28): Anti-Patterns, Common Rationalizations, Compress before dropping, Confusion Management, Context Budget Management, Context Engineering, Context Packing Strategies, Level 1: Rules Files (+20 more)

### Community 49 - "business-threads.test.js"
Cohesion: 0.10
Nodes (18): chat(), ENV, NEWER_DONE, NEWER_WAITING, NOW, OLD, pgTimestamp(), postgresLike() (+10 more)

### Community 50 - "GID Garage Branding (mobile mechanic, red/black/chrome)"
Cohesion: 0.38
Nodes (7): GID Garage Badge Logo (apple touch icon), Professional Car Care Banner (Arizona automotive repair, phone, gidgarage.com), GID Garage Branding (mobile mechanic, red/black/chrome), GID Garage Mobile Mechanic Wordmark Logo (car silhouette + wrench), GID Garage Badge Logo (192px favicon), Merch SVG (traced black 2172x711 vector logo artwork, likely GID Garage wordmark), GID Garage Badge Logo (full size, Trust Quality Performance)

### Community 51 - "demand.js"
Cohesion: 0.16
Nodes (18): authority(), AI_SOURCES, authorityScore(), citationIssues(), demandGaps(), digits(), host(), KIND_VALUE (+10 more)

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
Cohesion: 0.13
Nodes (19): subrequestBudget(), SubrequestBudgetExceeded, workerFetch(), addDays(), eachDay(), PROVIDERS, ymd(), BATCH_COST (+11 more)

### Community 57 - "local-intent.js"
Cohesion: 0.11
Nodes (30): technical(), BRAND_TERMS, cityLocality(), classifyCache, classifyQueryUncached(), COMMERCIAL, firstPartyLocality(), has() (+22 more)

### Community 58 - ".email_appointment_update"
Cohesion: 0.40
Nodes (3): Prepare/send the standard appointment-updated email for a booking. Always…, Send a customer email. Call with confirmed=false first; only set true after…, send_brevo_email()

### Community 59 - "API and Interface Design"
Cohesion: 0.08
Nodes (24): 1. Contract First, 2. Consistent Error Semantics, 3. Validate at Boundaries, 4. Prefer Addition Over Modification, 5. Predictable Naming, 6. Honouring an Idempotency Key, API and Interface Design, Common Rationalizations (+16 more)

### Community 60 - "vehicleData.ts"
Cohesion: 0.40
Nodes (3): MAKES, MODEL_YEARS, ModelEntry

### Community 61 - "seo-data.js"
Cohesion: 0.21
Nodes (11): handleSeoData(), isDate(), json(), onRequest(), slug(), CHAINS, classifyCompetitor(), host() (+3 more)

### Community 62 - "kpis.js"
Cohesion: 0.09
Nodes (31): funnelInputs(), overview(), queries(), windows(), ref_node_assert, ref_node_test, annotateGsc(), computeOverview() (+23 more)

### Community 63 - "Brake Service"
Cohesion: 0.67
Nodes (4): Brake Service, New Brake Rotor and Pads with Caliper, Rotor After (new rotor installed on truck hub), Rotor Before (worn rusty rotor, tools on floor)

### Community 64 - "business-rules.js"
Cohesion: 0.16
Nodes (27): CONTEXT_COLUMNS, businessSummary(), dataHealth(), Mismatches fixed, addDays(), bookedValue(), buildActionQueue(), CLOSED_LEAD_STATUSES (+19 more)

### Community 69 - "seo-intelligence.test.js"
Cohesion: 0.23
Nodes (13): aiAssistant(), DEFAULT_EVENT_TEMPLATES, firstColdSnap(), forecastColdSnap(), round1(), round2(), seasonalFindings(), statement() (+5 more)

### Community 70 - "SeoPanels.tsx"
Cohesion: 0.08
Nodes (60): niceDate(), SeoMode(), AuthorityOpp, AuthorityPanel(), CHECK_ICON, Citation, Cluster, Comp (+52 more)

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

### Community 99 - "createSeoOps"
Cohesion: 0.11
Nodes (41): createSeoOps(), analysisContext(), analyze(), briefing(), businessInputs(), competitorsView(), customerGeography(), localDemand() (+33 more)

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
Cohesion: 0.18
Nodes (9): money(), Look up historical GID Garage prices for a repair/service., Find a customer by name, phone, or VIN., List jobs/bookings. Pass empty strings for filters that are not needed. Use 15…, Still open, 2. Question → data → tool coverage, 5. Business threads / active context: decision, 7. Still not covered / known gaps (+1 more)

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
Cohesion: 0.15
Nodes (13): AdminPhotoPanel(), compressPhoto(), deletePhoto(), handleUploadMany(), saveAllNotes(), savePhotosToDb(), DocViewerModal(), PartsCostPanel() (+5 more)

### Community 120 - "Memory.tsx"
Cohesion: 0.47
Nodes (4): ICONS, Memory(), reset(), shuffled()

### Community 121 - "business-metrics.d.ts"
Cohesion: 0.40
Nodes (4): MetricJob, MetricPayment, OwnerPaySettings, PeriodWindow

### Community 123 - ".gid_business"
Cohesion: 0.40
Nodes (4): function_tool, backend_business(), Use GID Garage business data/actions. action must be one of:…, Run one deterministic business operation on the website backend…

### Community 125 - "OwnerPayPanel"
Cohesion: 0.38
Nodes (6): nextBiweeklyDate(), OwnerPayPanel(), addOverheadItem(), logDraw(), persistSettings(), removeOverheadItem()

### Community 126 - "detectors.js"
Cohesion: 0.16
Nodes (29): applyPreferences(), businessEvidence(), detectAdsOutsideArea(), detectCitations(), detectColdSnap(), detectCompetitorChanges(), detectCtrOpportunities(), detectDemandGaps() (+21 more)

### Community 127 - "SEO / Growth Mode — Setup"
Cohesion: 0.08
Nodes (23): 0. One-time: auth, database + cron, apple — Apple Business Connect (research / manual), Auth (done: env vars set), bing — Bing Webmaster Tools (optional), business-profile — Google Business Profile Performance, competitors — website monitoring, Database + cron, Environment variables (+15 more)

### Community 128 - "CardOnFileStep"
Cohesion: 0.29
Nodes (5): CardOnFileStep(), loadStripe(), requiresDeposit(), ReturningCustomerBanner(), StepHeader()

### Community 129 - "onRequestPost"
Cohesion: 0.21
Nodes (19): json(), onRequestPost(), addPhoenixDays(), brevoSend(), execTool(), finish(), localDayBoundsIso(), money() (+11 more)

### Community 130 - "command-center-extras.js"
Cohesion: 0.15
Nodes (27): json(), namesLikelyMatch(), onRequestPost(), fetchCurrentTaxRate(), CRITICAL_TABLES, fetchAllRows(), inspectBackupBookings(), listBackups() (+19 more)

### Community 131 - "job-context.js"
Cohesion: 0.15
Nodes (31): customerContext(), digits(), 3. How deep retrieval works, isAwaitingPayment(), isCancelled(), jobMoney(), belongsToPerson(), BOOKING_NOTE_PREFIXES (+23 more)

### Community 132 - "business-metrics.js"
Cohesion: 0.13
Nodes (26): jobRevenue(), Canonical definitions, Jarvis Consistency Audit, Summary table, Third pass (2026-09-27): Telegram production bugs, BUSINESS_TZ, cardRevenue(), cents() (+18 more)

### Community 133 - "note-links.test.js"
Cohesion: 0.12
Nodes (26): 4. How analysis stays tied to evidence, applyUiEvent(), INITIAL_UI_MODE, UiModeState, chat(), ENV, claudeText(), claudeTool() (+18 more)

### Community 134 - "InspectionPanel"
Cohesion: 0.53
Nodes (6): InspectionPanel(), addCode(), markDirty(), removeCode(), save(), updateCode()

### Community 135 - "createBusinessOps"
Cohesion: 0.15
Nodes (29): cleanSearchText(), createBusinessOps(), actionCenter(), attachPhotos(), cancelJob(), comparePeriods(), findPeople(), jobDetail() (+21 more)

### Community 136 - "EstimatePanel"
Cohesion: 0.10
Nodes (16): buildInvoicesPdf(), EstimateSummary(), EstimatePanel(), saveEstimate(), sendEstimate(), InvoiceExport(), printInvoices(), shareInvoicePreview() (+8 more)

### Community 137 - "ServiceAreaMap.tsx"
Cohesion: 0.22
Nodes (16): MAP_COLORS, MapFeature, mapFeatures(), MapStat, mapStats(), plural(), radiusBounds(), radiusRing() (+8 more)

### Community 138 - "BusinessSections.tsx"
Cohesion: 0.18
Nodes (14): FEED, LeadsBySource(), prettySource(), QUICK_COMMANDS, QuickActionHero(), SOURCE_COLORS, SOURCES, AreaChart() (+6 more)

### Community 139 - "access-auth.js"
Cohesion: 0.12
Nodes (24): handleGet(), handlePost(), json(), onRequestGet, onRequestPost, handleGet(), handlePost(), json() (+16 more)

### Community 140 - "createSeoStore"
Cohesion: 0.22
Nodes (12): ACTIONS, json(), onRequestPost(), SEO_ACTIONS, boundFetch(), createSeoStore(), EXTERNAL(), fakePostgrest() (+4 more)

### Community 141 - "ErrorBoundary.tsx"
Cohesion: 0.20
Nodes (5): react-dom, ErrorBoundary, Props, State, src_index

### Community 142 - "Reveal"
Cohesion: 0.20
Nodes (11): AnimatedWords(), BeforeAfterSlider(), Hero(), img(), MissionStatement(), RealJobsStrip(), Reveal(), ServiceCard() (+3 more)

### Community 143 - "PromptGenerator.tsx"
Cohesion: 0.28
Nodes (6): PromptGenerator, buildPrompt(), Field(), PromptGenerator(), handleGenerate(), VehicleInfo

### Community 144 - "link-notes.mjs"
Cohesion: 0.29
Nodes (4): apply, headers, linked, ops

### Community 145 - "PhotoGallery"
Cohesion: 0.50
Nodes (3): PhotoGallery(), onTouchEnd(), prev()

### Community 146 - "GameRedeem.tsx"
Cohesion: 0.67
Nodes (3): apiGame(), GameRedeem(), lookup()

### Community 147 - "CancelPage"
Cohesion: 0.67
Nodes (3): apiPost(), CancelPage(), confirmCancel()

## Ambiguous Edges - Review These
- `GID Garage Mobile Mechanic Wordmark Logo (car silhouette + wrench)` → `Merch SVG (traced black 2172x711 vector logo artwork, likely GID Garage wordmark)`  [AMBIGUOUS]
  public/svg merch.svg · relation: semantically_similar_to

## Knowledge Gaps
- **922 isolated node(s):** `idea-refine.sh script`, `idea-refine.sh script`, `certCache`, `TABLES`, `CRITICAL_TABLES` (+917 more)
  These have ≤1 connection - possible missing edges or undocumented components. (Counts symbols only; 1169 node(s) total have ≤1 connection when file, concept and rationale nodes are included.)
- **25 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **What is the exact relationship between `GID Garage Mobile Mechanic Wordmark Logo (car silhouette + wrench)` and `Merch SVG (traced black 2172x711 vector logo artwork, likely GID Garage wordmark)`?**
  _Edge tagged AMBIGUOUS (relation: semantically_similar_to) - confidence is low._
- **Why does `react` connect `react` to `App.tsx`, `JobOps.tsx`, `Game2048.tsx`, `BookingWidget.tsx`, `CommandCenterPage.tsx`, `BusinessSections.tsx`, `ServiceAreaMap.tsx`, `ErrorBoundary.tsx`, `package.json`, `PromptGenerator.tsx`, `GameRedeem.tsx`, `Blackjack`, `primitives.tsx`, `JarvisCore.tsx`, `useJarvisListener.ts`, `MarketingPanel.tsx`, `SeoPanels.tsx`, `Trivia.tsx`, `GamesPage.tsx`, `SlotMachine.tsx`, `Snake.tsx`, `Memory.tsx`?**
  _High betweenness centrality (0.149) - this node is a cross-community bridge._
- **Why does `isAwaitingPayment()` connect `job-context.js` to `business-rules.js`, `JobOps.tsx`, `business-metrics.js`, `JobsTab`, `.list_jobs`?**
  _High betweenness centrality (0.039) - this node is a cross-community bridge._
- **Why does `resolvePeriodWindow()` connect `business-metrics.js` to `business-rules.js`, `JobOps.tsx`, `command-center-extras.js`, `createSeoOps`, `createBusinessOps`, `jarvis-proactive.js`, `JobsTab`, `OwnerPayPanel`?**
  _High betweenness centrality (0.033) - this node is a cross-community bridge._
- **Are the 19 inferred relationships involving `createBusinessOps()` (e.g. with `actionCenter()` and `applyNoteLinks()`) actually correct?**
  _`createBusinessOps()` has 19 INFERRED edges - model-reasoned connections that need verification._
- **Are the 14 inferred relationships involving `createSeoOps()` (e.g. with `analyze()` and `authority()`) actually correct?**
  _`createSeoOps()` has 14 INFERRED edges - model-reasoned connections that need verification._
- **Are the 3 inferred relationships involving `onRequestPost()` (e.g. with `sbGet()` and `sbInsert()`) actually correct?**
  _`onRequestPost()` has 3 INFERRED edges - model-reasoned connections that need verification._