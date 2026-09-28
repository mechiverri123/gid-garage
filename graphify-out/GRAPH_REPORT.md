# Graph Report - gid-garage  (2026-09-27)

## Corpus Check
- Large corpus: 138 files · ~996,271 words. Semantic extraction will be expensive (many Claude tokens). Consider running on a subfolder.

## Summary
- 1270 nodes · 2509 edges · 91 communities (64 shown, 27 thin omitted)
- Extraction: 97% EXTRACTED · 3% INFERRED · 0% AMBIGUOUS · INFERRED: 78 edges (avg confidence: 0.86)
- Token cost: 150,524 input · 0 output

## Community Hubs (Navigation)
- App Shell & Routing
- JobOps Core Types
- Arcade Games
- Architecture Docs & Voice Plan
- Ask GID AI Chat
- Business Hub Admin
- Admin Data API
- Jarvis Proactive Reminders
- Booking Data Model
- Command Center Page
- Jarvis Agent Tools
- Blackjack Game API
- External Leads & VIN
- Lead Pipeline UI
- Result Cards
- Lint & Package Meta
- Customers Tab
- Jarvis Lead Analysis
- Voice Service (FastAPI)
- Pre-Purchase Inspection
- Blackjack UI
- Command Workspace
- Payments Panel
- HUD Briefing Panels
- TS App Config
- Lead Capture Webhook
- Booking Admin Actions
- Estimates
- Dev Dependencies
- Admin Schedule Calendar
- Booking Widget Calendar
- Invoices & Exports
- TS Node Config
- Agent Python Deps
- Runtime Dependencies
- Jarvis 3D Core
- Job Photo Panel
- Agent Data Layer
- Voice Control & Mic
- Booking Submit Flow
- Job Save & Idempotency
- Public Estimate Page
- Parts Cost & Receipts
- Command Center API
- Customer Public API
- Owner Pay & Profit
- PWA Manifest
- Attention Panel
- Quote Calculator
- Jarvis News Feed
- Branding Assets
- Card On File (Stripe)
- Admin Photo Upload
- LiveKit Token
- NPM Scripts
- Email & Review Toggles
- Inspection Codes
- Agent Entrypoint & TTS
- Customer Email Tool
- Admin Password Gate
- Vehicle Data
- Jarvis Speak (legacy)
- Jarvis Transcribe (legacy)
- Brake Service Photos
- Jarvis Speech Hook
- Google Reviews
- Business Summary Tool
- Revenue Summary Tool
- Suspension Photos
- Vite Config
- TS Root Config
- graphify Rules
- External Lead Webhook Docs
- Job Status Tool
- Maintenance Photo
- Car Audio Photo
- Project Origin

## God Nodes (most connected - your core abstractions)
1. `adminPost()` - 52 edges
2. `GIDJarvis` - 37 edges
3. `JobDetailPanel()` - 36 edges
4. `App()` - 34 edges
5. `react` - 33 edges
6. `AdminSchedule()` - 27 edges
7. `patchJob()` - 27 edges
8. `db()` - 25 edges
9. `BookingWidget()` - 25 edges
10. `onRequestPost()` - 24 edges

## Surprising Connections (you probably didn't know these)
- `JARVIS Talkback (OpenAI gpt-4o-mini-tts, /jarvis-speak)` --semantically_similar_to--> `Removed multi-hop voice chain (MediaRecorder, /jarvis-transcribe, /jarvis-speak, Piper/Railway)`  [INFERRED] [semantically similar]
  SETUP.txt → ALL_IN_ONE_CHANGES.txt
- `src/CommandCenter.tsx (original Command tab)` --semantically_similar_to--> `command-center/ Command Center module`  [INFERRED] [semantically similar]
  MANUAL_STEPS.md → CODEBASE.md
- `Legacy local desktop Jarvis (Ollama/Whisper/Piper) - inactive` --semantically_similar_to--> `gid-jarvis-voice Render service (Piper jarvis-medium model)`  [INFERRED] [semantically similar]
  CODEBASE.md → voice-service/render.yaml
