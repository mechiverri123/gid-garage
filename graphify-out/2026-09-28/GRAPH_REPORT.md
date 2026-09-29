# Graph Report - gid-garage  (2026-09-28)

## Corpus Check
- 259 files · ~1,244,252 words
- Verdict: corpus is large enough that graph structure adds value.
- Unclassified: 16 file(s) not represented in the graph (top: (none) 7, .css 3, .toml 2)

## Summary
- 2813 nodes · 6031 edges · 151 communities (123 shown, 28 thin omitted)
- Extraction: 97% EXTRACTED · 3% INFERRED · 0% AMBIGUOUS · INFERRED: 205 edges (avg confidence: 0.88)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `9ed24cb4`
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
- RunContext
- onRequestPost
- jarvis-workspace.js
- resultRenderer.tsx
- types.ts
- package.json
- JobsTab
- GIDJarvis
- app.py
- PrePIModal
- Blackjack
- primitives.tsx
- patchJob
- BrowseViews.tsx
- compilerOptions
- lead-capture.js
- adminPost
- BusinessSections.tsx
- devDependencies
- AdminSchedule
- BookingWidget
- jarvis-workspace.d.ts
- compilerOptions
- agent.py
- dependencies
- JarvisCore.tsx
- gid_jarvis
- providers.js
- useJarvisListener.ts
- apiPost
- Hardening Controls
- Code Review and Quality
- kpis.js
- JobFocus.tsx
- onRequestPost
- JobDetailPanel
- manifest.json
- Test-Driven Development
- Context Engineering
- CALENDAR_MODES
- GID Garage Branding (mobile mechanic, red/black/chrome)
- INITIAL_WORKSPACE
- Git Workflow and Versioning
- JOB_TABS
- scripts
- Shipping and Launch
- demand.js
- local-intent.js
- .email_appointment_update
- API and Interface Design
- vehicleData.ts
- PhotoPanel
- ref_node_assert
- Brake Service
- business-rules.js
- google-reviews.js
- business-rules.d.ts
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
- Memory.tsx
- business-metrics.d.ts
- idea-refine.sh
- .gid_business
- BUSINESS_TZ
- OwnerPayPanel
- detectors.js
- SEO / Growth Mode — Setup
- admin-ai-chat.js
- jobFromRow
- job-context.js
- business-metrics.js
- business-threads.test.js
- AdminPhotoPanel
- createBusinessOps
- EstimatePanel
- ServiceAreaMap.tsx
- access-routes.test.js
- sync.js
- seo-intelligence.test.js
- seo-worker-fetch.test.js
- link-notes.mjs
- seo-auth.test.js
- access-auth.js
- jarvis-livekit-token.js
- deleteLocalBooking
- ErrorBoundary.tsx
- Reveal
- PromptGenerator.tsx
- PhotoGallery
- GameRedeem.tsx
- CancelPage

## God Nodes (most connected - your core abstractions)
1. `createBusinessOps()` - 72 edges
2. `createSeoOps()` - 59 edges
3. `adminPost()` - 53 edges
4. `onRequestPost()` - 52 edges
5. `react` - 45 edges
6. `CommandCenterPage()` - 41 edges
7. `JobDetailPanel()` - 38 edges
8. `patchJob()` - 35 edges
9. `GIDJarvis` - 34 edges
10. `App()` - 34 edges

## Surprising Connections (you probably didn't know these)
- `Summary table` --references--> `jobRevenue()`  [INFERRED]
  JARVIS_CONSISTENCY_AUDIT.md → functions/admin-api-data.js
- `How it fits together` --references--> `isInsideServiceArea()`  [INFERRED]
  SEO_SETUP.md → shared/seo/service-area.js
- `6. Write-safety invariants (audited and tested)` --references--> `cleanSearchText()`  [INFERRED]
  JARVIS_DATA_COVERAGE_AUDIT.md → functions/_lib/business-data.js
- `Third pass (2026-09-27): Telegram production bugs` --references--> `patchVerified()`  [INFERRED]
  JARVIS_CONSISTENCY_AUDIT.md → functions/_lib/business-data.js
- `Third pass (2026-09-27): Telegram production bugs` --references--> `findPeople()`  [INFERRED]
  JARVIS_CONSISTENCY_AUDIT.md → functions/_lib/business-data.js

