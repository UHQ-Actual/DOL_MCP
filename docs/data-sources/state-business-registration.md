# Midwest State Business Registration Searches — Data Source Reference

Reference for finding entity registration records (corporation / LLC / LP / nonprofit) in the Midwest. Useful for enforcement research when you need to:

- Map a trade name (e.g., a restaurant DBA) back to its legal entity
- Identify the registered agent for service of process
- List officers / governing persons
- Find related entities under common ownership (multi-location operators, fissured workplaces)
- Confirm an establishment is a real, active legal entity vs. a shell

## Bottom line

**No Midwest state offers a free public API for business registration data.** Every state has a free web search tool. Bulk download exists in some states (IA, MN, NE, OH) for a fee or with a license agreement; others (IL, IN, KS, MI, MO, WI) require contacting the state for bulk arrangements. Third-party data providers (OpenCorporates, Cobalt Intelligence, Middesk, Signzy) wrap most of these into paid APIs but the underlying data comes from the same state portals.

## What every state's public search returns

Common across Midwest portals — minor field-name variations:

| Field | Notes |
|---|---|
| Legal entity name | The official registered name |
| Entity ID / charter number / business number | The state's primary key for the entity |
| Entity type | Corporation, LLC, LP, LLP, Nonprofit, Foreign (out-of-state), etc. |
| Status | Active, Inactive, Dissolved, Revoked, Withdrawn, Forfeited |
| Formation / registration date | When the entity registered with the state |
| Registered agent name and address | For service of process — the most useful field for enforcement research |
| Principal office address | Often (not always) the actual business location |
| Officers / governing persons | Director, member, manager, partner names — varies by state |
| Filing history | Annual reports, amendments, mergers — sometimes downloadable as PDFs |

## Midwest matrix