- `useJarvisListener hook integration` --semantically_similar_to--> `useLiveKitJarvis hook`  [INFERRED] [semantically similar]
  src/command-center/MIC-INTEGRATION.txt → LIVEKIT_JARVIS_SETUP.md
- `Ask GID read-only (keyword matcher era)` --semantically_similar_to--> `Two-turn confirmation for payment/email actions`  [INFERRED] [semantically similar]
  MANUAL_STEPS.md → LIVEKIT_JARVIS_SETUP.md

## Import Cycles
- None detected.

## Hyperedges (group relationships)
- **Realtime LiveKit voice flow** — livekit_jarvis_setup_jarvis_livekit_token, livekit_jarvis_setup_uselivekitjarvis, livekit_jarvis_setup_realtimevoicecontrol, livekit_jarvis_setup_agent_py, livekit_jarvis_setup_livekit_cloud [EXTRACTED 1.00]
- **Tool result card rendering** — codebase_admin_ai_chat, codebase_presentable_tools, codebase_resultrenderer_registry [EXTRACTED 1.00]
- **Legacy multi-hop voice stack** — all_in_one_changes_removed_multihop_voice, setup_jarvis_talkback, voice_service_render_gid_jarvis_voice, voice_service_requirements_piper_tts [INFERRED 0.85]
- **GID Garage Logo Asset Set** — public_website_logo_image, public_apple_touch_icon_image, public_favicon_192_image, public_banner_image [INFERRED 0.95]
- **Brake Work Photos** — public_photo_brakes_image, public_rotor_before_image, public_rotor_after_image [INFERRED 0.85]

## Communities (91 total, 27 thin omitted)

### Community 0 - "App Shell & Routing"
Cohesion: 0.05
Nodes (57): react-dom, AdminSchedule, AnimatedWords(), apiPost(), App(), openBooking(), BeforeAfterSlider(), BookingSection() (+49 more)

### Community 1 - "JobOps Core Types"
Cohesion: 0.04
Nodes (61): ADD_JOB_SERVICES, AUDIO_LABELS, AxleConfig, BRAKE_LABELS, calcTax(), CUSTOMER_ACCENTS, CustomerAgg, CustomerRow (+53 more)

### Community 2 - "Arcade Games"
Cohesion: 0.05
Nodes (41): addRandomTile(), canMove(), emptyGrid(), Game2048(), reset(), Grid, move(), rotateCW() (+33 more)

### Community 3 - "Architecture Docs & Voice Plan"
Cohesion: 0.06
Nodes (42): LiveKit JARVIS All-in-One Build, Removed multi-hop voice chain (MediaRecorder, /jarvis-transcribe, /jarvis-speak, Piper/Railway), admin-ai-chat.js Ask GID Claude agent (NDJSON streaming), admin-api-data.js action-router CRUD API, api-customer.js public booking/quote API, App.tsx pathname router, Command Center build phases 1-6, Cf-Access-Jwt-Assertion auth gate (+34 more)

### Community 4 - "Ask GID AI Chat"
Cohesion: 0.11
Nodes (39): analyzeLeadFields(), classifyFocusedIntent(), classifyLeadService(), flattenLeadPayload(), focusedRoutingInstruction(), isLikelyNaturalBusinessNote(), isPastedLeadForm(), issueQuality() (+31 more)

### Community 5 - "Business Hub Admin"
Cohesion: 0.10
Nodes (38): adminPost(), BackupBookingInspector(), run(), BusinessHub(), resetAllNotes(), EquityTracker(), addEntry(), load() (+30 more)

### Community 6 - "Admin Data API"
Cohesion: 0.10
Nodes (25): json(), namesLikelyMatch(), onRequestPost(), fetchCurrentTaxRate(), onRequestPost(), handle(), onRequestGet(), onRequestPost() (+17 more)

### Community 7 - "Jarvis Proactive Reminders"
Cohesion: 0.17
Nodes (34): addDate(), cleanTime(), configuredHour(), deliverDueReminders(), formatEveningPreview(), formatLeadAlert(), formatMorningBrief(), formatUnpaidAlert() (+26 more)