## Import Cycles
- None detected.

## Hyperedges (group relationships)
- **Realtime LiveKit voice flow** — livekit_jarvis_setup_jarvis_livekit_token, livekit_jarvis_setup_uselivekitjarvis, livekit_jarvis_setup_realtimevoicecontrol, livekit_jarvis_setup_agent_py, livekit_jarvis_setup_livekit_cloud [EXTRACTED 1.00]
- **Tool result card rendering** — codebase_admin_ai_chat, codebase_presentable_tools, codebase_resultrenderer_registry [EXTRACTED 1.00]
- **Brake Work Photos** — public_photo_brakes_image, public_rotor_before_image, public_rotor_after_image [INFERRED 0.85]
- **Legacy multi-hop voice stack** — all_in_one_changes_removed_multihop_voice, setup_jarvis_talkback, voice_service_render_gid_jarvis_voice, voice_service_requirements_piper_tts [INFERRED 0.85]
- **GID Garage Logo Asset Set** — public_website_logo_image, public_apple_touch_icon_image, public_favicon_192_image, public_banner_image [INFERRED 0.95]

## Communities (151 total, 28 thin omitted)

### Community 0 - "App.tsx"
Cohesion: 0.13
Nodes (26): AdminSchedule, App(), openBooking(), BookingSection(), BookingWidget, ContactBar(), DEFAULT_FAQ_SCHEMA, EstimatePage (+18 more)

### Community 1 - "JobOps.tsx"
Cohesion: 0.03
Nodes (66): ADD_JOB_SERVICES, AUDIO_LABELS, AxleConfig, AxleSchematic(), BRAKE_LABELS, calcTax(), classifyVehicle(), CUSTOMER_ACCENTS (+58 more)

### Community 2 - "Game2048.tsx"
Cohesion: 0.25
Nodes (10): addRandomTile(), canMove(), emptyGrid(), Game2048(), reset(), Grid, move(), rotateCW() (+2 more)

### Community 3 - "Realtime voice cutover (LiveKit/WebRTC)"
Cohesion: 0.06
Nodes (42): LiveKit JARVIS All-in-One Build, Removed multi-hop voice chain (MediaRecorder, /jarvis-transcribe, /jarvis-speak, Piper/Railway), admin-ai-chat.js Ask GID Claude agent (NDJSON streaming), admin-api-data.js action-router CRUD API, api-customer.js public booking/quote API, App.tsx pathname router, Command Center build phases 1-6, Cf-Access-Jwt-Assertion auth gate (+34 more)

### Community 4 - "jarvis-context.js"
Cohesion: 0.07
Nodes (44): execTool(), finish(), send(), cap(), CLAIM_PATTERNS, claimsWriteSuccess(), detectFacet(), extractExplicitSubjects() (+36 more)

### Community 5 - "adminPost"
Cohesion: 0.09
Nodes (41): adminPost(), BackupBookingInspector(), run(), BusinessHub(), resetAllNotes(), EquityTracker(), addEntry(), load() (+33 more)

### Community 6 - "reportError"
Cohesion: 0.17
Nodes (13): onRequestPost(), handle(), onRequestGet(), onRequestPost(), handle(), onRequestGet(), onRequestPost(), corsHeaders() (+5 more)

### Community 7 - "jarvis-proactive.js"
Cohesion: 0.16
Nodes (35): addDate(), cleanTime(), configuredHour(), deliverDueReminders(), formatEveningPreview(), formatLeadAlert(), formatMorningBrief(), formatUnpaidAlert() (+27 more)

### Community 8 - "BookingWidget.tsx"
Cohesion: 0.07
Nodes (29): verify(), AUDIO_LABELS, BlackoutDate, Booking, BRAKE_LABELS, CardStepProps, DAY_LABELS, FormData (+21 more)

### Community 9 - "CommandCenterPage.tsx"
Cohesion: 0.07
Nodes (45): lucide-react, react, describeScreen(), isScreenFollowUp(), top(), ackFor(), CommandCenterPage(), DashboardSkeleton() (+37 more)