| State | Portal | Free search? | API? | Bulk download? | Cost |
|---|---|---|---|---|---|
| **Illinois** | [apps.ilsos.gov/businessentitysearch](https://apps.ilsos.gov/businessentitysearch/) | Yes (single lookup only) | No | Paid contract via IL DBS | Contact 217-782-6961 |
| **Indiana** | [bsd.sos.in.gov/publicbusinesssearch](https://bsd.sos.in.gov/publicbusinesssearch) (INBiz) | Yes | No | Yes, [Bulk Data Services](https://inbiz.in.gov/Inbiz/BulkDataServices/Index) | Tiered subscription |
| **Iowa** | [sos.iowa.gov/search/business/search.aspx](https://sos.iowa.gov/search/business/search.aspx) | Yes (~600k entities) | No (contact ftf@sos.iowa.gov) | Bulk by contact | 515-281-5204 |
| **Kansas** | [sos.ks.gov/eforms/BusinessEntity/Search.aspx](https://www.sos.ks.gov/eforms/BusinessEntity/Search.aspx) | Yes (BESS) | No | Contact 785-296-4564 | Negotiated |
| **Michigan** | [michigan.gov/corpentitysearch](https://www.michigan.gov/corpentitysearch) (MiBusiness Registry — replaced COFS in June 2025) | Yes | No | Contact LARA | n/a |
| **Minnesota** | [mblsportal.sos.mn.gov/Business/Search](https://mblsportal.sos.mn.gov/Business/Search) | Yes | No | [Yes — weekly CSV](https://www.sos.mn.gov/business-liens/business-liens-data/business-data-available/) | $30/week commercial; free for media/research/non-commercial |
| **Missouri** | [bsd.sos.mo.gov](https://bsd.sos.mo.gov/) | Yes | No | Contact MO SOS | n/a |
| **Nebraska** | [sos.nebraska.gov/business-services/corporate-and-business](https://sos.nebraska.gov/business-services/corporate-and-business) | Yes | No | [Yes — Special Request CSV](https://www.nebraska.gov/SpecialRequestSearches/index.cgi) | $15 / 1,000 records |
| **Ohio** | [businesssearch.ohiosos.gov](https://businesssearch.ohiosos.gov/) | Yes | No | [Yes — free monthly reports](https://www.ohiosos.gov/business/business-reports) (new filings, trademarks, cancellations, dissolutions) | Free |
| **Wisconsin** | [apps.dfi.wi.gov/apps/corpsearch/search.aspx](https://apps.dfi.wi.gov/apps/corpsearch/search.aspx) | Yes (advanced search supports filters) | No | Contact DFI | n/a |

## Per-state notes

### Illinois — apps.ilsos.gov/businessentitysearch
Search by entity name, file number, or partial name. Returns name, file number, type, status, formation date, registered agent. Document images for filings (articles of incorporation, annual reports) downloadable per-document for a fee.
**Bulk:** Not via the free portal. Paid bulk arrangements via Illinois Department of Business Services. Phone 217-782-6961.
**Notes:** IL DBS database includes Corporations, Not-for-Profit Corporations, LPs, LLCs, and LLPs.

### Indiana — INBiz (bsd.sos.in.gov)
Free search by name, type, status, location. Returns Business ID, Name, Type, Principal Office Address, Registered Agent Name, Status. Full entity profile shows Governing Person Information (title, name, address) and Registered Agent details.
**Bulk:** [INBiz Bulk Data Services](https://inbiz.in.gov/Inbiz/BulkDataServices/Index) offers paid subscriptions for bulk records.
**Notes:** Indiana is one of the more agent-friendly states for research — the governing persons list is fuller than most states.

### Iowa — sos.iowa.gov/search/business
Free, no account required. Database covers ~600k active and inactive entities and ~1M filings. Search by name (partial OK) or by filing number. Returns name, status, type, entity address, registered agent, dates, previous names.
**Bulk:** Email ftf@sos.iowa.gov or call 515-281-5204. No published API.
**Notes:** Iowa's Fast Track Filing system has processed >500,000 documents since 2018, so coverage is comprehensive.

### Kansas — Business Entity Search Station (BESS)
Search by name, ID number, keyword, or registered agent name. Covers corporations, LLCs, LPs, LLPs.
**Bulk:** Call Business Services Division 785-296-4564. No published API.
**Notes:** Kansas exposes registered-agent search natively, which is useful for finding all entities under one agent.

### Michigan — MiBusiness Registry Portal (replaced COFS June 2025)
The legacy `cofs.lara.state.mi.us` URLs are retired as of June 23, 2025. Current URLs:
- Portal: https://www.michigan.gov/corpfileonline
- Business search: https://www.michigan.gov/corpentitysearch
- Marks & insignia: https://www.michigan.gov/corpmarksearch
- Certificate verification: https://www.michigan.gov/corpverifycertificate

Returns full legal name, entity ID, formation date, type, current status, registered agent details.
**Bulk:** Contact LARA Corporations Division. No published API.

### Minnesota — MBLSPortal
Free search at mblsportal.sos.mn.gov. Active business CSV available as a weekly download.
**Bulk:** $30/week debited weekly for commercial; **free for journalists, researchers, and non-commercial users**. Submit license agreement via [sos.mn.gov bulk data](https://www.sos.mn.gov/business-liens/business-liens-data/business-data-available/) or call 651-296-2803 / 877-551-6767.
**Notes:** The cheapest, most legitimate path to a recurring Midwest business-roster feed. Worth applying for the non-commercial license if doing ongoing research.

### Missouri — bsd.sos.mo.gov
Search by name, registered agent, or charter number. Returns name (with previous names), charter number, type, status, formation date, registered agent.
**Bulk:** Contact MO SOS. No published API.
**Notes:** Missouri's "previous names" field is unusually useful for tracking entities through name changes / rebrands.

### Nebraska — sos.nebraska.gov/business-services
Free search of corporate, business, trade name, trademark, and service mark databases. Certificates of Good Standing and document copies available by credit card.
**Bulk:** [Special Request CSV download](https://www.nebraska.gov/SpecialRequestSearches/index.cgi) at $15 per 1,000 records — affordable for batch research.
**Notes:** Nebraska's $15/1k pricing is the cheapest published bulk rate among the Midwest states.

### Ohio — businesssearch.ohiosos.gov
Search by name. Returns entity records with downloadable filing images (annual reports, articles of incorporation).
**Bulk:** [Free monthly reports](https://www.ohiosos.gov/business/business-reports) — new business registrations, subsequent filings, service marks, trademarks, debarred or dissolved entities. Generated on the second Saturday of each month.
**Notes:** Ohio's free monthly report stream is the only no-cost recurring bulk data source in the Midwest. Worth scraping monthly for change-tracking.

### Wisconsin — Department of Financial Institutions
Wisconsin's business registration is administered by the **Department of Financial Institutions**, not the Secretary of State. Search at apps.dfi.wi.gov/apps/corpsearch.
- Basic search: by entity name (excluding LLC/Corp suffixes)
- Advanced search: filters and combinations available
**Bulk:** Contact WI DFI. No published API.
**Notes:** Common confusion point — searching "Wisconsin Secretary of State business search" leads to dead ends because the SOS doesn't run the registry.

## Cross-state patterns useful for enforcement research

| Pattern | How to use it |
|---|---|
| **Multi-location operator detection** | Search the registered agent's name in each state — same agent acting for multiple entities at the same address often signals common ownership. Available in IL, IN, IA, KS, MI, MN, MO, NE, OH, WI. |
| **Trade name (DBA) → legal entity** | Most states record DBA / fictitious name filings separately or as an entity attribute. Search by both the DBA and the parent legal name. |
| **Foreign entity registration** | Out-of-state corporations and LLCs operating in the state must register. The "Foreign" entity-type filter pulls these. Useful for catching national chains operating Midwest locations under a Delaware or Nevada parent. |
| **Recently dissolved or revoked** | "Revoked / Forfeited" status often signals failure to file annual reports — sometimes a leading indicator for distressed operators. OH's monthly report explicitly flags dissolutions. |
| **Common officer searches** | Most states let you search by officer / governing person name. Useful for tracking serial operators across multiple corporate vehicles. KS, IN, MO, NE, MN, OH support this directly. |

## Possible MCP additions (not yet built)

- `business_entity_search` — single-lookup tool wrapping each Midwest portal. Inputs: state code, entity name (or registered agent name, or entity ID). Output: normalized entity record. Implementation challenge: each state's portal is HTML scraping (no API); fragile and rate-limited. Probably better as a paid third-party API integration (OpenCorporates, Middesk, Cobalt) once volume justifies the cost.
- `mn_active_business_feed` — wrapper around the Minnesota weekly CSV (free for non-commercial). Periodic ingestion into a SQLite cache for fast in-MCP lookups.
- `oh_monthly_filings_feed` — wrapper around Ohio's free second-Saturday monthly drop. Track new filings, dissolutions, trademarks across the state.

## Sources

- [Illinois Business Entity Search](https://apps.ilsos.gov/businessentitysearch/)
- [Illinois Business Services Division](https://www.ilsos.gov/departments/business-services/business-searches.html)
- [Indiana INBiz Public Business Search](https://bsd.sos.in.gov/publicbusinesssearch)
- [INBiz Bulk Data Services](https://inbiz.in.gov/Inbiz/BulkDataServices/Index)
- [Iowa Secretary of State Business Entity Search](https://sos.iowa.gov/search/business/search.aspx)
- [Iowa Fast Track Filing](https://help.sos.iowa.gov/about-fast-track-filing)
- [Kansas BESS – Business Entity Search](https://www.sos.ks.gov/eforms/BusinessEntity/Search.aspx)
- [Kansas Business Useful Links](https://sos.ks.gov/business/business-useful-links.html)
- [Michigan MiBusiness Registry Portal](https://mibusinessregistry.lara.state.mi.us/search/business)
- [Michigan LARA Corporations Division](https://www.michigan.gov/lara/bureau-list/cscl/corps)
- [Minnesota MBLSPortal Business Search](https://mblsportal.sos.mn.gov/Business/Search)
- [Minnesota Bulk Business Data](https://www.sos.mn.gov/business-liens/business-liens-data/business-data-available/)
- [Missouri Business Filings](https://bsd.sos.mo.gov/)
- [Missouri Business Entity Search](https://www.sos.mo.gov/BusinessEntity/soskb/csearch.asp)
- [Nebraska Corporate and Business](https://sos.nebraska.gov/business-services/corporate-and-business)
- [Nebraska Special Request Searches](https://www.nebraska.gov/SpecialRequestSearches/index.cgi)
- [Ohio Business Search](https://businesssearch.ohiosos.gov/)
- [Ohio Free Business Reports](https://www.ohiosos.gov/business/business-reports)
- [Wisconsin DFI Corporate Records Search](https://apps.dfi.wi.gov/apps/corpsearch/search.aspx)
- [Wisconsin DFI Business Entity Information](https://dfi.wi.gov/Pages/BusinessServices/BusinessEntities/GeneralInformation.aspx)