### Community 8 - "Booking Data Model"
Cohesion: 0.07
Nodes (30): verify(), AUDIO_LABELS, BlackoutDate, Booking, BRAKE_LABELS, CardStepProps, DAY_LABELS, FormData (+22 more)

### Community 9 - "Command Center Page"
Cohesion: 0.11
Nodes (21): livekit-client, react, CommandCenterPage(), fadeRise, BusinessMetrics(), shortDate(), StatRow(), useCountUp() (+13 more)

### Community 10 - "Jarvis Agent Tools"
Cohesion: 0.09
Nodes (17): function_tool, db(), Undo the most recent reversible Jarvis change., Get current tax, overhead, and Stripe fee settings., Log a marketing-spend entry., Log a phone call and its outcome., List recently logged calls., List recent marketing spend entries, optionally by channel. (+9 more)

### Community 11 - "Blackjack Game API"
Cohesion: 0.16
Nodes (29): ALLOWED_BETS, BET_PRIZE_TABLES, canSplitPair(), dealerPlay(), freshDeck(), genCode(), handTotal(), isBlackjack() (+21 more)

### Community 12 - "External Leads & VIN"
Cohesion: 0.10
Nodes (19): apptTimeLabel(), CopyableField(), ExternalLeadModal(), handleSendEmail(), from12h(), JobDetailPanel(), onVinInput(), runVinDecode() (+11 more)

### Community 13 - "Lead Pipeline UI"
Cohesion: 0.16
Nodes (20): LeadDetailPanel(), Row(), Section(), LeadPipeline(), LiveFeed(), timeAgo(), MarketingPanel(), UpcomingJobs() (+12 more)

### Community 14 - "Result Cards"
Cohesion: 0.21
Nodes (15): BusinessSummaryCard(), CallCard(), CustomerCard(), GenericCard(), JobCard(), STATUS_COLOR, LeadCard(), MarketingCard() (+7 more)

### Community 15 - "Lint & Package Meta"
Cohesion: 0.10
Nodes (22): name, private, type, version, autoprefixer, eslint, @eslint/js, eslint-plugin-react-hooks (+14 more)

### Community 16 - "Customers Tab"
Cohesion: 0.13
Nodes (19): accentFor(), aggregateCustomers(), CustomerFileModal(), CustomersTab(), DuplicateCustomersModal(), defaultKeeper(), jobStatsFor(), loadCustomers() (+11 more)

### Community 17 - "Jarvis Lead Analysis"
Cohesion: 0.16
Nodes (9): Agent, GIDJarvis, Deterministically intercept pasted lead forms before the LLM can improvise., Collect human-entered text from an arbitrary raw lead payload., Parse Meta lead text whether fields are separated by newlines or spaces., Analyze a pasted Meta/Facebook/Instagram lead form directly from the user's…, Return a concise owner summary plus a professional draft response for pasted…, Interpret one noisy lead form without blindly trusting which field each answer… (+1 more)

### Community 18 - "Voice Service (FastAPI)"
Cohesion: 0.11
Nodes (20): BaseModel, fastapi, fastapi_responses, get, huggingface_hub, io, on_event, os (+12 more)

### Community 19 - "Pre-Purchase Inspection"
Cohesion: 0.13
Nodes (16): defaultPPIChecklist(), insertPPI(), listAllPPIs(), mapPPI(), patchPPI(), PrePIModal(), handleComplete(), handlePhotoFileChosen() (+8 more)

### Community 20 - "Blackjack UI"
Cohesion: 0.24
Nodes (19): apiGame(), BET_OPTIONS, Blackjack(), applyMidHand(), applyResolution(), deal(), digitsOf(), double() (+11 more)

### Community 21 - "Command Workspace"
Cohesion: 0.20
Nodes (12): ActivityFeed(), CommandInput(), Workspace(), toolLabel(), ActivityItem, ChatMsg, DataCard, GidUiEvent (+4 more)

### Community 22 - "Payments Panel"
Cohesion: 0.20
Nodes (18): PaymentPanel(), applyPaymentsUpdate(), chargeCardOnFile(), deletePayment(), markInvoiced(), markPaid(), recordPayment(), renderPaymentRow() (+10 more)