### Community 10 - "RunContext"
Cohesion: 0.13
Nodes (14): db(), Undo the most recent reversible Jarvis change., Get current tax, overhead, and Stripe fee settings., Log a marketing-spend entry., Log a phone call and its outcome., List recent marketing spend entries, optionally by channel., Update a job pipeline status. Never use this for PAID., List recent leads. Pass an empty string for status/source when no filter is… (+6 more)

### Community 11 - "onRequestPost"
Cohesion: 0.16
Nodes (29): ALLOWED_BETS, BET_PRIZE_TABLES, canSplitPair(), dealerPlay(), freshDeck(), genCode(), handTotal(), isBlackjack() (+21 more)

### Community 12 - "jarvis-workspace.js"
Cohesion: 0.06
Nodes (53): ACTIONS, json(), onRequestPost(), SEO_ACTIONS, runScreenTool(), SCREEN_TOOL_NAMES, BROWSERS, CALENDAR_MODES (+45 more)

### Community 13 - "resultRenderer.tsx"
Cohesion: 0.16
Nodes (20): BusinessSummaryCard(), CallCard(), CustomerCard(), GenericCard(), JobCard(), STATUS_COLOR, LeadCard(), MarketingCard() (+12 more)

### Community 14 - "types.ts"
Cohesion: 0.08
Nodes (34): ActivityFeed(), CommandInput(), PaletteCommand, Workspace(), jarvisInsights(), JarvisPanel(), Message(), SUGGESTED (+26 more)

### Community 15 - "package.json"
Cohesion: 0.09
Nodes (23): name, private, type, version, autoprefixer, eslint, @eslint/js, eslint-plugin-react-hooks (+15 more)

### Community 16 - "JobsTab"
Cohesion: 0.10
Nodes (27): accentFor(), aggregateCustomers(), CustomerFileModal(), CustomersTab(), DuplicateCustomersModal(), defaultKeeper(), jobStatsFor(), loadCustomers() (+19 more)

### Community 17 - "GIDJarvis"
Cohesion: 0.19
Nodes (10): Agent, Any, GIDJarvis, Deterministically intercept pasted lead forms before the LLM can improvise., Collect human-entered text from an arbitrary raw lead payload., Parse Meta lead text whether fields are separated by newlines or spaces., Analyze a pasted Meta/Facebook/Instagram lead form directly from the user's…, Return a concise owner summary plus a professional draft response for pasted… (+2 more)

### Community 18 - "app.py"
Cohesion: 0.11
Nodes (20): BaseModel, fastapi, fastapi_responses, get, huggingface_hub, io, on_event, os (+12 more)

### Community 19 - "PrePIModal"
Cohesion: 0.13
Nodes (16): defaultPPIChecklist(), getPPIPublic(), insertPPI(), listAllPPIs(), mapPPI(), patchPPI(), PrePIModal(), handleComplete() (+8 more)

### Community 20 - "Blackjack"
Cohesion: 0.24
Nodes (19): apiGame(), BET_OPTIONS, Blackjack(), applyMidHand(), applyResolution(), deal(), digitsOf(), double() (+11 more)

### Community 21 - "primitives.tsx"
Cohesion: 0.15
Nodes (26): googleMapsRouteUrl(), MILES(), RouteMap(), spread(), startMarker(), stopMarker(), TodayRoute(), ATTN (+18 more)

### Community 22 - "patchJob"
Cohesion: 0.11
Nodes (34): NotesTab(), save(), EmailQuickEdit(), save(), patchJob(), PaymentLinkBox(), handleRemove(), handleSave() (+26 more)

### Community 23 - "BrowseViews.tsx"
Cohesion: 0.08
Nodes (56): shared_jarvis_workspace_workspacestate, workspaceTop, JarvisWorkspace, ActionButton(), ErrorState(), clock(), CustomersView(), Dispatch (+48 more)

### Community 24 - "compilerOptions"
Cohesion: 0.11
Nodes (17): compilerOptions, allowImportingTsExtensions, isolatedModules, jsx, lib, module, moduleDetection, moduleResolution (+9 more)

### Community 25 - "lead-capture.js"
Cohesion: 0.27
Nodes (15): classifyService(), fetchMetaLead(), insertLead(), json(), looksLikeVehicle(), metaFieldMap(), normalize(), normalizedKey() (+7 more)

### Community 26 - "adminPost"
Cohesion: 0.20
Nodes (13): adminPost(), saveGarageNotes(), updateStatus(), BlackoutDatesModal(), addDate(), load(), removeDate(), getLocalBookings() (+5 more)