### Community 23 - "HUD Briefing Panels"
Cohesion: 0.22
Nodes (13): HudPanel(), ago(), daypart(), NewsColumn(), NewsItem, NewsPayload, OwnerBriefing(), QuickCommands() (+5 more)

### Community 24 - "TS App Config"
Cohesion: 0.11
Nodes (17): compilerOptions, allowImportingTsExtensions, isolatedModules, jsx, lib, module, moduleDetection, moduleResolution (+9 more)

### Community 25 - "Lead Capture Webhook"
Cohesion: 0.27
Nodes (15): classifyService(), fetchMetaLead(), insertLead(), json(), looksLikeVehicle(), metaFieldMap(), normalize(), normalizedKey() (+7 more)

### Community 26 - "Booking Admin Actions"
Cohesion: 0.15
Nodes (16): adminPost(), deleteBooking(), saveGarageNotes(), updateStatus(), BlackoutDatesModal(), addDate(), load(), removeDate() (+8 more)

### Community 27 - "Estimates"
Cohesion: 0.15
Nodes (10): EstimateSummary(), EstimatePanel(), saveEstimate(), sendEstimate(), sendEstimateEmail(), taxableAmount(), taxFromItems(), TaxSummary() (+2 more)

### Community 28 - "Dev Dependencies"
Cohesion: 0.12
Nodes (16): devDependencies, autoprefixer, eslint, @eslint/js, eslint-plugin-react-hooks, eslint-plugin-react-refresh, globals, postcss (+8 more)

### Community 29 - "Admin Schedule Calendar"
Cohesion: 0.14
Nodes (8): AdminSchedule(), fmtConfirmWhen(), handleDropReschedule(), ordinal(), GarageNotesField(), getSlotsForDate(), getJobById(), openJob()

### Community 30 - "Booking Widget Calendar"
Cohesion: 0.17
Nodes (9): BookingWidget(), isAvailable(), isAvailableSync(), parseSlotHour(), BrakePadSelector(), dateKey(), getBookedTimesForDate(), getPhoenixNow() (+1 more)

### Community 31 - "Invoices & Exports"
Cohesion: 0.14
Nodes (14): buildInvoicesPdf(), csvCell(), handleCreate(), getAllJobs(), InvoiceExport(), printInvoices(), shareInvoicePreview(), JobsCSVExport() (+6 more)

### Community 32 - "TS Node Config"
Cohesion: 0.12
Nodes (15): compilerOptions, allowImportingTsExtensions, isolatedModules, lib, module, moduleDetection, moduleResolution, noEmit (+7 more)

### Community 33 - "Agent Python Deps"
Cohesion: 0.14
Nodes (13): asyncio, datetime, dotenv, html, httpx, # IMPORTANT: explicitly bind the AgentSession to the actual browser, json, livekit (+5 more)

### Community 34 - "Runtime Dependencies"
Cohesion: 0.14
Nodes (14): dependencies, gsap, lenis, livekit-client, @livekit/protocol, livekit-server-sdk, lucide-react, motion (+6 more)

### Community 35 - "Jarvis 3D Core"
Cohesion: 0.22
Nodes (12): @react-three/fiber, three, CoreSphere(), GlowSphere(), JarvisCore(), NetworkGlobe(), Ring(), Scene() (+4 more)

### Community 36 - "Job Photo Panel"
Cohesion: 0.24
Nodes (13): PhotoPanel(), compressImage(), deletePhoto(), handleCapture(), persist(), saveNotes(), uploadBlob(), VideoPanel() (+5 more)

### Community 37 - "Agent Data Layer"
Cohesion: 0.22
Nodes (6): Any, GIDData, money(), Look up historical GID Garage prices for a repair/service., Mark a job paid. Call with confirmed=false first; only set true after Michael…, Estimate owner take-home from recent collected payments.

### Community 38 - "Voice Control & Mic"
Cohesion: 0.24
Nodes (9): lucide-react, MicDiagnostics(), valueColor(), encodeMonoWav(), HearingState, initialDiag(), MicDiagnostics, Options (+1 more)