### Community 27 - "BusinessSections.tsx"
Cohesion: 0.08
Nodes (40): adminPost(), FEED, LeadsBySource(), NewLeadDialog(), save(), prettySource(), QUICK_COMMANDS, RevenueTrend() (+32 more)

### Community 28 - "devDependencies"
Cohesion: 0.12
Nodes (16): devDependencies, autoprefixer, eslint, @eslint/js, eslint-plugin-react-hooks, eslint-plugin-react-refresh, globals, postcss (+8 more)

### Community 29 - "AdminSchedule"
Cohesion: 0.13
Nodes (7): AdminPasswordGate(), AdminSchedule(), fmtConfirmWhen(), handleDropReschedule(), ordinal(), GarageNotesField(), getSlotsForDate()

### Community 30 - "BookingWidget"
Cohesion: 0.11
Nodes (15): BookingWidget(), isAvailable(), isAvailableSync(), parseSlotHour(), BrakePadSelector(), CardOnFileStep(), handleSaveCard(), dateKey() (+7 more)

### Community 31 - "jarvis-workspace.d.ts"
Cohesion: 0.29
Nodes (6): CalendarMode, JobMetaEntry, JobTab, WorkspaceAction, WorkspaceState, WorkspaceView

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
Cohesion: 0.24
Nodes (11): motion, @react-three/fiber, three, CoreSphere(), GlowSphere(), JarvisCore(), NetworkGlobe(), Ring() (+3 more)

### Community 36 - "gid_jarvis"
Cohesion: 0.50
Nodes (5): gid_jarvis(), _handle_speak_stream(), _speak_stream(), JobContext, rtc_session

### Community 37 - "providers.js"
Cohesion: 0.08
Nodes (32): b64url(), b64urlJson(), googleApiError(), parseServiceAccount(), pemToDer(), ProviderError, refreshTokenAccess(), serviceAccountToken() (+24 more)

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

### Community 42 - "kpis.js"
Cohesion: 0.18
Nodes (14): computeOverview(), customerGeography(), DISCOVERY_SOURCES, discoveryFunnel(), GBP_ACTIONS, GBP_VISIBILITY, gbpSide(), gscSide() (+6 more)

### Community 43 - "JobFocus.tsx"
Cohesion: 0.16
Nodes (28): statusChangeFields(), AdminEdit(), customerName(), EstimateTab(), InspectionTab(), JobFocus(), jobTotal(), money2() (+20 more)

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

### Community 50 - "GID Garage Branding (mobile mechanic, red/black/chrome)"
Cohesion: 0.38
Nodes (7): GID Garage Badge Logo (apple touch icon), Professional Car Care Banner (Arizona automotive repair, phone, gidgarage.com), GID Garage Branding (mobile mechanic, red/black/chrome), GID Garage Mobile Mechanic Wordmark Logo (car silhouette + wrench), GID Garage Badge Logo (192px favicon), Merch SVG (traced black 2172x711 vector logo artwork, likely GID Garage wordmark), GID Garage Badge Logo (full size, Trust Quality Performance)

### Community 52 - "Git Workflow and Versioning"
Cohesion: 0.07
Nodes (26): 1. Commit Early, Commit Often, 2. Atomic Commits, 3. Descriptive Messages, 4. Keep Concerns Separate, 5. Size Your Changes, Branch Naming, Branching Strategy, Change Summaries (+18 more)

### Community 54 - "scripts"
Cohesion: 0.29
Nodes (7): scripts, build, dev, lint, preview, test, typecheck

### Community 55 - "Shipping and Launch"
Cohesion: 0.08
Nodes (25): Accessibility, Code Quality, Common Rationalizations, Documentation, Error Budget Release Gate, Error Reporting, Feature Flag Strategy, Infrastructure (+17 more)

### Community 56 - "demand.js"
Cohesion: 0.16
Nodes (18): authority(), AI_SOURCES, aiAssistant(), AUTHORITY_STARTERS, authorityScore(), citationIssues(), digits(), host() (+10 more)

### Community 57 - "local-intent.js"
Cohesion: 0.08
Nodes (41): technical(), auditPage(), CHAINS, classifyCompetitor(), host(), parsePublicPage(), SEARCH_RESULT_DOMAINS, TIER_WEIGHT (+33 more)

### Community 58 - ".email_appointment_update"
Cohesion: 0.40
Nodes (3): Prepare/send the standard appointment-updated email for a booking. Always…, Send a customer email. Call with confirmed=false first; only set true after…, send_brevo_email()

### Community 59 - "API and Interface Design"
Cohesion: 0.08
Nodes (24): 1. Contract First, 2. Consistent Error Semantics, 3. Validate at Boundaries, 4. Prefer Addition Over Modification, 5. Predictable Naming, 6. Honouring an Idempotency Key, API and Interface Design, Common Rationalizations (+16 more)

### Community 60 - "vehicleData.ts"
Cohesion: 0.40
Nodes (3): MAKES, MODEL_YEARS, ModelEntry

### Community 61 - "PhotoPanel"
Cohesion: 0.24
Nodes (13): PhotoPanel(), compressImage(), deletePhoto(), handleCapture(), persist(), saveNotes(), uploadBlob(), VideoPanel() (+5 more)

### Community 62 - "ref_node_assert"
Cohesion: 0.15
Nodes (16): queries(), windows(), ref_node_assert, ref_node_test, annotateGsc(), classifyQuery(), gscLocality(), NOW (+8 more)

### Community 63 - "Brake Service"
Cohesion: 0.67
Nodes (4): Brake Service, New Brake Rotor and Pads with Caliper, Rotor After (new rotor installed on truck hub), Rotor Before (worn rusty rotor, tools on floor)

### Community 64 - "business-rules.js"
Cohesion: 0.14
Nodes (32): dataHealth(), Canonical definitions, Jarvis Consistency Audit, Mismatches fixed, Summary table, bookedValue(), buildActionQueue(), CLOSED_LEAD_STATUSES (+24 more)

### Community 69 - "business-rules.d.ts"
Cohesion: 0.50
Nodes (3): shared_business_metrics_metricjob, JobMoney, RuleJob

### Community 70 - "SeoPanels.tsx"
Cohesion: 0.08
Nodes (64): LeadPipeline(), MarketingPanel(), Row, RecentActivity(), UpcomingJobsTable(), AttentionCard(), niceDate(), SeoMode() (+56 more)

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
Cohesion: 0.12
Nodes (36): createSeoOps(), analysisContext(), analyze(), briefing(), businessInputs(), competitorsView(), connections(), customerGeography() (+28 more)

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

### Community 120 - "Memory.tsx"
Cohesion: 0.47
Nodes (4): ICONS, Memory(), reset(), shuffled()

### Community 121 - "business-metrics.d.ts"
Cohesion: 0.33
Nodes (5): DayRange, MetricJob, MetricPayment, OwnerPaySettings, PeriodWindow

### Community 123 - ".gid_business"
Cohesion: 0.33
Nodes (5): function_tool, backend_business(), Open a view on Michael's /jarvis screen. view is one of: show_jobs {"customer",…, Use GID Garage business data/actions. action must be one of:…, Run one deterministic business operation on the website backend…

### Community 125 - "OwnerPayPanel"
Cohesion: 0.38
Nodes (6): nextBiweeklyDate(), OwnerPayPanel(), addOverheadItem(), logDraw(), persistSettings(), removeOverheadItem()

### Community 126 - "detectors.js"
Cohesion: 0.14
Nodes (34): localDemand(), contentGuard(), demandGaps(), serviceClusters(), unconfirmedServiceDemand(), applyPreferences(), businessEvidence(), detectAdsOutsideArea() (+26 more)

### Community 127 - "SEO / Growth Mode — Setup"
Cohesion: 0.08
Nodes (23): 0. One-time: auth, database + cron, apple — Apple Business Connect (research / manual), Auth (done: env vars set), bing — Bing Webmaster Tools (optional), business-profile — Google Business Profile Performance, competitors — website monitoring, Database + cron, Environment variables (+15 more)

### Community 129 - "admin-ai-chat.js"
Cohesion: 0.12
Nodes (33): analyzeLeadFields(), classifyLeadService(), flattenLeadPayload(), isPastedLeadForm(), issueQuality(), json(), looksLikeVehicle(), ndjsonFinal() (+25 more)