### Community 39 - "Booking Submit Flow"
Cohesion: 0.22
Nodes (13): apiPost(), handleAdvanceToCard(), handleCardSaved(), handleFinalSubmit(), handleOtherSubmit(), generateCancelToken(), getBlackoutDates(), insertSupabaseBooking() (+5 more)

### Community 40 - "Job Save & Idempotency"
Cohesion: 0.23
Nodes (13): adminPostIdempotent(), findOrCreateCustomerSafe(), handleUpdate(), saveAppt(), setJobStatus(), patchJob(), PaymentLinkBox(), handleRemove() (+5 more)

### Community 41 - "Public Estimate Page"
Cohesion: 0.21
Nodes (11): apiPost(), EstimatePage(), handleSign(), fmtMileage(), fmtPhone(), getJobByIdPublic(), getPPIPublic(), img() (+3 more)

### Community 42 - "Parts Cost & Receipts"
Cohesion: 0.20
Nodes (7): DocViewerModal(), PartsCostPanel(), deleteReceipt(), handleUploadMany(), saveCost(), saveReceiptsToDb(), useDocViewer()

### Community 43 - "Command Center API"
Cohesion: 0.33
Nodes (8): adminPost(), FullJob, JobDetailPanel(), Row(), Section(), useBusinessSummary(), submitSpend(), updateLeadStatus()

### Community 44 - "Customer Public API"
Cohesion: 0.33
Nodes (7): json(), makeToken(), namesLikelyMatch(), onRequestPost(), fetchCurrentTaxRate(), findOrCreateCustomerId(), safeEqual()

### Community 45 - "Owner Pay & Profit"
Cohesion: 0.28
Nodes (8): cardRevenueInRange(), netProfitInRange(), nextBiweeklyDate(), OwnerPayPanel(), addOverheadItem(), logDraw(), persistSettings(), removeOverheadItem()

### Community 46 - "PWA Manifest"
Cohesion: 0.25
Nodes (7): background_color, description, display, icons, name, short_name, theme_color

### Community 47 - "Attention Panel"
Cohesion: 0.32
Nodes (7): motion, AttentionPanel(), CHECKLIST_LABELS, severityFor(), stableKey(), SEVERITY_COLOR, NeedsAttentionItem

### Community 48 - "Quote Calculator"
Cohesion: 0.29
Nodes (6): AxleSchematic(), classifyVehicle(), getShopAvg(), QuoteCalculator(), buildLineItems(), handleServiceChange()

### Community 49 - "Jarvis News Feed"
Cohesion: 0.48
Nodes (6): decodeXml(), FEEDS, getFeed(), onRequestGet(), parseRss(), tag()

### Community 50 - "Branding Assets"
Cohesion: 0.38
Nodes (7): GID Garage Badge Logo (apple touch icon), Professional Car Care Banner (Arizona automotive repair, phone, gidgarage.com), GID Garage Branding (mobile mechanic, red/black/chrome), GID Garage Mobile Mechanic Wordmark Logo (car silhouette + wrench), GID Garage Badge Logo (192px favicon), Merch SVG (traced black 2172x711 vector logo artwork, likely GID Garage wordmark), GID Garage Badge Logo (full size, Trust Quality Performance)

### Community 51 - "Card On File (Stripe)"
Cohesion: 0.29
Nodes (5): CardOnFileStep(), loadStripe(), requiresDeposit(), ReturningCustomerBanner(), StepHeader()

### Community 52 - "Admin Photo Upload"
Cohesion: 0.48
Nodes (6): AdminPhotoPanel(), compressPhoto(), deletePhoto(), handleUploadMany(), saveAllNotes(), savePhotosToDb()

### Community 53 - "LiveKit Token"
Cohesion: 0.53
Nodes (5): apiHost(), json(), onRequestGet(), onRequestPost(), livekit-server-sdk

### Community 54 - "NPM Scripts"
Cohesion: 0.33
Nodes (6): scripts, build, dev, lint, preview, typecheck

### Community 55 - "Email & Review Toggles"
Cohesion: 0.33
Nodes (6): EmailQuickEdit(), save(), reportError(), ReviewStatusToggle(), toggle(), handlePay()

### Community 56 - "Inspection Codes"
Cohesion: 0.53
Nodes (6): InspectionPanel(), addCode(), markDirty(), removeCode(), save(), updateCode()

### Community 57 - "Agent Entrypoint & TTS"
Cohesion: 0.50
Nodes (5): gid_jarvis(), _handle_speak_stream(), _speak_stream(), JobContext, rtc_session

### Community 58 - "Customer Email Tool"
Cohesion: 0.40
Nodes (3): Prepare/send the standard appointment-updated email for a booking. Always…, Send a customer email. Call with confirmed=false first; only set true after…, send_brevo_email()

### Community 60 - "Vehicle Data"
Cohesion: 0.40
Nodes (3): MAKES, MODEL_YEARS, ModelEntry

### Community 61 - "Jarvis Speak (legacy)"
Cohesion: 0.83
Nodes (3): json(), onRequestGet(), onRequestPost()

### Community 62 - "Jarvis Transcribe (legacy)"
Cohesion: 0.83
Nodes (3): json(), onRequestGet(), onRequestPost()

### Community 63 - "Brake Service Photos"
Cohesion: 0.67
Nodes (4): Brake Service, New Brake Rotor and Pads with Caliper, Rotor After (new rotor installed on truck hub), Rotor Before (worn rusty rotor, tools on floor)

### Community 71 - "Suspension Photos"
Cohesion: 1.00
Nodes (3): Suspension / Shocks & Struts Service, MagneRide Replacement Strut (new Arnott coilover installed on truck front suspension), RAV4 New Front Strut Assembly Installed

## Ambiguous Edges - Review These
- `GID Garage Mobile Mechanic Wordmark Logo (car silhouette + wrench)` → `Merch SVG (traced black 2172x711 vector logo artwork, likely GID Garage wordmark)`  [AMBIGUOUS]
  public/svg merch.svg · relation: semantically_similar_to

## Knowledge Gaps
- **242 isolated node(s):** `TABLES`, `CRITICAL_TABLES`, `PRESENTABLE_TOOLS`, `TOOLS`, `ALLOWED_BETS` (+237 more)
  These have ≤1 connection - possible missing edges or undocumented components. (Counts symbols only; 438 node(s) total have ≤1 connection when file, concept and rationale nodes are included.)
- **27 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **What is the exact relationship between `GID Garage Mobile Mechanic Wordmark Logo (car silhouette + wrench)` and `Merch SVG (traced black 2172x711 vector logo artwork, likely GID Garage wordmark)`?**
  _Edge tagged AMBIGUOUS (relation: semantically_similar_to) - confidence is low._
- **Why does `react` connect `Command Center Page` to `App Shell & Routing`, `Jarvis Speech Hook`, `Arcade Games`, `Jarvis 3D Core`, `JobOps Core Types`, `Voice Control & Mic`, `Booking Data Model`, `Command Center API`, `Lead Pipeline UI`, `Lint & Package Meta`, `Blackjack UI`, `Command Workspace`, `HUD Briefing Panels`, `Admin Password Gate`?**
  _High betweenness centrality (0.201) - this node is a cross-community bridge._
- **Why does `dependencies` connect `Runtime Dependencies` to `Lint & Package Meta`?**
  _High betweenness centrality (0.025) - this node is a cross-community bridge._
- **Why does `ExternalLeadModal()` connect `External Leads & VIN` to `Customers Tab`, `JobOps Core Types`, `Estimates`, `Invoices & Exports`?**
  _High betweenness centrality (0.024) - this node is a cross-community bridge._
- **What connects `TABLES`, `CRITICAL_TABLES`, `PRESENTABLE_TOOLS` to the rest of the system?**
  _242 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `App Shell & Routing` be split into smaller, more focused modules?**
  _Cohesion score 0.05098934550989345 - nodes in this community are weakly interconnected._
- **Should `JobOps Core Types` be split into smaller, more focused modules?**
  _Cohesion score 0.03648863035430989 - nodes in this community are weakly interconnected._