### Community 130 - "jobFromRow"
Cohesion: 0.12
Nodes (39): json(), namesLikelyMatch(), onRequestPost(), fetchCurrentTaxRate(), jobRevenue(), CRITICAL_TABLES, fetchAllRows(), inspectBackupBookings() (+31 more)

### Community 131 - "job-context.js"
Cohesion: 0.17
Nodes (25): jobDetail(), 3. How deep retrieval works, BOOKING_NOTE_PREFIXES, bookingVin(), buildCustomerHistory(), byDateAsc(), CATEGORY_WORDS, cleanVin() (+17 more)

### Community 132 - "business-metrics.js"
Cohesion: 0.14
Nodes (29): revenueRange(), Third pass (2026-09-27): Telegram production bugs, addDaysYmd, BUSINESS_TZ, cardRevenue(), cents(), collectedByDay(), compareRevenuePeriods() (+21 more)

### Community 133 - "business-threads.test.js"
Cohesion: 0.06
Nodes (56): clearHistory(), contextKey(), extractFinalText(), json(), loadContext(), loadHistory(), normalizeId(), onRequestPost() (+48 more)

### Community 134 - "AdminPhotoPanel"
Cohesion: 0.10
Nodes (21): AdminPhotoPanel(), compressPhoto(), deletePhoto(), handleUploadMany(), saveAllNotes(), savePhotosToDb(), apiPost(), DocViewerModal() (+13 more)

### Community 135 - "createBusinessOps"
Cohesion: 0.18
Nodes (26): cleanSearchText(), CONTEXT_COLUMNS, createBusinessOps(), attachPhotos(), cancelJob(), customerContext(), findPeople(), jobsForView() (+18 more)

### Community 136 - "EstimatePanel"
Cohesion: 0.09
Nodes (18): buildInvoicesPdf(), csvCell(), EstimateSummary(), EstimatePanel(), saveEstimate(), sendEstimate(), InvoiceExport(), printInvoices() (+10 more)

### Community 137 - "ServiceAreaMap.tsx"
Cohesion: 0.15
Nodes (21): maplibre-gl, MAP_COLORS, MapFeature, mapFeatures(), MapStat, mapStats(), plural(), radiusBounds() (+13 more)

### Community 139 - "access-routes.test.js"
Cohesion: 0.22
Nodes (11): handleGet(), handlePost(), json(), onRequestGet, onRequestPost, _clearAccessCertCache(), accessToken(), b64url() (+3 more)

### Community 141 - "sync.js"
Cohesion: 0.21
Nodes (13): boundFetch(), subrequestBudget(), SubrequestBudgetExceeded, addDays(), eachDay(), ymd(), BATCH_COST, CADENCE_DAYS (+5 more)

### Community 142 - "seo-intelligence.test.js"
Cohesion: 0.23
Nodes (14): seasonality(), DEFAULT_EVENT_TEMPLATES, eventsForYear(), firstColdSnap(), forecastColdSnap(), round1(), round2(), seasonalFindings() (+6 more)

### Community 143 - "seo-worker-fetch.test.js"
Cohesion: 0.18
Nodes (16): safeEqual(), createSeoStore(), runSeoSync(), SYNC_RUN_KEY, syncGate(), json(), onRequestPost(), EXTERNAL() (+8 more)

### Community 144 - "link-notes.mjs"
Cohesion: 0.29
Nodes (4): apply, headers, linked, ops

### Community 146 - "seo-auth.test.js"
Cohesion: 0.19
Nodes (10): handleSeoData(), isDate(), json(), onRequest(), slug(), b64url(), enc(), ENV (+2 more)

### Community 147 - "access-auth.js"
Cohesion: 0.23
Nodes (13): handleGet(), handlePost(), json(), onRequestGet, onRequestPost, b64urlToBytes(), certCache, decodePart() (+5 more)

### Community 148 - "jarvis-livekit-token.js"
Cohesion: 0.36
Nodes (7): apiHost(), handleGet(), handlePost(), json(), onRequestGet, onRequestPost, livekit-server-sdk

### Community 149 - "deleteLocalBooking"
Cohesion: 0.67
Nodes (3): deleteBooking(), deleteLocalBooking(), deleteSupabaseBooking()

### Community 154 - "ErrorBoundary.tsx"
Cohesion: 0.20
Nodes (5): react-dom, ErrorBoundary, Props, State, src_index

### Community 155 - "Reveal"
Cohesion: 0.20
Nodes (11): AnimatedWords(), BeforeAfterSlider(), Hero(), img(), MissionStatement(), RealJobsStrip(), Reveal(), ServiceCard() (+3 more)

### Community 156 - "PromptGenerator.tsx"
Cohesion: 0.28
Nodes (6): PromptGenerator, buildPrompt(), Field(), PromptGenerator(), handleGenerate(), VehicleInfo

### Community 157 - "PhotoGallery"
Cohesion: 0.50
Nodes (3): PhotoGallery(), onTouchEnd(), prev()

### Community 158 - "GameRedeem.tsx"
Cohesion: 0.67
Nodes (3): apiGame(), GameRedeem(), lookup()

### Community 159 - "CancelPage"
Cohesion: 0.67
Nodes (3): apiPost(), CancelPage(), confirmCancel()

## Ambiguous Edges - Review These
- `GID Garage Mobile Mechanic Wordmark Logo (car silhouette + wrench)` → `Merch SVG (traced black 2172x711 vector logo artwork, likely GID Garage wordmark)`  [AMBIGUOUS]
  public/svg merch.svg · relation: semantically_similar_to

## Knowledge Gaps
- **978 isolated node(s):** `idea-refine.sh script`, `idea-refine.sh script`, `certCache`, `TABLES`, `CRITICAL_TABLES` (+973 more)
  These have ≤1 connection - possible missing edges or undocumented components. (Counts symbols only; 1227 node(s) total have ≤1 connection when file, concept and rationale nodes are included.)
- **28 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **What is the exact relationship between `GID Garage Mobile Mechanic Wordmark Logo (car silhouette + wrench)` and `Merch SVG (traced black 2172x711 vector logo artwork, likely GID Garage wordmark)`?**
  _Edge tagged AMBIGUOUS (relation: semantically_similar_to) - confidence is low._
- **Why does `react` connect `CommandCenterPage.tsx` to `App.tsx`, `JobOps.tsx`, `Game2048.tsx`, `BookingWidget.tsx`, `ServiceAreaMap.tsx`, `types.ts`, `package.json`, `Blackjack`, `primitives.tsx`, `BrowseViews.tsx`, `ErrorBoundary.tsx`, `BusinessSections.tsx`, `PromptGenerator.tsx`, `GameRedeem.tsx`, `JarvisCore.tsx`, `useJarvisListener.ts`, `JobFocus.tsx`, `SeoPanels.tsx`, `Trivia.tsx`, `GamesPage.tsx`, `SlotMachine.tsx`, `Snake.tsx`, `Memory.tsx`?**
  _High betweenness centrality (0.095) - this node is a cross-community bridge._
- **Why does `isInsideServiceArea()` connect `local-intent.js` to `admin-ai-chat.js`, `providers.js`, `kpis.js`, `jarvis-workspace.js`, `seo-auth.test.js`, `detectors.js`, `SEO / Growth Mode — Setup`?**
  _High betweenness centrality (0.024) - this node is a cross-community bridge._
- **Why does `createSeoOps()` connect `createSeoOps` to `admin-ai-chat.js`, `jarvis-proactive.js`, `kpis.js`, `jarvis-workspace.js`, `sync.js`, `seo-intelligence.test.js`, `seo-auth.test.js`, `demand.js`, `ref_node_assert`, `detectors.js`, `local-intent.js`?**
  _High betweenness centrality (0.020) - this node is a cross-community bridge._
- **Are the 21 inferred relationships involving `createBusinessOps()` (e.g. with `actionCenter()` and `applyNoteLinks()`) actually correct?**
  _`createBusinessOps()` has 21 INFERRED edges - model-reasoned connections that need verification._
- **Are the 14 inferred relationships involving `createSeoOps()` (e.g. with `analyze()` and `authority()`) actually correct?**
  _`createSeoOps()` has 14 INFERRED edges - model-reasoned connections that need verification._
- **Are the 3 inferred relationships involving `onRequestPost()` (e.g. with `sbGet()` and `sbInsert()`) actually correct?**
  _`onRequestPost()` has 3 INFERRED edges - model-reasoned connections that need verification._