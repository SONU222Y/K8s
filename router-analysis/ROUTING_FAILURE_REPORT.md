# Laya router: why PACO queries get misrouted (Run A 16 Nov vs Run B 18 Nov)

Legend: **[FACT]** means I measured it with the code in Appendix G. **[HYPOTHESIS]** means I inferred it from behaviour and have not checked it against the router's actual prompts, which I don't have.

## Executive summary

1. [FACT] Failures depend on which product the query is about, not on keywords. 978 of the 1,999 queries are about five products: ePDG, SeGW, Media Engine, Provisioning Gateway and the peer-VNF platform. They account for **81% of wrong routes in both runs** (755/927 in A, 516/640 in B).
2. [FACT] For queries that name a 5GC/EPC NF (AMF, AUSF, MME, SMF/UPF, NRF, PCF, UDM, CCLB, MDPLB; 979 rows), misroute is only 15.2% (A) and 11.1% (B). For the five products above it is 77.2% (A) and 53.3% (B).
3. [FACT] Only 35 queries (1.8%) are about PCF, PCRF or policy. "PACO = policy" is the wrong mental model for this test set.
4. [FACT] The protocol words decide **where** an unrecognised product goes: IPsec/IKE/ESP → IMS (A) then MCO (B); NAT44/NAT64 → RAN (A) then MCO (B); HTTP 4xx/5xx → MDE; Kafka → Platform; DIAMRE → IMS; "configuration" → CMS.
5. [FACT] Run B fixed 391 queries but regressed 107. Net: +284 right, accuracy 53.63% → 67.53% (67.84% excluding the 9 fetch errors).
6. [FACT] B emptied RAN (212 → 9) and shrank IMS (338 → 118). About 29% of those freed queries (131 of 447) went to MCO, so MCO doubled to 262. 222 of those 262 (85%) contain no messaging word at all, so MCO is behaving as a catch-all.
7. [FACT] Of the 107 regressions, 45 went to MCO and 36 to Platform. The tagged causes are: HTTP/request-handling wording, mostly AUSF (18), `INVALID_MSG_FORMAT`/"malformed" wording → MCO (14), Media Engine → MCO (14), Kafka → Platform (11), peer-VNF → Platform (10).
8. [FACT] Confidence is useless as a guardrail. 414 of B's 640 wrong routes have confidence ≥ 0.95, and in the top bucket (≥ 0.999) 23% of routes are still wrong.
9. [FACT] Structure features such as the "last 2 days" template, length and question vs imperative look predictive overall, but they are confounded by product: inside each product group the effect almost disappears. (*Confound* = a hidden third variable that makes two things look related when neither causes the other.)
10. [HYPOTHESIS] About 11% of B's failures (73 rows, category C1) may be dataset labelling problems, not router problems: SS7 CAP/MAP/INAP/TCAP, SMTP/MM4, SIP, NFV-infra alarms and CDR files labelled PACO. The test set is also **single-class** (every row expects PACO), so it can't detect PACO over-claiming. That makes B's gain unverifiable as a real improvement.

---

## 1. Segments [FACT]

| segment | count | % of 1,999 |
|---|---:|---:|
| persistently right | 959 | 47.97 |
| persistently wrong | 533 | 26.66 |
| fixed (wrong A → right B) | 391 | 19.56 |
| regressed (right A → wrong B) | 107 | 5.35 |
| excluded (B fetch error) | 9 | 0.45 |
| **total** | **1,999** | **100.00** |

Reconciliation:
- A wrong 927 = 533 persistently wrong + 391 fixed + 3 error rows that were wrong in A.
- A right 1,072 = 959 + 107 + 6.
- B right 1,350 = 959 + 391.
- B wrong 640 = 533 + 107.
- B error = 9.

Fetch-error rows: 1244, 1248, 1257, 1269, 1292, 1296, 1299, 1304, 1310. All nine are Media Engine NAT64, TCP and Syslog measurement requests, so the errors cluster on one product, which is worth checking on the infra side. Their Run A picks are in Appendix A §1.

## 2. Over-represented terms per wrong destination [FACT]

Method: smoothed log-odds ratio with a Jeffreys +0.5 prior and z-scores. Each comparison is misrouted-to-X vs correctly routed to PACO in the same run, with support ≥ 8 queries. Unigrams, bigrams and trigrams are lowercased. UPPER_SNAKE counter names are also split into parts (shown as `ctr:xxx`). The full 20-row tables for all 12 run × agent combinations are in Appendix A §2. Short version:

| dest | Run A strongest terms (n_mis / n_correct, lift) | Run B strongest terms |
|---|---|---|
| IMS | segw (111/31, 11.2), epdg (113/85, 4.2), ipsec (47/8, 17.5), ike (44/1, 93), epdg ike (29/1, 61), esp, tunnel | peer-vnf platform (33/4, 84), diamre (22/0, 503), epdg ike (11/11), ike, `ctr:ikev2`, interface |
| RAN | media engine (84/43, 9.8), nat44 (25/3, 36), nat64 (23/5, 21), nat44 and nat64 (17/2, 34), memory, ports, authentication | only 9 misroutes left; no term reaches support 8 |
| MCO | peer-vnf platform (22/16, 11.5), http, provisioning gateway, `ctr:snd` (22/1, 127), gtpv2 (10/4, 19), messages | media engine (80/82, 5.0), peer-vnf, packets, **esp (18/7)**, **ike (21/16)**, **ipsec (23/22)**, control, messages, security, `ctr:format`/`ctr:msg` |
| MDE | provisioning gateway (73/12, 53), http (59/17, 31), responses received (18/4, 36), http notifications (19/1, 115), `ctr:rcv`, `ctr:response` | provisioning gateway (46/36, 18), http (39/38, 15), responses received for requests (15/2, 86), southbound http, notifications |
| Platform | peer-vnf platform (37/16, 26), kafka nodes (8/0), network notification request (8/0), error, failure | peer-vnf platform (62/4, 127), northbound kafka (19/0, 349), kafka (25/1, 153), database, nat44/nat64 |
| CMS | configuration (23/20, 29), configured (11/36), media engine | only 10 misroutes left; no term reaches support 8 |

Shared-vocabulary ("hidden ambiguous") terms that appear in the significant lists: **ipsec, ike, esp, tunnel, http, kafka, error, failure, response, configuration, authentication, interface, database, packets, security, messages, control**.
- Your list included session, bearer, registration, SIP, KPI, latency, congestion and throttling. **None of those reached significance as misroute drivers** [FACT].
- Session and registration actually appear mostly in correctly routed AUSF/AMF queries.
- Only 3 queries mention P-CSCF, so the "IMS-PCSCF queries mention PCF" idea is not supported by this data.

## 3. Query structure [FACT]

Raw misroute rates by feature (full table in Appendix A §3):

| feature | present: mis% A / B | absent: mis% A / B |
|---|---|---|
| names a 5GC/EPC NF (AMF/SMF/UPF/AUSF/UDM/UDR/NRF/MME/PCF/NSSF/SEPP) | **15.0 / 10.6** | **69.2 / 48.0** |
| explicit PACO policy component (PCF/PCRF/PCC/policy/Gx/Rx/Sy/N7), n=71 | 39.4 / 19.7 | 46.6 / 32.6 |
| platform/infra term (NFV/pod/disk/CPU/alarm/VNF/Kafka/DB) | 63.1 / 61.9 | 43.0 / 26.2 |
| HTTP status / REST | 68.2 / 51.5 | 44.8 / 30.8 |
| IMS-flavoured term (SIP/CSCF/IKE/IPsec/ePDG/Rx) | 76.3 / 38.7 | 39.0 / 30.6 |
| "last/past 2 days" measurement template | 63.5 / 47.0 | 30.2 / 18.2 |
| troubleshooting verb (investigate/why/fail/RCA) | 52.9 / 32.7 | 45.3 / 32.1 |
| question (ends with ?) | 44.5 / 30.6 | 48.4 / 33.8 |
| length > 20 words | 59.5 / 41.2 | 40.7 / 28.3 |

**The product group is the variable that matters; the template effect is a confound:**

| group (n) | "2 days" template: mis% A / B | free-form: mis% A / B | counter name present: A / B | no counter name: A / B |
|---|---|---|---|---|
| names a 5GC/EPC NF (979) | 16.7 / 12.8 | 14.8 / 10.6 | **3.4 / 6.2** | 24.0 / 14.8 |
| ePDG/SeGW/ME/ProvGW/peer-VNF (969 valid) | 78.3 / 57.6 | 75.5 / 39.5 | 63.6 / 45.4 | 84.0 / 56.8 |

What this table shows:
- Within each group the template barely matters.
- A counter name with an NF prefix (`AUSF_…`, `MDPLB_…`) is strongly *protective*.
- Naming the PCF explicitly helps but doesn't guarantee a correct route: 6 of 35 PCF/policy rows are still wrong in B.

Misroute by product family (Run B shown; A is in Appendix A §3):

| family | n | wrong A | mis% A | wrong B | mis% B | top wrong dest A → B |
|---|---:|---:|---:|---:|---:|---|
| peer-VNF platform | 140 | 116 | 82.9 | 130 | 92.9 | IMS → PLATFORM |
| Media Engine | 240 (231 valid B) | 170 | 70.8 | 121 | 52.4 | RAN → MCO |
| ePDG | 303 | 217 | 71.6 | 101 | 33.3 | IMS → MCO |
| Provisioning Gateway | 119 | 107 | 89.9 | 82 | 68.9 | MDE → MDE |
| SeGW | 176 | 145 | 82.4 | 82 | 46.6 | IMS → MCO |
| AUSF | 447 | 70 | 15.7 | 66 | 14.8 | RAN → MCO |
| UDM/UDR/UDSF | 53 | 34 | 64.2 | 14 | 26.4 | RAN → MCO |
| NFV platform (infra) | 28 | 12 | 42.9 | 9 | 32.1 | PLATFORM |
| PCF/PCRF/policy | 35 | 13 | 37.1 | 6 | 17.1 | IMS → MCO |
| SMF/UPF/PDU session | 61 | 5 | 8.2 | 6 | 9.8 | PLATFORM |
| MME | 105 | 9 | 8.6 | 5 | 4.8 | CMS → IMS |
| CCLB | 56 | 12 | 21.4 | 5 | 8.9 | MCO → PLATFORM |
| AMF | 111 | 4 | 3.6 | 4 | 3.6 | RAN |
| MDPLB | 83 | 1 | 1.2 | 3 | 3.6 | RAN → IMS |
| NRF/NSSF/SCP/SEPP | 28 | 1 | 3.6 | 0 | 0.0 | — |
| other (MTCIL, LI, mesh, migration, misc) | 14 | 11 | — | 6 | — | — |
| **total** | **1,999** | **927** | | **640** | | |

## 4. Confidence [FACT]

| run | verdict | n | mean | median | n ≥ 0.95 | n ≥ 0.99 |
|---|---|---:|---:|---:|---:|---:|
| A | right | 1,072 | 0.920 | 0.9993 | 835 | 767 |
| A | wrong | 927 | 0.794 | 0.9413 | **452** | 342 |
| B | right | 1,350 | 0.942 | 1.0000 | 1,053 | 962 |
| B | wrong | 640 | 0.896 | 0.9920 | **414** | 329 |

- B made the router *more* confident when wrong: the median wrong-route confidence went from 0.94 to 0.99.
- In B, accuracy in the 0.95–0.99 bucket (51.7%) is lower than in the 0.5–0.7 bucket (55.7%), so the scores are not calibrated.
- The top-30 lists are in Appendix A §4.

What drove the 30 most confident wrong routes in Run B (each row assigned once; the counts sum to 30):

| signal in text | n | dest | example rows |
|---|---:|---|---|
| HTTP status code + "responses sent/received for requests" (ProvGW) | 10 | MDE | 1377, 1383, 1387, 1389, 1397, 1401, 1403, 1405, 1415, 1429 |
| "error code N received from **Kafka** nodes" (ProvGW northbound) | 6 | PLATFORM | 1353, 1357, 1359, 1361, 1363, 1365 |
| SMS / SMSF / SMTP | 4 | MCO | 46, 481, 1585, 1587 |
| IMS / HSS / SRVCC / IMS idle timer | 4 | IMS | 45, 553, 580, 683 |
| NFV alarms; "node measurements … performance groups" | 2 | PLATFORM | 677, 1467 |
| "control-plane message", "alarm path" | 2 | MCO | 691, 23 |
| "charging destination / CHF" next to PCF + PCC rule | 1 | MDE | 5 |
| VLB flow-control forwarding (peer-VNF) | 1 | IMS | 1464 |

[HYPOTHESIS] Each of these hits a term that appears literally in the competing agent's description, while the PACO description doesn't mention the product (ProvGW, ePDG) or the counter family. A literal match to a description makes the router near-certain. That is why these routes score 0.999+ while being wrong.

## 5. Cross-run diagnosis [FACT unless marked]

**Why IMS (338 → 118) and RAN (212 → 9) fell:**
- Of A's 338 IMS misroutes, 146 went to PACO in B, **80 moved to MCO** and 96 stayed IMS.
- Of A's 212 RAN misroutes, 124 went to PACO, **51 moved to MCO**, 23 moved to Platform and 7 stayed RAN.
- Terms whose pull toward IMS fell most: epdg −91, segw −83, ipsec −39, ike −32, ikev2 −27.
- Terms whose pull toward RAN fell most: media engine −82, ausf −37, nat44 −25, nat64 −23.
- [HYPOTHESIS] Between A and B the IMS and RAN descriptions were narrowed (RAN to radio only; IMS no longer claims IPsec/IKE/tunnels), and/or ePDG/SeGW were added to PACO. PACO picks rose for ePDG (86 → 202) and SeGW (31 → 94) but **fell** for peer-VNF (24 → 10), which suggests nothing was added for peer-VNF.

**Why MCO (124 → 262) and Platform (93 → 147) rose:**
- B's MCO routes came from: IMS 80, MCO 69, RAN 51, PACO 45 (regressions), CMS 8, MDE 5, Platform 4.
- B's Platform routes came from: Platform 66, PACO 36, RAN 23, MCO 10, MDE 6, IMS 5, CMS 1.
- Terms with the biggest new pull toward MCO: media engine +55, segw +34, epdg +25, **ipsec 0 → 23**, ike +17, esp +16, ausf +16, failures +13, inspect +13.
- Terms with the biggest new pull toward Platform: peer-vnf +26, kafka +16, provisioning gateway northbound +10.
- [HYPOTHESIS] MCO's description contains generic words such as "message(s)", "control", "security", "packets" or "malformed/invalid". Once IMS and RAN stopped claiming these queries, MCO became the closest generic match. The evidence: 85% of B's MCO misroutes contain no messaging term.
- 20 before/after examples are in Appendix A §5. For instance:
  - row 4 (PCF predefined rule): IMS → MCO
  - row 945 (SeGW IKE at vLB-FE): IMS → MCO
  - row 1121 (Media Engine NAT44): RAN → MCO
  - rows 1202–1203 (Media Engine GRE NAT ports): RAN → PLATFORM
  - rows 1665/1667 (CCLB counters): PACO → PLATFORM
  - row 346 (AUSF bytes to Kafka): PACO → PLATFORM

**The 107 regressions** (all listed in Appendix D):
- Destinations: MCO 45, PLATFORM 36, IMS 16, MDE 9, RAN 1.
- Families: AUSF 42, peer-VNF 17, Media Engine 16, ProvGW 9, CCLB 5, ePDG 4, SeGW 3, SMF 3, MDPLB 3, PCF 2, AMF 2, NFV 1.
- Regression *rate* among queries that A got right: ProvGW 75% (9/12), peer-VNF 71% (17/24), Media Engine 25%, AUSF 11%, AMF 2%, MME 0%.

| tagged cause (first matching rule) | n | → |
|---|---:|---|
| HTTP / request-handling wording (429/503, liveness, NOT_READY, REQ_OK): AUSF 9, peer-VNF 7, AMF 1, ProvGW 1 | 18 | IMS 7, MCO 5, PLATFORM 5, RAN 1 |
| `INVALID_MSG_FORMAT` / "malformed" / "invalid" | 14 | MCO 13 |
| Media Engine | 14 | MCO 10 |
| Kafka | 11 | PLATFORM 9 |
| peer-VNF platform | 10 | PLATFORM 8 |
| CCLB/MDPLB counters in free-form ops phrasing ("spiked", "per pod") | 8 | PLATFORM 5, IMS 3 |
| SEPP / "security-edge-proxy" | 5 | MDE 5 |
| pod / Kubernetes wording | 5 | PLATFORM 3 |
| subscriber / SUPI / context (`get_ausf_supi`) | 5 | MCO 5 |
| other | 17 | mixed |

Common cause: **over-correction combined with catch-all descriptions** [HYPOTHESIS, strongly supported].
- One rule fits most of these: words that also describe messaging (message format, subscriber context), infrastructure (Kafka, pod) or mediation (HTTP responses, subscription) beat the NF name, even when the NF name (AUSF, CCLB) is right there in the counter.
- There's no sign of a single new keyword rule. If there were one, the regressions would cluster on one term; they are spread across 10 tags.

## 6. Confusion and overlap

Confusion matrix, A pick (rows) × B pick (columns) [FACT]:

| A \ B | CMS | ERROR | IMS | MCO | MDE | PACO | PLATFORM | RAN | All |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| CMS | 10 | 0 | 0 | 8 | 1 | 22 | 1 | 0 | 42 |
| IMS | 0 | 2 | 96 | 80 | 8 | 146 | 5 | 1 | 338 |
| MCO | 0 | 1 | 1 | 69 | 4 | 39 | 10 | 0 | 124 |
| MDE | 0 | 0 | 0 | 5 | 67 | 40 | 6 | 0 | 118 |
| PACO | 0 | 6 | 16 | 45 | 9 | 959 | 36 | 1 | 1,072 |
| PLATFORM | 0 | 0 | 1 | 4 | 2 | 20 | 66 | 0 | 93 |
| RAN | 0 | 0 | 4 | 51 | 3 | 124 | 23 | 7 | 212 |
| All | 10 | 9 | 118 | 262 | 94 | 1,350 | 147 | 9 | 1,999 |

Shared concepts behind each frequent pair (the terms are measured; whether each concept "belongs" to the other domain is my reading):

| pair | shared concepts that make the domains look alike |
|---|---|
| PACO ↔ IMS | IPsec/IKEv2/ESP tunnels (ePDG SWu, SeGW), Diameter (DIAMRE S13/SWm/Rx/Ro), HSS, P-CSCF override, EAP-AKA vs IMS-AKA "authentication", VoWiFi idle timers |
| PACO ↔ RAN (A only) | NAT44/NAT64 "ports" and "memory pool" (Media Engine), radio capability, paging, handover, "UE" |
| PACO ↔ MCO | "messages", "malformed / invalid message format", "control", "packets", "security", SMS over NAS, SMTP/MM4, subscriber context |
| PACO ↔ MDE | HTTP 2xx/4xx/5xx "responses received for requests", "notifications", CDR / charging records, CHF, SEPP subscription renewal |
| PACO ↔ Platform | "peer-VNF platform", Kafka brokers/nodes, NFV alarms, pods, disk/CPU, Couchbase/database, error codes |
| PACO ↔ CMS | "configuration", "configured", "show configuration", mCMS/CLI parameters |

**Possibly mislabeled rows (category C1, n=100)** [HYPOTHESIS: these need an ownership decision by you]:
- 58 of the 100 got the *same* non-PACO agent in both runs. All 100 are in Appendix E and `mislabel_candidates.csv`.

| reason | n | wrong in B | same non-PACO pick in A and B |
|---|---:|---:|---:|
| SS7/IN signalling (CAP/MAP/INAP/TCAP/SCCP/M3UA) | 35 (+1) | 32 | 24 |
| NFV infrastructure alarm/resource | 28 | 9 | 6 |
| messaging (SMS/SMSF/SMTP/MM4) | 16 | 15 | 12 |
| IMS/SIP/SRVCC/IMS-HSS subject | 10 | 7 | 7 |
| CDR / charging records / DIAMRE Ro | 10 | 9 | 8 |

**The whole peer-VNF platform family (140 rows) needs an ownership decision.** Only 7 of the 140 were right in both runs. Its measurement groups are DIAMRE Ro/Rx/SWm/S13, SMTP, MM4, CAP, MAP, INAP, TCAP, SCCP, M3UA, LSKSCTP, SIPRE routing, WAS HTTP, CAS charging records and UAG Data Path. That's a shared middleware layer used by *other* VNFs, not a packet-core product. The 79 peer-VNF rows without one of the C1 cues are in `peer_vnf_ownership_review.csv`.

## 7. Root-cause synthesis

Each query gets one primary category; the rules are in `scripts/part2.py` and the categories don't overlap. Shares are measured [FACT]. The *interpretation* of each category is [HYPOTHESIS].

| category | n queries | wrong A | % of A wrong | wrong B | % of B wrong | mis% B |
|---|---:|---:|---:|---:|---:|---:|
| C3 PACO product not recognised + shared protocol/infra vocabulary (ePDG/SeGW/ME/ProvGW/peer-VNF + IPsec/NAT/HTTP/Kafka/Diameter…) | 773 | 599 | 64.6 | 394 | 61.6 | 51.6 |
| C2 Generic term overrides a named PACO NF (AUSF/AMF/PCF/UDM/CCLB… named, still misrouted) | 971 | 144 | 15.5 | 104 | 16.2 | 10.7 |
| C1 Ownership ambiguous / likely mislabeled | 100 | 75 | 8.1 | 73 | 11.4 | 73.0 |
| C4 PACO product not recognised, no shared term (pure coverage gap) | 141 | 98 | 10.6 | 63 | 9.8 | 44.7 |
| C5 Other (MTCIL, LI, service mesh, unidentified) | 14 | 11 | 1.2 | 6 | 0.9 | 42.9 |
| **total** | **1,999** | **927** | **100** | **640** | **100** | 32.2 |

How these map to your categories:
- **"Missing PACO-specific keywords in the description"** = C3 + C4 = **75% of A's failures and 71% of B's**. This is the dominant cause.
- **"Ambiguous/shared vocabulary"** is the mechanism *inside* C3: it decides which wrong agent wins, not whether the route fails.
- **"Router keys on a generic term over the PACO product term"** = C2 (16%).
- **"Mislabeled"** = C1 (8–11%).
- **"Over-broad MCO/Platform catch-all"** cuts across the categories: 222 of 262 MCO misroutes in B have no messaging cue. It's the main way B's freed-up errors were reabsorbed.

Examples, five or more per category (Excel row: query):
- **C3**
  - 1612: "HTTP GET requests sent … in peer-VNF platform WAS HTTP" → MCO
  - 829: "ePDG Latency … EPDG_DIAM_MIN_LATENCY" → IMS
  - 1435: "413 Request Entity Too Large … Provisioning Gateway southbound HTTP" → MDE
  - 808: "encrypted-data packets failing cryptographic authentication … ePDG IPsec" → MCO
  - 1010: "NUM_ECA_RESP_RCVD_WITH_RC_2001 for SeGW DIAMRE equipment-identity" → IMS
  - 1202: "opened ports in Media Engine GRE for both NAT44 and NAT64" → PLATFORM
- **C2**
  - 5: "PCF supplied CHF addresses in the existing PCC rule" → MDE
  - 150: "Kubernetes Watch timeouts … in AUSF" → PLATFORM
  - 393: "security-edge-proxy subscription renewal … AUSF SEPP" → MDE
  - 1818: "subscriber trace on the N12 interface on the AUSF … mCMS or CLI parameters" → MCO
  - 106: "Couchbase pod backing UDSF has failed" → MDE
  - 1849: "Compare AUSF_NAUSF_EAP_AKA_SESSION_INVALID_MSG_FORMAT_COUNT this week against the same weekday last week" → MCO
- **C1**
  - 45: "EPS or IMS authentication failures at the UDM boundary … HSS GetHssAv" → IMS
  - 46: "UDM SMS subscription and SMS management dataset" → MCO
  - 481: "SMS over NAS … SMSF selection" → MCO
  - 553: "dropped IMS call … SRVCC … MME" → IMS
  - 1495: "peer-VNF platform CAP … CAP_CIR_INV_RCVD" → PLATFORM
  - 1467: "platform NFV CPU-status and disk-status alarms" → PLATFORM
- **C4**
  - 677: "node measurements … ePDG performance groups" → PLATFORM
  - 843: "EPDG_DIAM_MIN from ePDG Peak System Transaction" → IMS
  - 1538: "peer-VNF platform connection-tracking … Conntrack entries" → PLATFORM
  - 1276: "setup_messages … Media Engine RTSP" → MCO
  - 1609: "UAGU_DP_DISCARD_REASON_RATE_LIMITING … peer-VNF platform UAG Data Path" → IMS
  - 1332: "ValidationService, WorkflowService … Provisioning Gateway" → MDE
- **C5**
  - 23: "threshold-crossed alarms … MTCIL alarm path" → MCO
  - 1636: "session recovery after a pod loss" → PLATFORM
  - 1795: "Radio paging load rose during the subscriber move" → RAN
  - 121: "mTLS connection failures on a documented mesh path" → MCO
  - 26: "MTCIL-originated alarm visibility in mCMS and Mavenir Analytics" → MCO (both runs)
  - 518: "LI_X1 availability incident … LIPF-to-POI transport" → RAN (A only)

More are in Appendix C.

## 8. Actionable output

### 8a. Trap terms [FACT: ranked by excess misroutes over baseline, summed across both runs]

**Unrecognised product names (fix these first):**

| term | n | mis% A → B | pulls toward A → B |
|---|---:|---|---|
| peer-vnf platform | 140 | 82.9 → 92.9 | IMS → PLATFORM |
| media engine | 208 | 79.3 → 58.8 | RAN → MCO |
| provisioning gateway | 118 | 89.8 → 69.5 | MDE → MDE |
| segw | 174 | 82.2 → 46.0 | IMS → MCO |
| epdg | 293 | 71.0 → 33.4 | IMS → MCO |
| provisioning gateway northbound | 47 | 76.6 → 87.2 | MDE → PLATFORM |
| provisioning gateway southbound | 38 | 100 → 52.6 | MDE |
| epdg ike | 34 | 97.1 → 67.6 | IMS → MCO |

**Top-30 trap terms, excluding product names** (Jaccard-deduplicated; full table in Appendix B §8a and `trap_terms_top30.csv`):

| # | term | n | mis% A | mis% B | wrong-pull A → B |
|---:|---|---:|---:|---:|---|
| 1 | received | 127 | 74.0 | 61.4 | MDE → MDE |
| 2 | http | 98 | 82.7 | 61.2 | MDE → MDE |
| 3 | ike | 50 | 98.0 | 68.0 | IMS → MCO |
| 4 | nat44 | 50 | 94.0 | 61.2 | RAN → MCO |
| 5 | responses | 60 | 75.0 | 66.7 | MDE → MDE |
| 6 | ipsec | 55 | 85.5 | 60.0 | IMS → MCO |
| 7 | nat64 | 48 | 89.6 | 65.9 | RAN → MCO |
| 8 | notifications | 56 | 67.9 | 69.6 | MDE → PLATFORM |
| 9 | diamre | 26 | 100 | 100 | IMS → IMS |
| 10 | esp | 31 | 90.3 | 77.4 | IMS → MCO |
| 11 | requests | 143 | 58.7 | 39.2 | MDE → MDE |
| 12 | packets | 62 | 71.0 | 53.4 | IMS → MCO |
| 13 | kafka | 31 | 64.5 | 96.8 | PLATFORM → PLATFORM |
| 14 | error | 35 | 80.0 | 71.4 | PLATFORM → PLATFORM |
| 15 | i'm (template "I'm checking … Bring up") * | 43 | 74.4 | 60.5 | IMS → MCO |
| 16 | nat44 and nat64 | 30 | 93.3 | 65.5 | RAN → PLATFORM |
| 17 | ikev2 | 36 | 100 | 41.7 | IMS → MCO |
| 18 | transaction | 38 | 84.2 | 52.6 | IMS → MDE |
| 19 | responses received | 26 | 84.6 | 76.9 | MDE → MDE |
| 20 | sent | 53 | 62.3 | 54.7 | IMS → MCO |
| 21 | control | 23 | 87.0 | 78.3 | MCO → MCO |
| 22 | response | 48 | 64.6 | 54.2 | PLATFORM → PLATFORM |
| 23 | system | 42 | 76.2 | 47.6 | IMS → MDE |
| 24 | messages | 23 | 87.0 | 73.9 | MCO → MCO |
| 25 | received for requests | 17 | 100 | 88.2 | MDE → MDE |
| 26 | ipsec esp | 20 | 85.0 | 85.0 | IMS → MCO |
| 27 | like to check * | 68 | 55.9 | 50.0 | IMS → MCO |
| 28 | kafka notifications | 21 | 61.9 | 100 | PLATFORM → PLATFORM |
| 29 | http notifications | 21 | 95.2 | 61.9 | MDE → MDE |
| 30 | used * | 41 | 68.3 | 48.8 | RAN → MCO |

\* Template filler words. They are confounded with the measurement-request phrasing, which is concentrated in uncovered products, so don't write rules for them. Also add these counter fragments, which are significant (Appendix A §2): `INVALID_MSG_FORMAT` → MCO, `_SND_`/`_RCV_` → MCO/MDE, `NUM_…_RCVD`, `IKEV2` → IMS.

### 8b. Changes to the PACO description / routing prompt [HYPOTHESIS: I haven't seen your current prompts]

1. **Enumerate the products, not just the 3GPP NFs.** Add something like this:
   > paco_worker owns the Packet Core product family and everything about it (counters, KPIs, alarms, logs, configuration, troubleshooting): 5GC NFs (AMF, SMF, UPF, AUSF, UDM, UDR, UDSF, PCF/PCRF, NRF, NSSF, SCP, SEPP, NWDAF); EPC (MME, SAEGW/SGW/PGW); **ePDG** (SWu IKEv2/IPsec, S2b, SWm, GTPv2, APN, PDN, bearers); **Security Gateway SeGW / UAG-SEG** (IKEv2, IPsec ESP tunnels, SNMP real-time status, DIAMRE equipment-identity/EIR); **Media Engine (ME)** (NAT44/NAT64/CGNAT, GRE, PPTP, RTSP, FTP ALG, BFD, BGP, VRF, TCP Optimizer, pool/memory stats, syslog); **Provisioning Gateway (ProvGW)** (northbound/southbound HTTP, HTTP notifications, northbound Kafka notifications, DbGw/Couchbase, workflow services); **CCLB** and **MDPLB** load balancers.
2. **Counter-prefix rule:** "A counter beginning with `AUSF_`, `AMF_`, `EPDG_`, `PROVGW_`, `CCLB_`, `MDPLB_`, `DP_IPSEC_`, `NUM_IKEV2_`, `SEGW_`, `UAGU_` or `HTTP2_CLIENT_` → paco_worker, whatever words appear in the rest of the name (INVALID_MSG_FORMAT, SND, RCV, ERR…)."
3. **Product beats protocol:** "If the query names one of the products above, route to paco_worker even if it also mentions IPsec, IKE, ESP, tunnel, NAT, ports, GRE, HTTP status codes, Kafka, Diameter/DIAMRE, SCTP, SNMP, alarm, CPU, disk, memory, pod, database, configuration, SMS-over-NAS or subscriber context. Protocol words only break ties when *no* product or NF is named."
4. **Specific disambiguation rules** (each covers a measured trap):
   - *ePDG/SeGW + IKE/IPsec/ESP/tunnel* → paco (not IMS/MCO).
   - *Media Engine + NAT44/NAT64/ports/GRE/BFD/BGP* → paco (not RAN/MCO/Platform).
   - *Provisioning Gateway + HTTP 2xx/4xx/5xx/responses/notifications* → paco (not MDE).
   - *Provisioning Gateway or AUSF + Kafka* → paco (not Platform).
   - *AUSF + SEPP/security-edge-proxy* → paco (not MDE).
   - *AUSF/AMF/UDM + SMS/subscriber/SUPI/context/get_ausf_** → paco (not MCO).
   - *CCLB/MDPLB/NF counter + "per pod"/"spiked"/"busiest hour"* → paco (not Platform).
   - *PCF/PCC rule + CHF/charging* → paco (not MDE).
5. **Add few-shot examples** taken straight from the regression set (Appendix F), one per rule. In my experience few-shot examples usually generalise better than more description text [HYPOTHESIS].

### 8c. Changes to the competing agents [HYPOTHESIS: inferred from what each one attracts]

| agent | apparent scope [guess] | add this negative rule |
|---|---|---|
| MCO | messaging (SMS/MMS/SMSC/MMSC) | "Only SMS/MMS/RCS messaging platforms. Generic words such as message, malformed, invalid format, control, packets or security are **not** messaging. Never claim ePDG, SeGW, Media Engine, AUSF or ProvGW queries." This is the highest-value fix: 222 catch-all misroutes in B. |
| Platform | NFV/K8s infrastructure | "Only infrastructure with **no NF or product named** (hosts, NFV alarms, cluster, storage). Kafka notifications, per-pod breakdowns of NF counters and peer-VNF measurement groups of a named product are not Platform." |
| MDE | mediation/charging data (guess) | "HTTP response codes, notification and subscription counters of Provisioning Gateway, AUSF or SEPP belong to paco_worker." |
| IMS | IMS core (CSCF/TAS/HSS-Cx/SIP) | "IKEv2/IPsec/ESP tunnels of ePDG or SeGW, and DIAMRE interfaces on SeGW/ePDG (S13, SWm), belong to paco_worker. Claim only when SIP/CSCF/TAS/IMS service is the subject." |
| RAN | radio | B already fixed this (212 → 9). Keep "NAT/ports/memory" out of RAN. |
| CMS | configuration management | "Questions about how to view or inspect a specific product's configuration (SeGW, ME, ePDG, AUSF) go to that product's worker. CMS only handles CMS-tool operations." |

### 8d. 100-query regression set [FACT: selection; file `regression_test_set_100.csv`, Appendix F]

- Taken only from persistently-wrong (59) and regressed (41) rows.
- Stratified by category: C3 35, C2 28, C4 16, C1 15, C5 6.
- Within each category, picks rotate across (family × wrong destination) cells, with regressions first, then highest confidence.
- Coverage by family: peer-VNF 16, Media Engine 12, ePDG 12, AUSF 10, SeGW 10, ProvGW 8, UDM 7, MME 4, plus every smaller family.
- **Add negative controls before you trust any score.** This set has only expected = PACO rows. Add about 50 true IMS, MCO, Platform, MDE, RAN and CMS queries that use the same trap terms: SIP/IPsec for IMS, SMS for MCO, NFV alarms for Platform, and so on. Without them, a router that sends everything to PACO scores 100%.

## Files

All files are in `/tmp/claude-0/-home-user-K8s/1e1041e0-4bbb-58c8-a2e9-c16d6f79c195/scratchpad/`:
- `per_query_analysis.csv` — all 1,999 rows: row, query, product family, A and B pick, confidence and verdict, segment, root-cause category, regression cause, matched trap terms, mislabel cue, in-test-set flag.
- `regression_test_set_100.csv`, `regressions_107.csv`, `mislabel_candidates.csv`, `peer_vnf_ownership_review.csv`, `trap_terms_top30.csv`, `logodds_all.csv`.
- `scripts/` — `load.py`, `analysis.py`, `part2.py`, `appendix.py`. These are also reproduced in Appendix G.

---
# Appendices (machine-generated; every number comes from the scripts in Appendix G)
## Appendix A — Sections 0-5 full output
## 0. Reconciliation
Run A: right=1072 wrong=927 error=0 total=1999 acc_all=53.63% acc_excl_err=53.63%
Run B: right=1350 wrong=640 error=9 total=1999 acc_all=67.53% acc_excl_err=67.84%
Run B error rows: [1244, 1248, 1257, 1269, 1292, 1296, 1299, 1304, 1310]
### A.1. Segments
| segment            |   count |   %of1999 |   %of1990 |
|:-------------------|--------:|----------:|----------:|
| persistently right |     959 |     47.97 |     48.19 |
| persistently wrong |     533 |     26.66 |     26.78 |
| fixed              |     391 |     19.56 |     19.65 |
| regressed          |     107 |      5.35 |      5.38 |
| excluded (B error) |       9 |      0.45 |      0.45 |

Error rows (excluded) — their Run A pick:
|   Excel Row | pickA   | Query                                                                                                                                          |
|------------:|:--------|:-----------------------------------------------------------------------------------------------------------------------------------------------|
|        1244 | MCO     | Please check the measurements associated with packets dropped due to "ACL denial" in Media Engine NAT64, covering the last 2 days.             |
|        1248 | PACO    | I'd like the last 2 days of measurements for packets dropped due to "inability to create new address mapping" from Media Engine NAT64.         |
|        1257 | IMS     | I'd like to check Usupported L4 protocols in Media Engine NAT64 Drop. Retrieve its readings for the last 2 days.                               |
|        1269 | PACO    | I'd like to check address_map_failure_drops in Media Engine Pool Stats. Retrieve its readings for the last 2 days.                             |
|        1292 | PACO    | Can you check UDP packets dropped with source or destination port as zero in Media Engine Security over the last 2 days?                       |
|        1296 | IMS     | I need to review syslog records produced locally in Media Engine Syslog Logging; show the measurements for the past 2 days.                    |
|        1299 | PACO    | I need the recorded mem_mgr_max_alloc_cnt_ip4_pkt_pool samples from Media Engine TCP Optimizer for the last 2 days.                            |
|        1304 | PACO    | What do the available Media Engine TCP Optimizer measurements show for TCP light weight flows converted into TCP flows during the last 2 days? |
|        1310 | PACO    | Can you check packets dropped due to "unavailability of ports" in Media Engine TCP for both NAT44 and NAT64 over the last 2 days?              |

### A.2. Over-represented n-grams per wrong destination (smoothed log-odds, Jeffreys prior, min support 8; baseline = queries correctly routed to PACO in the same run)
### Run A -> IMS (n misrouted=338)
| term                                |   n_misrouted |   n_correct(PACO) |   lift |   log_odds |     z | dest   | shared_vocab   |
|:------------------------------------|--------------:|------------------:|-------:|-----------:|------:|:-------|:---------------|
| segw                                |           111 |                31 |  11.18 |       2.79 | 12.98 | IMS    |                |
| epdg                                |           113 |                85 |   4.19 |       1.76 | 10.93 | IMS    |                |
| ipsec                               |            47 |                 8 |  17.54 |       3.02 |  7.97 | IMS    | YES            |
| peer-vnf platform                   |            39 |                16 |   7.5  |       2.13 |  7.1  | IMS    |                |
| platform                            |            40 |                18 |   6.86 |       2.05 |  7.1  | IMS    |                |
| peer-vnf                            |            41 |                24 |   5.31 |       1.79 |  6.79 | IMS    |                |
| ctr:ikev2                           |            31 |                 2 |  39.33 |       3.78 |  5.73 | IMS    |                |
| ike                                 |            44 |                 1 |  93.03 |       4.68 |  5.62 | IMS    | YES            |
| segw ipsec                          |            22 |                 4 |  15.51 |       2.83 |  5.43 | IMS    | YES            |
| ctr:num                             |            23 |                 3 |  20.84 |       3.13 |  5.42 | IMS    |                |
| esp                                 |            20 |                 3 |  18.12 |       2.98 |  5.12 | IMS    |                |
| epdg ike                            |            29 |                 1 |  61.32 |       4.22 |  5.03 | IMS    | YES            |
| epdg ipsec                          |            18 |                 4 |  12.69 |       2.62 |  4.94 | IMS    | YES            |
| ctr:reason                          |            18 |                 6 |   8.78 |       2.25 |  4.88 | IMS    |                |
| timestamped                         |            30 |                28 |   3.34 |       1.29 |  4.8  | IMS    |                |
| ipsec esp                           |            17 |                 3 |  15.4  |       2.81 |  4.77 | IMS    | YES            |
| segw ipsec esp                      |            17 |                 3 |  15.4  |       2.81 |  4.77 | IMS    | YES            |
| timestamped measurements concerning |            18 |                 9 |   6.01 |       1.87 |  4.62 | IMS    |                |
| checking                            |            20 |                13 |   4.7  |       1.62 |  4.55 | IMS    |                |
| tunnel                              |            15 |                 3 |  13.59 |       2.68 |  4.51 | IMS    | YES            |

### Run A -> RAN (n misrouted=212)
| term                |   n_misrouted |   n_correct(PACO) |   lift |   log_odds |     z | dest   | shared_vocab   |
|:--------------------|--------------:|------------------:|-------:|-----------:|------:|:-------|:---------------|
| media               |            84 |                43 |   9.76 |       2.74 | 13.15 | RAN    |                |
| engine              |            84 |                43 |   9.76 |       2.74 | 13.15 | RAN    |                |
| media engine        |            84 |                43 |   9.76 |       2.74 | 13.15 | RAN    |                |
| nat64               |            23 |                 5 |  21.15 |       3.18 |  6.62 | RAN    |                |
| nat44               |            25 |                 3 |  36.12 |       3.73 |  6.48 | RAN    |                |
| both                |            17 |                 6 |  13.22 |       2.69 |  5.77 | RAN    |                |
| memory              |            15 |                 4 |  16.86 |       2.93 |  5.41 | RAN    |                |
| nat44 and nat64     |            17 |                 2 |  34.38 |       3.65 |  5.36 | RAN    |                |
| both nat44          |            17 |                 2 |  34.38 |       3.65 |  5.36 | RAN    |                |
| epdg                |            39 |                85 |   2.31 |       0.97 |  4.62 | RAN    |                |
| statistics          |             9 |                 2 |  18.2  |       3    |  4.19 | RAN    |                |
| authentication      |            29 |                61 |   2.38 |       0.97 |  4.09 | RAN    | YES            |
| ports               |             9 |                 1 |  30.34 |       3.51 |  3.98 | RAN    |                |
| media engine nat44  |             8 |                 1 |  26.97 |       3.39 |  3.81 | RAN    |                |
| distinguish         |             8 |                 5 |   7.36 |       2.09 |  3.78 | RAN    |                |
| transaction         |             8 |                 6 |   6.22 |       1.92 |  3.65 | RAN    |                |
| system              |             9 |                10 |   4.33 |       1.55 |  3.42 | RAN    |                |
| media engine memory |            12 |                 0 | 121.36 |       4.9  |  3.39 | RAN    |                |
| pool                |             8 |                 8 |   4.76 |       1.65 |  3.36 | RAN    |                |
| used                |            10 |                13 |   3.75 |       1.4  |  3.35 | RAN    |                |

### Run A -> MCO (n misrouted=124)
| term                            |   n_misrouted |   n_correct(PACO) |   lift |   log_odds |    z | dest   | shared_vocab   |
|:--------------------------------|--------------:|------------------:|-------:|-----------:|-----:|:-------|:---------------|
| platform                        |            23 |                18 |  10.75 |       2.58 | 7.87 | MCO    |                |
| peer-vnf platform               |            22 |                16 |  11.53 |       2.64 | 7.77 | MCO    |                |
| peer-vnf                        |            24 |                24 |   8.47 |       2.34 | 7.71 | MCO    |                |
| ctr:sent                        |            16 |                 8 |  16.27 |       2.95 | 6.79 | MCO    |                |
| http                            |            18 |                17 |   8.89 |       2.35 | 6.74 | MCO    | YES            |
| provisioning gateway            |            16 |                12 |  11.07 |       2.56 | 6.59 | MCO    |                |
| media                           |            24 |                43 |   4.77 |       1.75 | 6.41 | MCO    |                |
| media engine                    |            23 |                43 |   4.57 |       1.7  | 6.16 | MCO    |                |
| ctr:provgw                      |            13 |                 5 |  20.43 |       3.16 | 6.12 | MCO    |                |
| ctr:http                        |            13 |                 8 |  13.22 |       2.72 | 6.05 | MCO    | YES            |
| ctr:snd                         |            22 |                 1 | 126.8  |       5.06 | 5.95 | MCO    |                |
| northbound                      |            13 |                11 |   9.77 |       2.41 | 5.84 | MCO    |                |
| northbound http                 |            11 |                 3 |  27.17 |       3.43 | 5.55 | MCO    | YES            |
| gateway northbound http         |            11 |                 3 |  27.17 |       3.43 | 5.55 | MCO    | YES            |
| provisioning gateway northbound |            12 |                11 |   9.02 |       2.33 | 5.54 | MCO    |                |
| ctr:response                    |            10 |                 4 |  19.21 |       3.08 | 5.39 | MCO    | YES            |
| gtpv2                           |            10 |                 4 |  19.21 |       3.08 | 5.39 | MCO    |                |
| ctr:nb                          |            11 |                 2 |  38.04 |       3.77 | 5.35 | MCO    |                |
| epdg gtpv2                      |            10 |                 3 |  24.7  |       3.33 | 5.33 | MCO    |                |
| messages                        |             9 |                 3 |  22.23 |       3.22 | 5.09 | MCO    |                |

### Run A -> MDE (n misrouted=118)
| term                            |   n_misrouted |   n_correct(PACO) |   lift |   log_odds |     z | dest   | shared_vocab   |
|:--------------------------------|--------------:|------------------:|-------:|-----------:|------:|:-------|:---------------|
| gateway                         |            79 |                24 |  29.29 |       4.46 | 15.79 | MDE    |                |
| provisioning                    |            74 |                13 |  49.8  |       4.88 | 14.65 | MDE    |                |
| provisioning gateway            |            73 |                12 |  53.05 |       4.92 | 14.41 | MDE    |                |
| http                            |            59 |                17 |  30.63 |       4.1  | 13.54 | MDE    | YES            |
| responses                       |            31 |                15 |  18.17 |       3.2  |  9.71 | MDE    |                |
| requests                        |            39 |                59 |   5.95 |       2.14 |  9.05 | MDE    |                |
| received                        |            29 |                33 |   7.86 |       2.33 |  8.44 | MDE    |                |
| ctr:http                        |            23 |                 8 |  24.58 |       3.43 |  8.28 | MDE    | YES            |
| ctr:provgw                      |            24 |                 5 |  39.64 |       3.92 |  8.1  | MDE    |                |
| notifications                   |            23 |                18 |  11.29 |       2.64 |  8.04 | MDE    |                |
| ctr:rcv                         |            24 |                 4 |  48.45 |       4.12 |  7.86 | MDE    |                |
| ctr:response                    |            21 |                 4 |  42.4  |       3.96 |  7.48 | MDE    | YES            |
| responses received              |            18 |                 4 |  36.34 |       3.78 |  7.05 | MDE    |                |
| northbound                      |            16 |                11 |  12.64 |       2.7  |  6.78 | MDE    |                |
| gateway northbound              |            16 |                11 |  12.64 |       2.7  |  6.78 | MDE    |                |
| provisioning gateway northbound |            16 |                11 |  12.64 |       2.7  |  6.78 | MDE    |                |
| gateway northbound http         |            12 |                 3 |  31.15 |       3.58 |  5.84 | MDE    | YES            |
| provisioning gateway http       |            19 |                 1 | 115.07 |       4.94 |  5.79 | MDE    | YES            |
| http notifications              |            19 |                 1 | 115.07 |       4.94 |  5.79 | MDE    | YES            |
| gateway http notifications      |            19 |                 1 | 115.07 |       4.94 |  5.79 | MDE    | YES            |

### Run A -> PLATFORM (n misrouted=93)
| term                            |   n_misrouted |   n_correct(PACO) |   lift |   log_odds |     z | dest     | shared_vocab   |
|:--------------------------------|--------------:|------------------:|-------:|-----------:|------:|:---------|:---------------|
| platform                        |            39 |                18 |  24.3  |       3.72 | 11.85 | PLATFORM |                |
| peer-vnf platform               |            37 |                16 |  25.85 |       3.75 | 11.52 | PLATFORM |                |
| provisioning gateway            |            12 |                12 |  11.07 |       2.57 |  6.17 | PLATFORM |                |
| network                         |            10 |                 6 |  17.73 |       3.03 |  5.91 | PLATFORM |                |
| notification                    |            10 |                 6 |  17.73 |       3.03 |  5.91 | PLATFORM |                |
| error                           |            10 |                 7 |  15.37 |       2.88 |  5.87 | PLATFORM | YES            |
| received                        |            16 |                33 |   5.51 |       1.89 |  5.85 | PLATFORM |                |
| kafka                           |             9 |                11 |   9.02 |       2.34 |  5.17 | PLATFORM | YES            |
| nodes                           |            10 |                 1 |  76.85 |       4.5  |  5.11 | PLATFORM |                |
| kafka notifications             |             8 |                 8 |  10.85 |       2.52 |  5.06 | PLATFORM | YES            |
| northbound kafka notifications  |             8 |                 8 |  10.85 |       2.52 |  5.06 | PLATFORM | YES            |
| gateway northbound kafka        |             8 |                 8 |  10.85 |       2.52 |  5.06 | PLATFORM | YES            |
| provisioning gateway northbound |             8 |                11 |   8.02 |       2.22 |  4.76 | PLATFORM |                |
| response                        |             9 |                17 |   5.93 |       1.91 |  4.57 | PLATFORM | YES            |
| failure                         |            11 |                29 |   4.3  |       1.6  |  4.36 | PLATFORM | YES            |
| received from kafka             |             8 |                 0 | 184.43 |       5.36 |  3.67 | PLATFORM | YES            |
| network notification            |             8 |                 0 | 184.43 |       5.36 |  3.67 | PLATFORM |                |
| notification request            |             8 |                 0 | 184.43 |       5.36 |  3.67 | PLATFORM | YES            |
| network notification request    |             8 |                 0 | 184.43 |       5.36 |  3.67 | PLATFORM | YES            |
| kafka nodes                     |             8 |                 0 | 184.43 |       5.36 |  3.67 | PLATFORM | YES            |

### Run A -> CMS (n misrouted=42)
| term          |   n_misrouted |   n_correct(PACO) |   lift |   log_odds |     z | dest   | shared_vocab   |
|:--------------|--------------:|------------------:|-------:|-----------:|------:|:-------|:---------------|
| configuration |            23 |                20 |  28.64 |       4.13 | 10.89 | CMS    | YES            |
| media         |            14 |                43 |   8.21 |       2.49 |  6.95 | CMS    |                |
| media engine  |            13 |                43 |   7.63 |       2.38 |  6.56 | CMS    |                |
| configured    |            11 |                36 |   7.69 |       2.34 |  6.1  | CMS    |                |

### Run B -> IMS (n misrouted=118)
| term                     |   n_misrouted |   n_correct(PACO) |   lift |   log_odds |     z | dest   | shared_vocab   |
|:-------------------------|--------------:|------------------:|-------:|-----------:|------:|:-------|:---------------|
| peer-vnf                 |            35 |                10 |  38.14 |       3.99 | 10.83 | IMS    |                |
| platform                 |            34 |                 6 |  59.84 |       4.44 | 10.04 | IMS    |                |
| peer-vnf platform        |            33 |                 4 |  83.9  |       4.76 |  9.26 | IMS    |                |
| ctr:num                  |            18 |                 7 |  27.46 |       3.5  |  7.85 | IMS    |                |
| ctr:rcvd                 |            14 |                 5 |  29.12 |       3.52 |  6.9  | IMS    |                |
| ctr:resp                 |            13 |                 4 |  33.05 |       3.65 |  6.58 | IMS    |                |
| ctr:ikev2                |            14 |                20 |   7.81 |       2.2  |  6.14 | IMS    |                |
| reported <COUNTER>       |            13 |                17 |   8.5  |       2.28 |  6.06 | IMS    |                |
| segw                     |            28 |                94 |   3.39 |       1.43 |  5.97 | IMS    |                |
| epdg ike                 |            11 |                11 |  10.94 |       2.52 |  5.88 | IMS    | YES            |
| ike                      |            12 |                16 |   8.32 |       2.25 |  5.8  | IMS    | YES            |
| ctr:with                 |            13 |                 1 |  99.15 |       4.75 |  5.48 | IMS    |                |
| ctr:reason               |            10 |                14 |   7.89 |       2.19 |  5.24 | IMS    |                |
| reported                 |            15 |                38 |   4.46 |       1.63 |  5.13 | IMS    |                |
| checking                 |            10 |                19 |   5.87 |       1.89 |  4.77 | IMS    |                |
| interface                |            16 |                50 |   3.62 |       1.42 |  4.72 | IMS    | YES            |
| diamre                   |            22 |                 0 | 503.39 |       6.45 |  4.5  | IMS    |                |
| platform diamre          |            16 |                 0 | 366.1  |       6.07 |  4.22 | IMS    |                |
| peer-vnf platform diamre |            16 |                 0 | 366.1  |       6.07 |  4.22 | IMS    |                |
| ctr:rc                   |            10 |                 0 | 228.81 |       5.57 |  3.84 | IMS    |                |

### Run B -> RAN (n misrouted=9)
_no term reaches support >= 8_

### Run B -> MCO (n misrouted=262)
| term                  |   n_misrouted |   n_correct(PACO) |   lift |   log_odds |     z | dest   | shared_vocab   |
|:----------------------|--------------:|------------------:|-------:|-----------:|------:|:-------|:---------------|
| media                 |            80 |                82 |   5    |       1.91 | 10.91 | MCO    |                |
| media engine          |            78 |                82 |   4.87 |       1.88 | 10.66 | MCO    |                |
| peer-vnf              |            23 |                10 |  11.29 |       2.53 |  6.69 | MCO    |                |
| platform              |            20 |                 6 |  15.85 |       2.86 |  6.28 | MCO    |                |
| peer-vnf platform     |            19 |                 4 |  21.76 |       3.18 |  6.02 | MCO    |                |
| packets               |            26 |                27 |   4.87 |       1.69 |  5.99 | MCO    |                |
| esp                   |            18 |                 7 |  12.37 |       2.61 |  5.95 | MCO    |                |
| ike                   |            21 |                16 |   6.56 |       1.97 |  5.9  | MCO    | YES            |
| ipsec                 |            23 |                22 |   5.27 |       1.76 |  5.79 | MCO    | YES            |
| ctr:snd               |            14 |                 6 |  11.1  |       2.49 |  5.22 | MCO    |                |
| control               |            13 |                 5 |  12.18 |       2.58 |  5.06 | MCO    |                |
| messages              |            13 |                 6 |  10.31 |       2.42 |  5.01 | MCO    |                |
| segw ipsec            |            13 |                 7 |   8.93 |       2.27 |  4.93 | MCO    | YES            |
| ipsec esp             |            12 |                 3 |  17.67 |       2.96 |  4.86 | MCO    | YES            |
| segw ipsec esp        |            12 |                 3 |  17.67 |       2.96 |  4.86 | MCO    | YES            |
| security              |            13 |                 9 |   7.05 |       2.03 |  4.74 | MCO    |                |
| ctr:format            |            12 |                 2 |  24.73 |       3.29 |  4.73 | MCO    |                |
| engine security       |            12 |                 2 |  24.73 |       3.29 |  4.73 | MCO    |                |
| ctr:msg               |            12 |                 2 |  24.73 |       3.29 |  4.73 | MCO    |                |
| media engine security |            12 |                 2 |  24.73 |       3.29 |  4.73 | MCO    |                |

### Run B -> MDE (n misrouted=94)
| term                            |   n_misrouted |   n_correct(PACO) |   lift |   log_odds |     z | dest   | shared_vocab   |
|:--------------------------------|--------------:|------------------:|-------:|-----------:|------:|:-------|:---------------|
| gateway                         |            51 |                56 |  12.96 |       3.3  | 13.38 | MDE    |                |
| provisioning gateway            |            46 |                36 |  18.1  |       3.54 | 13.36 | MDE    |                |
| http                            |            39 |                38 |  14.55 |       3.19 | 12.05 | MDE    | YES            |
| responses                       |            28 |                20 |  19.62 |       3.33 | 10.53 | MDE    |                |
| requests                        |            32 |                87 |   5.25 |       2.02 |  8.3  | MDE    |                |
| received                        |            24 |                49 |   6.96 |       2.21 |  8.03 | MDE    |                |
| responses received              |            16 |                 6 |  35.35 |       3.77 |  7.9  | MDE    |                |
| northbound                      |            15 |                 6 |  33.14 |       3.7  |  7.68 | MDE    |                |
| provisioning gateway northbound |            15 |                 6 |  33.14 |       3.7  |  7.68 | MDE    |                |
| provisioning gateway southbound |            16 |                18 |  12.42 |       2.72 |  7.59 | MDE    |                |
| southbound http                 |            15 |                14 |  14.86 |       2.89 |  7.54 | MDE    | YES            |
| gateway southbound http         |            15 |                14 |  14.86 |       2.89 |  7.54 | MDE    | YES            |
| notifications                   |            15 |                17 |  12.31 |       2.7  |  7.34 | MDE    |                |
| gateway northbound http         |            12 |                 6 |  26.51 |       3.44 |  6.94 | MDE    | YES            |
| http notifications              |            12 |                 8 |  20.28 |       3.18 |  6.92 | MDE    | YES            |
| gateway http                    |            12 |                 8 |  20.28 |       3.18 |  6.92 | MDE    | YES            |
| gateway http notifications      |            12 |                 8 |  20.28 |       3.18 |  6.92 | MDE    | YES            |
| provisioning gateway http       |            12 |                 8 |  20.28 |       3.18 |  6.92 | MDE    | YES            |
| received for requests           |            15 |                 2 |  86.17 |       4.66 |  6.73 | MDE    |                |
| peer-vnf                        |             9 |                10 |  12.31 |       2.65 |  5.75 | MDE    |                |

### Run B -> PLATFORM (n misrouted=147)
| term                            |   n_misrouted |   n_correct(PACO) |   lift |   log_odds |     z | dest     | shared_vocab   |
|:--------------------------------|--------------:|------------------:|-------:|-----------:|------:|:---------|:---------------|
| peer-vnf                        |            63 |                10 |  55.1  |       4.56 | 12.98 | PLATFORM |                |
| platform                        |            64 |                 6 |  90.42 |       5.07 | 11.89 | PLATFORM |                |
| peer-vnf platform               |            62 |                 4 | 126.53 |       5.39 | 10.76 | PLATFORM |                |
| northbound                      |            19 |                 6 |  26.84 |       3.45 |  7.46 | PLATFORM |                |
| notifications                   |            20 |                17 |  10.5  |       2.51 |  7.4  | PLATFORM |                |
| provisioning gateway northbound |            18 |                 6 |  25.43 |       3.39 |  7.28 | PLATFORM |                |
| provisioning gateway            |            24 |                36 |   6.04 |       1.97 |  7.08 | PLATFORM |                |
| received                        |            24 |                49 |   4.45 |       1.65 |  6.25 | PLATFORM |                |
| notification                    |            13 |                 5 |  21.71 |       3.2  |  6.23 | PLATFORM |                |
| kafka                           |            25 |                 1 | 153.06 |       5.23 |  6.19 | PLATFORM | YES            |
| network                         |            13 |                 9 |  12.57 |       2.65 |  6.12 | PLATFORM |                |
| ctr:rcvd                        |            10 |                 5 |  16.7  |       2.93 |  5.48 | PLATFORM |                |
| error                           |            11 |                10 |   9.62 |       2.38 |  5.45 | PLATFORM | YES            |
| nodes                           |            10 |                 2 |  36.73 |       3.72 |  5.24 | PLATFORM |                |
| database                        |             9 |                 8 |   9.72 |       2.38 |  4.96 | PLATFORM | YES            |
| nat44                           |            12 |                19 |   5.65 |       1.84 |  4.93 | PLATFORM |                |
| code                            |             8 |                 4 |  16.33 |       2.9  |  4.92 | PLATFORM |                |
| nat64                           |            10 |                15 |   5.92 |       1.88 |  4.6  | PLATFORM |                |
| nat44 and nat64                 |             8 |                10 |   7    |       2.05 |  4.37 | PLATFORM |                |
| northbound kafka                |            19 |                 0 | 348.98 |       6.02 |  4.19 | PLATFORM | YES            |

### Run B -> CMS (n misrouted=10)
_no term reaches support >= 8_

### A.3. Query-structure features vs misroute rate
| feature                                                                        | present   |   n(A) |   misroute% A |   n(B, excl err) |   misroute% B |
|:-------------------------------------------------------------------------------|:----------|-------:|--------------:|-----------------:|--------------:|
| has counter name (UPPER_SNAKE)                                                 | yes       |    725 |          29   |              725 |          22.5 |
| has counter name (UPPER_SNAKE)                                                 | no        |   1274 |          56.3 |             1265 |          37.7 |
| template: "last/past 2 days" measurement fetch                                 | yes       |    972 |          63.5 |              963 |          47   |
| template: "last/past 2 days" measurement fetch                                 | no        |   1027 |          30.2 |             1027 |          18.2 |
| question (ends with ?)                                                         | yes       |   1034 |          44.5 |             1031 |          30.6 |
| question (ends with ?)                                                         | no        |    965 |          48.4 |              959 |          33.8 |
| imperative start (Show/Get/Fetch/Pull/Retrieve/Plot/Break/Compare/Investigate) | yes       |    939 |          52.6 |              931 |          39.3 |
| imperative start (Show/Get/Fetch/Pull/Retrieve/Plot/Break/Compare/Investigate) | no        |   1060 |          40.8 |             1059 |          25.9 |
| how/which/what documented-procedure question                                   | yes       |    221 |          70.6 |              221 |          39.4 |
| how/which/what documented-procedure question                                   | no        |   1778 |          43.4 |             1769 |          31.3 |
| troubleshoot verb (check/investigate/why/fails/RCA/root cause)                 | yes       |    272 |          52.9 |              272 |          32.7 |
| troubleshoot verb (check/investigate/why/fails/RCA/root cause)                 | no        |   1727 |          45.3 |             1718 |          32.1 |
| explicit PACO policy component (PCF/PCRF/PCC/policy/charging/Gx/Rx/Sy/N7)      | yes       |     71 |          39.4 |               71 |          19.7 |
| explicit PACO policy component (PCF/PCRF/PCC/policy/charging/Gx/Rx/Sy/N7)      | no        |   1928 |          46.6 |             1919 |          32.6 |
| names a 5GC/EPC NF (AMF/SMF/UPF/AUSF/UDM/UDR/NRF/MME/PCF/NSSF)                 | yes       |    841 |          15   |              841 |          10.6 |
| names a 5GC/EPC NF (AMF/SMF/UPF/AUSF/UDM/UDR/NRF/MME/PCF/NSSF)                 | no        |   1158 |          69.2 |             1149 |          48   |
| names IMS-flavoured term (SIP/P-CSCF/IKE/IPsec/ePDG/VoWiFi/Rx)                 | yes       |    393 |          76.3 |              393 |          38.7 |
| names IMS-flavoured term (SIP/P-CSCF/IKE/IPsec/ePDG/VoWiFi/Rx)                 | no        |   1606 |          39   |             1597 |          30.6 |
| names RAN-flavoured term (radio/RAN/gNB/eNB/handover/paging/NAT/ports)         | yes       |    131 |          62.6 |              126 |          43.7 |
| names RAN-flavoured term (radio/RAN/gNB/eNB/handover/paging/NAT/ports)         | no        |   1868 |          45.2 |             1864 |          31.4 |
| names platform/infra term (NFV/pod/disk/CPU/alarm/VNF/kafka/database)          | yes       |    331 |          63.1 |              331 |          61.9 |
| names platform/infra term (NFV/pod/disk/CPU/alarm/VNF/kafka/database)          | no        |   1668 |          43   |             1659 |          26.2 |
| names HTTP status / REST (4xx/5xx/HTTP)                                        | yes       |    132 |          68.2 |              132 |          51.5 |
| names HTTP status / REST (4xx/5xx/HTTP)                                        | no        |   1867 |          44.8 |             1858 |          30.8 |
| mentions configuration/config/show command                                     | yes       |    116 |          48.3 |              116 |          25   |
| mentions configuration/config/show command                                     | no        |   1883 |          46.3 |             1874 |          32.6 |
| length <=14 words                                                              | yes       |    493 |          32.7 |              493 |          20.9 |
| length <=14 words                                                              | no        |   1506 |          50.9 |             1497 |          35.9 |
| length 15-20 words                                                             | yes       |    903 |          45.1 |              900 |          32.3 |
| length 15-20 words                                                             | no        |   1096 |          47.4 |             1090 |          32   |
| length >20 words                                                               | yes       |    603 |          59.5 |              597 |          41.2 |
| length >20 words                                                               | no        |   1396 |          40.7 |             1393 |          28.3 |

### Misroute rate and destination by product family (the dominant variable)
#### Run A
| fam                   |   CMS |   IMS |   MCO |   MDE |   PACO |   PLATFORM |   RAN |   n |   wrong |   misroute% | top wrong dest   |
|:----------------------|------:|------:|------:|------:|-------:|-----------:|------:|----:|--------:|------------:|:-----------------|
| ePDG                  |     5 |   114 |    27 |    23 |     86 |          4 |    44 | 303 |     217 |        71.6 | IMS              |
| Media Engine          |    14 |    34 |    27 |     5 |     70 |          6 |    84 | 240 |     170 |        70.8 | RAN              |
| SeGW                  |     7 |   112 |     7 |     1 |     31 |          6 |    12 | 176 |     145 |        82.4 | IMS              |
| peer-VNF platform     |     0 |    41 |    24 |     6 |     24 |         37 |     8 | 140 |     116 |        82.9 | IMS              |
| Provisioning Gateway  |     2 |     1 |    16 |    74 |     12 |         12 |     2 | 119 |     107 |        89.9 | MDE              |
| AUSF                  |     3 |    15 |     5 |     1 |    377 |          5 |    41 | 447 |      70 |        15.7 | RAN              |
| UDM/UDR/UDSF          |     1 |     4 |     3 |     5 |     19 |         10 |    11 |  53 |      34 |        64.2 | RAN              |
| PCF/PCRF/policy       |     1 |     7 |     0 |     3 |     22 |          0 |     2 |  35 |      13 |        37.1 | IMS              |
| CCLB                  |     0 |     0 |    12 |     0 |     44 |          0 |     0 |  56 |      12 |        21.4 | MCO              |
| NFV platform (infra)  |     3 |     3 |     0 |     0 |     16 |          6 |     0 |  28 |      12 |        42.9 | PLATFORM         |
| MME                   |     5 |     3 |     1 |     0 |     96 |          0 |     0 | 105 |       9 |         8.6 | CMS              |
| SMF/UPF/PDU session   |     0 |     1 |     0 |     0 |     56 |          2 |     2 |  61 |       5 |         8.2 | PLATFORM         |
| AMF                   |     1 |     0 |     1 |     0 |    107 |          0 |     2 | 111 |       4 |         3.6 | RAN              |
| MTCIL / observability |     0 |     2 |     1 |     0 |      1 |          0 |     0 |   4 |       3 |        75   | IMS              |
| Lawful Intercept      |     0 |     1 |     0 |     0 |      0 |          0 |     2 |   3 |       3 |       100   | RAN              |
| Unidentified          |     0 |     0 |     0 |     0 |      0 |          2 |     0 |   2 |       2 |       100   | PLATFORM         |
| Service mesh / mTLS   |     0 |     0 |     0 |     0 |      1 |          2 |     0 |   3 |       2 |        66.7 | PLATFORM         |
| NRF/NSSF/SCP/SEPP     |     0 |     0 |     0 |     0 |     27 |          1 |     0 |  28 |       1 |         3.6 | PLATFORM         |
| MDPLB                 |     0 |     0 |     0 |     0 |     82 |          0 |     1 |  83 |       1 |         1.2 | RAN              |
| Subscriber migration  |     0 |     0 |     0 |     0 |      0 |          0 |     1 |   1 |       1 |       100   | RAN              |
| Generic HTTP2 counter |     0 |     0 |     0 |     0 |      1 |          0 |     0 |   1 |       0 |         0   | CMS              |

#### Run B
| fam                   |   CMS |   IMS |   MCO |   MDE |   PACO |   PLATFORM |   RAN |   n |   wrong |   misroute% | top wrong dest   |
|:----------------------|------:|------:|------:|------:|-------:|-----------:|------:|----:|--------:|------------:|:-----------------|
| peer-VNF platform     |     0 |    35 |    23 |     9 |     10 |         63 |     0 | 140 |     130 |        92.9 | PLATFORM         |
| Media Engine          |     3 |    10 |    82 |     9 |    110 |         15 |     2 | 231 |     121 |        52.4 | MCO              |
| ePDG                  |     0 |    23 |    52 |    19 |    202 |          7 |     0 | 303 |     101 |        33.3 | MCO              |
| Provisioning Gateway  |     1 |     1 |    10 |    46 |     37 |         24 |     0 | 119 |      82 |        68.9 | MDE              |
| SeGW                  |     5 |    28 |    42 |     2 |     94 |          4 |     1 | 176 |      82 |        46.6 | MCO              |
| AUSF                  |     0 |    12 |    36 |     6 |    381 |          9 |     3 | 447 |      66 |        14.8 | MCO              |
| UDM/UDR/UDSF          |     0 |     1 |     6 |     1 |     39 |          6 |     0 |  53 |      14 |        26.4 | MCO              |
| NFV platform (infra)  |     0 |     0 |     1 |     1 |     19 |          7 |     0 |  28 |       9 |        32.1 | PLATFORM         |
| PCF/PCRF/policy       |     0 |     1 |     4 |     1 |     29 |          0 |     0 |  35 |       6 |        17.1 | MCO              |
| SMF/UPF/PDU session   |     0 |     0 |     1 |     0 |     55 |          5 |     0 |  61 |       6 |         9.8 | PLATFORM         |
| MME                   |     1 |     3 |     1 |     0 |    100 |          0 |     0 | 105 |       5 |         4.8 | IMS              |
| CCLB                  |     0 |     0 |     0 |     0 |     51 |          5 |     0 |  56 |       5 |         8.9 | PLATFORM         |
| AMF                   |     0 |     1 |     1 |     0 |    107 |          0 |     2 | 111 |       4 |         3.6 | RAN              |
| MDPLB                 |     0 |     3 |     0 |     0 |     80 |          0 |     0 |  83 |       3 |         3.6 | IMS              |
| MTCIL / observability |     0 |     0 |     2 |     0 |      2 |          0 |     0 |   4 |       2 |        50   | MCO              |
| Unidentified          |     0 |     0 |     0 |     0 |      0 |          2 |     0 |   2 |       2 |       100   | PLATFORM         |
| Subscriber migration  |     0 |     0 |     0 |     0 |      0 |          0 |     1 |   1 |       1 |       100   | RAN              |
| Service mesh / mTLS   |     0 |     0 |     1 |     0 |      2 |          0 |     0 |   3 |       1 |        33.3 | MCO              |
| Generic HTTP2 counter |     0 |     0 |     0 |     0 |      1 |          0 |     0 |   1 |       0 |         0   | CMS              |
| Lawful Intercept      |     0 |     0 |     0 |     0 |      3 |          0 |     0 |   3 |       0 |         0   | CMS              |
| NRF/NSSF/SCP/SEPP     |     0 |     0 |     0 |     0 |     28 |          0 |     0 |  28 |       0 |         0   | CMS              |

#### Segment by product family
| fam                   |   excluded (B error) |   fixed |   persistently right |   persistently wrong |   regressed |   n |
|:----------------------|---------------------:|--------:|---------------------:|---------------------:|------------:|----:|
| AUSF                  |                    0 |      46 |                  335 |                   24 |          42 | 447 |
| ePDG                  |                    0 |     120 |                   82 |                   97 |           4 | 303 |
| Media Engine          |                    9 |      62 |                   48 |                  105 |          16 | 240 |
| SeGW                  |                    0 |      66 |                   28 |                   79 |           3 | 176 |
| peer-VNF platform     |                    0 |       3 |                    7 |                  113 |          17 | 140 |
| Provisioning Gateway  |                    0 |      34 |                    3 |                   73 |           9 | 119 |
| AMF                   |                    0 |       2 |                  105 |                    2 |           2 | 111 |
| MME                   |                    0 |       4 |                   96 |                    5 |           0 | 105 |
| MDPLB                 |                    0 |       1 |                   79 |                    0 |           3 |  83 |
| SMF/UPF/PDU session   |                    0 |       2 |                   53 |                    3 |           3 |  61 |
| CCLB                  |                    0 |      12 |                   39 |                    0 |           5 |  56 |
| UDM/UDR/UDSF          |                    0 |      20 |                   19 |                   14 |           0 |  53 |
| PCF/PCRF/policy       |                    0 |       9 |                   20 |                    4 |           2 |  35 |
| NRF/NSSF/SCP/SEPP     |                    0 |       1 |                   27 |                    0 |           0 |  28 |
| NFV platform (infra)  |                    0 |       4 |                   15 |                    8 |           1 |  28 |
| MTCIL / observability |                    0 |       1 |                    1 |                    2 |           0 |   4 |
| Lawful Intercept      |                    0 |       3 |                    0 |                    0 |           0 |   3 |
| Service mesh / mTLS   |                    0 |       1 |                    1 |                    1 |           0 |   3 |
| Unidentified          |                    0 |       0 |                    0 |                    2 |           0 |   2 |
| Generic HTTP2 counter |                    0 |       0 |                    1 |                    0 |           0 |   1 |
| Subscriber migration  |                    0 |       0 |                    0 |                    1 |           0 |   1 |

### A.4. Confidence
| run   | verdict   |    n |   mean |   median |   p25 |   n>=0.95 |   n>=0.99 |   n<0.70 |
|:------|:----------|-----:|-------:|---------:|------:|----------:|----------:|---------:|
| A     | right     | 1072 |  0.92  |   0.9993 | 0.977 |       835 |       767 |      136 |
| A     | wrong     |  927 |  0.794 |   0.9413 | 0.578 |       452 |       342 |      305 |
| B     | right     | 1350 |  0.942 |   1      | 0.973 |      1053 |       962 |      104 |
| B     | wrong     |  640 |  0.896 |   0.992  | 0.842 |       414 |       329 |       97 |

Calibration (Run B): accuracy by confidence bucket
Run A
| bucket        |   n |   wrong |   acc% |
|:--------------|----:|--------:|-------:|
| [0.0, 0.5)    | 233 |     171 |   26.6 |
| [0.5, 0.7)    | 208 |     134 |   35.6 |
| [0.7, 0.9)    | 193 |     121 |   37.3 |
| [0.9, 0.95)   |  78 |      49 |   37.2 |
| [0.95, 0.99)  | 178 |     110 |   38.2 |
| [0.99, 0.999) | 328 |     139 |   57.6 |
| [0.999, 1.0)  | 781 |     203 |   74   |

Run B
| bucket        |    n |   wrong |   acc% |
|:--------------|-----:|--------:|-------:|
| [0.0, 0.5)    |   43 |      27 |   37.2 |
| [0.5, 0.7)    |  158 |      70 |   55.7 |
| [0.7, 0.9)    |  240 |      98 |   59.2 |
| [0.9, 0.95)   |   82 |      31 |   62.2 |
| [0.95, 0.99)  |  176 |      85 |   51.7 |
| [0.99, 0.999) |  210 |      80 |   61.9 |
| [0.999, 1.0)  | 1081 |     249 |   77   |

### Top 30 highest-confidence wrong routes (Run B)
|   Excel Row | pickB    |   confB | pickA    |   confA | fam                   | Query                                                                                                                                                                                                                        |
|------------:|:---------|--------:|:---------|--------:|:----------------------|:-----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
|          46 | MCO      |       1 | MCO      | 0.99997 | UDM/UDR/UDSF          | For SMS-only subscription failures, compare existing UDM SMS subscription and SMS management dataset retrievals, including any combined multi-dataset request.                                                               |
|          45 | IMS      |       1 | IMS      | 0.99996 | AUSF                  | For EPS or IMS authentication failures at the UDM boundary, inspect existing HSS GetHssAv request outcomes separately from AUSF Get outcomes without exposing authentication material.                                       |
|          23 | MCO      |       1 | IMS      | 0.56806 | MTCIL / observability | For missing threshold-crossed alarms, inspect whether the documented metric threshold and duration conditions were met before tracing the MTCIL alarm path.                                                                  |
|           5 | MDE      |       1 | MDE      | 0.99996 | PCF/PCRF/policy       | For an unexpected charging destination, inspect whether the PCF supplied CHF addresses in the existing PCC rule before downstream selection used other sources.                                                              |
|        1383 | MDE      |       1 | MDE      | 0.99986 | Provisioning Gateway  | Show the readings related to 401 Un Authorized responses sent to requests in Provisioning Gateway northbound HTTP for the past 2 days.                                                                                       |
|        1387 | MDE      |       1 | MDE      | 0.99996 | Provisioning Gateway  | Pull up the last 2 days of Provisioning Gateway northbound HTTP data related to 404 Not Found responses sent to requests.                                                                                                    |
|        1389 | MDE      |       1 | MDE      | 0.99991 | Provisioning Gateway  | Can you check 406 Not Acceptable responses sent to requests in Provisioning Gateway northbound HTTP over the last 2 days?                                                                                                    |
|        1397 | MDE      |       1 | MDE      | 0.99978 | Provisioning Gateway  | Can you check 503 Service unavailable responses sent to requests in Provisioning Gateway northbound HTTP over the last 2 days?                                                                                               |
|        1401 | MDE      |       1 | MDE      | 0.99988 | Provisioning Gateway  | Can you retrieve the timestamped measurements concerning 2XX responses received for requests from Provisioning Gateway HTTP notifications for the last 2 days?                                                               |
|        1429 | MDE      |       1 | MDE      | 0.99995 | Provisioning Gateway  | Show the readings related to 401 Unauthorized responses received for Requests in Provisioning Gateway southbound HTTP for the past 2 days.                                                                                   |
|        1403 | MDE      |       1 | MDE      | 0.99997 | Provisioning Gateway  | Pull up the last 2 days of Provisioning Gateway HTTP notifications data related to 400 Bad Request responses received for requests.                                                                                          |
|        1405 | MDE      |       1 | MDE      | 0.99986 | Provisioning Gateway  | Please pull the recorded readings for 401 Un Authorized responses received for requests over the past 2 days from Provisioning Gateway HTTP notifications.                                                                   |
|        1415 | MDE      |       1 | MDE      | 0.9997  | Provisioning Gateway  | Can you check unknown Response received for POST requests in Provisioning Gateway HTTP notifications over the last 2 days?                                                                                                   |
|         481 | MCO      |       1 | MCO      | 0.99959 | AMF                   | For SMS over NAS failure, do UE SMS-support indication, AMF SMS-allowed indication, subscription checking and SMSF selection agree?                                                                                          |
|         553 | IMS      |       1 | IMS      | 0.99974 | MME                   | For a dropped IMS call during LTE-to-CS mobility, does the attempted SRVCC handover type match the documented MME Sv-supported scenarios?                                                                                    |
|         580 | IMS      |       1 | IMS      | 0.83712 | MME                   | Could RAT remapping policy explain a terrestrial, NB-IoT or satellite RAT value reported to HSS that differs from the MME-served UE's apparent access?                                                                       |
|        1353 | PLATFORM |       1 | PLATFORM | 0.99699 | Provisioning Gateway  | Could you look into failure response with error code 8 received from Kafka nodes for the network notification request using the last 2 days of Provisioning Gateway northbound Kafka notifications measurements?             |
|         677 | PLATFORM |       1 | PLATFORM | 0.99882 | ePDG                  | How are node measurements collected centrally and organized into independently enabled ePDG performance groups?                                                                                                              |
|         691 | MCO      |       1 | MCO      | 0.99966 | ePDG                  | Which control-plane message initiators should be checked when verifying the supported S2b signaling flows?                                                                                                                   |
|         683 | IMS      |       1 | IMS      | 0.9999  | ePDG                  | How should the bearer-specific IMS idle timer relate to the general secure-ePDG tunnel liveness timer?                                                                                                                       |
|        1361 | PLATFORM |       1 | PLATFORM | 0.96582 | Provisioning Gateway  | How do the recorded values for failure response with error code 196 received from Kafka nodes for the network notification request look over the last 2 days in Provisioning Gateway northbound Kafka notifications?         |
|        1377 | MDE      |       1 | MDE      | 0.99996 | Provisioning Gateway  | Pull up the last 2 days of Provisioning Gateway northbound HTTP data related to 202 OK responses sent to requests.                                                                                                           |
|        1359 | PLATFORM |       1 | PLATFORM | 0.98907 | Provisioning Gateway  | I'm checking failure response with error code 187 received from Kafka nodes for the network notification request. Bring up the related Provisioning Gateway northbound Kafka notifications measurements for the last 2 days. |
|        1357 | PLATFORM |       1 | PLATFORM | 0.99548 | Provisioning Gateway  | Please pull the recorded readings for failure response with error code 7 received from Kafka nodes for the network notification request over the past 2 days from Provisioning Gateway northbound Kafka notifications.       |
|        1585 | MCO      |       1 | MCO      | 0.99995 | peer-VNF platform     | Looking at peer-VNF platform SMTP, what does SMTP_HELO_EHLO_504_RCVD show for the past 2 days?                                                                                                                               |
|        1467 | PLATFORM |       1 | PLATFORM | 0.99    | NFV platform (infra)  | How should platform NFV CPU-status and disk-status alarms be investigated separately from utilization threshold alarms?                                                                                                      |
|        1587 | MCO      |       1 | MCO      | 0.99984 | peer-VNF platform     | Show the available SMTP_QUIT_221_RCVD samples over the past 2 days from peer-VNF platform SMTP.                                                                                                                              |
|        1464 | IMS      |       1 | IMS      | 0.99984 | peer-VNF platform     | How do peer-VNF flow-control connection creation/release, active tracks and no-free-entry or missing-flow drops describe a VLB forwarding incident?                                                                          |
|        1365 | PLATFORM |       1 | PLATFORM | 0.97613 | Provisioning Gateway  | I'd like the last 2 days of measurements for failure response with error code 192 received from Kafka nodes for the network notification request from Provisioning Gateway northbound Kafka notifications.                   |
|        1363 | PLATFORM |       1 | PLATFORM | 0.99677 | Provisioning Gateway  | Could you look into failure response with error code 150 received from Kafka nodes for the network notification request using the last 2 days of Provisioning Gateway northbound Kafka notifications measurements?           |

### Top 30 highest-confidence wrong routes (Run A)
|   Excel Row | pickA   |   confA | pickB   | fam                  | Query                                                                                                                                                                                  |
|------------:|:--------|--------:|:--------|:---------------------|:---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
|        1022 | IMS     | 1       | IMS     | SeGW                 | Looking at SeGW real-time SNMP reporting, what does uag_componentStatus show for the past 2 days?                                                                                      |
|        1025 | IMS     | 0.99999 | IMS     | SeGW                 | Can you retrieve the timestamped measurements concerning current UAG overload status from SeGW real-time SNMP reporting for the last 2 days?                                           |
|        1024 | IMS     | 0.99999 | IMS     | SeGW                 | Please look up uag_overloadStatus for the last 2 days in the SeGW real-time SNMP reporting measurements.                                                                               |
|        1023 | IMS     | 0.99999 | IMS     | SeGW                 | Please check the measurements associated with current UAG component status in SeGW real-time SNMP reporting, covering the last 2 days.                                                 |
|        1045 | IMS     | 0.99999 | IMS     | SeGW                 | Could you look into UAG-SEG in responder mode: Initial SA INIT request received "without COOKIE" using the last 2 days of SeGW IKEv2 measurements?                                     |
|        1403 | MDE     | 0.99997 | MDE     | Provisioning Gateway | Pull up the last 2 days of Provisioning Gateway HTTP notifications data related to 400 Bad Request responses received for requests.                                                    |
|        1423 | MDE     | 0.99997 | MDE     | Provisioning Gateway | I'd like the last 2 days of measurements for 200 OK responses received for Requests from Provisioning Gateway southbound HTTP.                                                         |
|          46 | MCO     | 0.99997 | MCO     | UDM/UDR/UDSF         | For SMS-only subscription failures, compare existing UDM SMS subscription and SMS management dataset retrievals, including any combined multi-dataset request.                         |
|        1004 | CMS     | 0.99997 | CMS     | SeGW                 | How can the documented show configuration options be used to capture the current SeGW configuration before an incident change?                                                         |
|           5 | MDE     | 0.99996 | MDE     | PCF/PCRF/policy      | For an unexpected charging destination, inspect whether the PCF supplied CHF addresses in the existing PCC rule before downstream selection used other sources.                        |
|        1443 | MDE     | 0.99996 | MDE     | Provisioning Gateway | Can you retrieve the timestamped measurements concerning 5XX responses, not listed above received for Requests from Provisioning Gateway southbound HTTP for the last 2 days?          |
|        1500 | MCO     | 0.99996 | MCO     | peer-VNF platform    | I'm checking received Reset Timer for SMS (RST SMS). Bring up the related peer-VNF platform CAP measurements for the last 2 days.                                                      |
|         779 | IMS     | 0.99996 | IMS     | ePDG                 | Retrieve the timestamped EPDG_IKEV2_FAILED_REASON_NO_ADDITIONAL_SAS measurements for the past 2 days from ePDG IKE.                                                                    |
|          45 | IMS     | 0.99996 | IMS     | AUSF                 | For EPS or IMS authentication failures at the UDM boundary, inspect existing HSS GetHssAv request outcomes separately from AUSF Get outcomes without exposing authentication material. |
|        1433 | MDE     | 0.99996 | MDE     | Provisioning Gateway | Pull up the last 2 days of Provisioning Gateway southbound HTTP data related to 406 Not Acceptable responses received for Requests.                                                    |
|        1377 | MDE     | 0.99996 | MDE     | Provisioning Gateway | Pull up the last 2 days of Provisioning Gateway northbound HTTP data related to 202 OK responses sent to requests.                                                                     |
|        1387 | MDE     | 0.99996 | MDE     | Provisioning Gateway | Pull up the last 2 days of Provisioning Gateway northbound HTTP data related to 404 Not Found responses sent to requests.                                                              |
|        1429 | MDE     | 0.99995 | MDE     | Provisioning Gateway | Show the readings related to 401 Unauthorized responses received for Requests in Provisioning Gateway southbound HTTP for the past 2 days.                                             |
|        1337 | IMS     | 0.99995 | IMS     | Provisioning Gateway | How are partial IMS HSS service creation, Provisioning Gateway rollback and rollback failure reported in the asynchronous result and alarms?                                           |
|        1585 | MCO     | 0.99995 | MCO     | peer-VNF platform    | Looking at peer-VNF platform SMTP, what does SMTP_HELO_EHLO_504_RCVD show for the past 2 days?                                                                                         |
|        1477 | IMS     | 0.99995 | IMS     | peer-VNF platform    | Which documented peer-VNF UAG data-path rates and discard reasons separate traffic-volume changes from malformed or policy-rejected packets?                                           |
|        1607 | IMS     | 0.99995 | IMS     | peer-VNF platform    | Can you pull the last 2 days of UAGU_DP_DISCARD_REASON_INVALID_TCP_URG_PTR for peer-VNF platform UAG Data Path?                                                                        |
|         777 | IMS     | 0.99995 | IMS     | ePDG                 | Retrieve the timestamped EPDG_IKEV2_FAILED_REASON_INVALID_SYNTAX measurements for the past 2 days from ePDG IKE.                                                                       |
|        1608 | IMS     | 0.99994 | IMS     | peer-VNF platform    | I need to review layer-4: URG pointer related error in TCP in peer-VNF platform UAG Data Path; show the measurements for the past 2 days.                                              |
|         781 | IMS     | 0.99994 | IMS     | ePDG                 | Retrieve the timestamped EPDG_IKEV2_FAILED_REASON_NO_PROPOSAL_CHOSEN measurements for the past 2 days from ePDG IKE.                                                                   |
|        1411 | MDE     | 0.99993 | MDE     | Provisioning Gateway | How do the recorded values for 5XX responses, not listed above received for POST requests look over the last 2 days in Provisioning Gateway HTTP notifications?                        |
|        1589 | MCO     | 0.99993 | MCO     | peer-VNF platform    | Please look up SMTP_VRFY_252_RCVD for the last 2 days in the peer-VNF platform SMTP measurements.                                                                                      |
|        1499 | MCO     | 0.99993 | MCO     | peer-VNF platform    | Show the available CAP_RST_TMR_SMS_RCVD samples over the past 2 days from peer-VNF platform CAP.                                                                                       |
|        1427 | MDE     | 0.99993 | MDE     | Provisioning Gateway | Please pull the recorded readings for 400 Bad Request responses received for Requests over the past 2 days from Provisioning Gateway southbound HTTP.                                  |
|        1012 | IMS     | 0.99993 | IMS     | SeGW                 | Get the last 2 days of reported NUM_ECA_RESP_RCVD_WITH_RC_XXXX values from SeGW DIAMRE equipment-identity checking.                                                                    |

### A.5. Cross-run
### Confusion matrix: rows = Run A pick, cols = Run B pick
| pickA    |   CMS |   ERROR |   IMS |   MCO |   MDE |   PACO |   PLATFORM |   RAN |   All |
|:---------|------:|--------:|------:|------:|------:|-------:|-----------:|------:|------:|
| CMS      |    10 |       0 |     0 |     8 |     1 |     22 |          1 |     0 |    42 |
| IMS      |     0 |       2 |    96 |    80 |     8 |    146 |          5 |     1 |   338 |
| MCO      |     0 |       1 |     1 |    69 |     4 |     39 |         10 |     0 |   124 |
| MDE      |     0 |       0 |     0 |     5 |    67 |     40 |          6 |     0 |   118 |
| PACO     |     0 |       6 |    16 |    45 |     9 |    959 |         36 |     1 |  1072 |
| PLATFORM |     0 |       0 |     1 |     4 |     2 |     20 |         66 |     0 |    93 |
| RAN      |     0 |       0 |     4 |    51 |     3 |    124 |         23 |     7 |   212 |
| All      |    10 |       9 |   118 |   262 |    94 |   1350 |        147 |     9 |  1999 |

#### Where did Run-A IMS misroutes go in Run B?
| pickB    |   count |
|:---------|--------:|
| PACO     |     146 |
| IMS      |      96 |
| MCO      |      80 |
| MDE      |       8 |
| PLATFORM |       5 |
| ERROR    |       2 |
| RAN      |       1 |

by family:
| fam                   |   ERROR |   IMS |   MCO |   MDE |   PACO |   PLATFORM |   RAN |
|:----------------------|--------:|------:|------:|------:|-------:|-----------:|------:|
| AUSF                  |       0 |     2 |     1 |     0 |     11 |          0 |     1 |
| Lawful Intercept      |       0 |     0 |     0 |     0 |      1 |          0 |     0 |
| MME                   |       0 |     3 |     0 |     0 |      0 |          0 |     0 |
| MTCIL / observability |       0 |     0 |     1 |     0 |      1 |          0 |     0 |
| Media Engine          |       2 |     6 |    16 |     0 |      9 |          1 |     0 |
| NFV platform (infra)  |       0 |     0 |     1 |     1 |      1 |          0 |     0 |
| PCF/PCRF/policy       |       0 |     1 |     2 |     0 |      4 |          0 |     0 |
| Provisioning Gateway  |       0 |     1 |     0 |     0 |      0 |          0 |     0 |
| SMF/UPF/PDU session   |       0 |     0 |     1 |     0 |      0 |          0 |     0 |
| SeGW                  |       0 |    28 |    32 |     1 |     50 |          1 |     0 |
| UDM/UDR/UDSF          |       0 |     0 |     1 |     0 |      2 |          1 |     0 |
| ePDG                  |       0 |    20 |    25 |     3 |     66 |          0 |     0 |
| peer-VNF platform     |       0 |    35 |     0 |     3 |      1 |          2 |     0 |

#### Where did Run-A RAN misroutes go in Run B?
| pickB    |   count |
|:---------|--------:|
| PACO     |     124 |
| MCO      |      51 |
| PLATFORM |      23 |
| RAN      |       7 |
| IMS      |       4 |
| MDE      |       3 |

by family:
| fam                  |   IMS |   MCO |   MDE |   PACO |   PLATFORM |   RAN |
|:---------------------|------:|------:|------:|-------:|-----------:|------:|
| AMF                  |     0 |     0 |     0 |      1 |          0 |     1 |
| AUSF                 |     1 |     7 |     1 |     30 |          0 |     2 |
| Lawful Intercept     |     0 |     0 |     0 |      2 |          0 |     0 |
| MDPLB                |     0 |     0 |     0 |      1 |          0 |     0 |
| Media Engine         |     3 |    31 |     1 |     37 |         10 |     2 |
| PCF/PCRF/policy      |     0 |     0 |     0 |      2 |          0 |     0 |
| Provisioning Gateway |     0 |     0 |     0 |      1 |          1 |     0 |
| SMF/UPF/PDU session  |     0 |     0 |     0 |      0 |          2 |     0 |
| SeGW                 |     0 |     3 |     0 |      8 |          0 |     1 |
| Subscriber migration |     0 |     0 |     0 |      0 |          0 |     1 |
| UDM/UDR/UDSF         |     0 |     2 |     0 |      7 |          2 |     0 |
| ePDG                 |     0 |     6 |     1 |     34 |          3 |     0 |
| peer-VNF platform    |     0 |     2 |     0 |      1 |          5 |     0 |

#### Where did Run-B MCO misroutes come from in Run A?
| pickA    |   count |
|:---------|--------:|
| IMS      |      80 |
| MCO      |      69 |
| RAN      |      51 |
| PACO     |      45 |
| CMS      |       8 |
| MDE      |       5 |
| PLATFORM |       4 |

by family:
| fam                   |   CMS |   IMS |   MCO |   MDE |   PACO |   PLATFORM |   RAN |
|:----------------------|------:|------:|------:|------:|-------:|-----------:|------:|
| AMF                   |     0 |     0 |     1 |     0 |      0 |          0 |     0 |
| AUSF                  |     1 |     1 |     3 |     1 |     23 |          0 |     7 |
| MME                   |     0 |     0 |     1 |     0 |      0 |          0 |     0 |
| MTCIL / observability |     0 |     1 |     1 |     0 |      0 |          0 |     0 |
| Media Engine          |     5 |    16 |    16 |     0 |     12 |          2 |    31 |
| NFV platform (infra)  |     0 |     1 |     0 |     0 |      0 |          0 |     0 |
| PCF/PCRF/policy       |     0 |     2 |     0 |     0 |      2 |          0 |     0 |
| Provisioning Gateway  |     1 |     0 |     7 |     1 |      1 |          0 |     0 |
| SMF/UPF/PDU session   |     0 |     1 |     0 |     0 |      0 |          0 |     0 |
| SeGW                  |     0 |    32 |     3 |     0 |      3 |          1 |     3 |
| Service mesh / mTLS   |     0 |     0 |     0 |     0 |      0 |          1 |     0 |
| UDM/UDR/UDSF          |     0 |     1 |     2 |     1 |      0 |          0 |     2 |
| ePDG                  |     1 |    25 |    18 |     2 |      0 |          0 |     6 |
| peer-VNF platform     |     0 |     0 |    17 |     0 |      4 |          0 |     2 |

#### Where did Run-B PLATFORM misroutes come from in Run A?
| pickA    |   count |
|:---------|--------:|
| PLATFORM |      66 |
| PACO     |      36 |
| RAN      |      23 |
| MCO      |      10 |
| MDE      |       6 |
| IMS      |       5 |
| CMS      |       1 |

by family:
| fam                  |   CMS |   IMS |   MCO |   MDE |   PACO |   PLATFORM |   RAN |
|:---------------------|------:|------:|------:|------:|-------:|-----------:|------:|
| AUSF                 |     0 |     0 |     0 |     0 |      5 |          4 |     0 |
| CCLB                 |     0 |     0 |     0 |     0 |      5 |          0 |     0 |
| Media Engine         |     0 |     1 |     0 |     0 |      1 |          3 |    10 |
| NFV platform (infra) |     0 |     0 |     0 |     0 |      1 |          6 |     0 |
| Provisioning Gateway |     0 |     0 |     2 |     4 |      7 |         10 |     1 |
| SMF/UPF/PDU session  |     0 |     0 |     0 |     0 |      3 |          0 |     2 |
| SeGW                 |     1 |     1 |     0 |     0 |      0 |          2 |     0 |
| UDM/UDR/UDSF         |     0 |     1 |     0 |     1 |      0 |          2 |     2 |
| Unidentified         |     0 |     0 |     0 |     0 |      0 |          2 |     0 |
| ePDG                 |     0 |     0 |     1 |     0 |      1 |          2 |     3 |
| peer-VNF platform    |     0 |     2 |     7 |     1 |     13 |         35 |     5 |

#### Terms with the largest change in pull toward IMS (A->B)
| term           |   n_queries |   ->IMS in A |   ->IMS in B |   delta |
|:---------------|------------:|-------------:|-------------:|--------:|
| epdg           |         293 |          113 |           22 |     -91 |
| segw           |         174 |          111 |           28 |     -83 |
| ipsec          |          55 |           47 |            8 |     -39 |
| <COUNTER>      |         725 |          100 |           63 |     -37 |
| ike            |          50 |           44 |           12 |     -32 |
| check          |         195 |           49 |           19 |     -30 |
| ikev2          |          36 |           33 |            6 |     -27 |
| engine         |         208 |           34 |           10 |     -24 |
| media          |         211 |           34 |           10 |     -24 |
| like           |         105 |           33 |            9 |     -24 |
| media engine   |         208 |           34 |           10 |     -24 |
| segw ikev2     |          31 |           28 |            6 |     -22 |
| authentication |         129 |           29 |            8 |     -21 |
| during         |         132 |           25 |            4 |     -21 |
| packets        |          62 |           22 |            1 |     -21 |

#### Terms with the largest change in pull toward RAN (A->B)
| term            |   n_queries |   ->RAN in A |   ->RAN in B |   delta |
|:----------------|------------:|-------------:|-------------:|--------:|
| engine          |         208 |           84 |            2 |     -82 |
| media           |         211 |           84 |            2 |     -82 |
| media engine    |         208 |           84 |            2 |     -82 |
| epdg            |         293 |           39 |            0 |     -39 |
| ausf            |         277 |           40 |            3 |     -37 |
| authentication  |         129 |           29 |            1 |     -28 |
| nat44           |          50 |           25 |            0 |     -25 |
| nat64           |          48 |           23 |            0 |     -23 |
| check           |         195 |           22 |            0 |     -22 |
| <COUNTER>       |         725 |           19 |            0 |     -19 |
| requests        |         143 |           19 |            0 |     -19 |
| ue              |          93 |           19 |            1 |     -18 |
| available       |         106 |           17 |            0 |     -17 |
| both            |          35 |           17 |            0 |     -17 |
| nat44 and nat64 |          30 |           17 |            0 |     -17 |

#### Terms with the largest change in pull toward MCO (A->B)
| term         |   n_queries |   ->MCO in A |   ->MCO in B |   delta |
|:-------------|------------:|-------------:|-------------:|--------:|
| media        |         211 |           24 |           80 |      56 |
| media engine |         208 |           23 |           78 |      55 |
| engine       |         208 |           23 |           78 |      55 |
| segw         |         174 |            7 |           41 |      34 |
| epdg         |         293 |           26 |           51 |      25 |
| ipsec        |          55 |            0 |           23 |      23 |
| check        |         195 |           19 |           38 |      19 |
| ike          |          50 |            4 |           21 |      17 |
| esp          |          31 |            2 |           18 |      16 |
| ausf         |         277 |            5 |           21 |      16 |
| like         |         105 |            8 |           22 |      14 |
| packets      |          62 |           12 |           26 |      14 |
| failures     |          67 |            3 |           16 |      13 |
| segw ipsec   |          26 |            0 |           13 |      13 |
| inspect      |         122 |            2 |           15 |      13 |

#### Terms with the largest change in pull toward PLATFORM (A->B)
| term                            |   n_queries |   ->PLATFORM in A |   ->PLATFORM in B |   delta |
|:--------------------------------|------------:|------------------:|------------------:|--------:|
| peer-vnf                        |         140 |                37 |                63 |      26 |
| <COUNTER>                       |         725 |                12 |                38 |      26 |
| platform                        |         132 |                39 |                64 |      25 |
| peer-vnf platform               |         126 |                37 |                62 |      25 |
| kafka                           |          31 |                 9 |                25 |      16 |
| provisioning gateway            |         118 |                12 |                24 |      12 |
| provisioning                    |         123 |                12 |                24 |      12 |
| gateway                         |         143 |                12 |                24 |      12 |
| notifications                   |          56 |                 8 |                20 |      12 |
| northbound kafka                |          21 |                 8 |                19 |      11 |
| kafka notifications             |          21 |                 8 |                19 |      11 |
| northbound                      |          50 |                 8 |                19 |      11 |
| provisioning gateway northbound |          47 |                 8 |                18 |      10 |
| gateway northbound              |          47 |                 8 |                18 |      10 |
| northbound kafka notifications  |          20 |                 8 |                18 |      10 |

### 20 before/after examples now pulled to MCO / Platform
|   Excel Row | pickA   | pickB    | fam                   | Query                                                                                                                                                         |
|------------:|:--------|:---------|:----------------------|:--------------------------------------------------------------------------------------------------------------------------------------------------------------|
|         148 | PACO    | MCO      | AUSF                  | Are malformed AUSF HTTP/2 requests or stream reset errors, including the documented invalid content-length case, associated with the incident?                |
|         171 | RAN     | MCO      | AUSF                  | Could malformed AUSF authentication request data explain rejections before useful authentication-vector processing occurs?                                    |
|          23 | IMS     | MCO      | MTCIL / observability | For missing threshold-crossed alarms, inspect whether the documented metric threshold and duration conditions were met before tracing the MTCIL alarm path.   |
|        1120 | IMS     | MCO      | Media Engine          | How can Media Engine FTP ALG statistics be inspected when control traffic is processed but sessions do not complete?                                          |
|        1121 | RAN     | MCO      | Media Engine          | How can Media Engine NAT44 per-protocol statistics identify whether the issue is specific to one transport protocol?                                          |
|        1463 | IMS     | MCO      | NFV platform (infra)  | How can inode usage be investigated separately from free disk capacity for the database inode-threshold NFV alarm?                                            |
|           4 | IMS     | MCO      | PCF/PCRF/policy       | For an inactive predefined rule that remains unenforced, inspect the existing PCF activation decision and resulting CP Activate Predefined Rule IE.           |
|          78 | PACO    | MCO      | PCF/PCRF/policy       | For notifications missing at UDM or PCF, inspect existing udr-notify delivery evidence and whether the affected consumer previously subscribed.               |
|        1343 | CMS     | MCO      | Provisioning Gateway  | Which Go-template payload and HTTP-header transformations should be reviewed when a valid northbound request becomes invalid Provisioning Gateway southbound? |
|        1378 | PACO    | MCO      | Provisioning Gateway  | Fetch PROVGW_NB_HTTP_SND_RESPONSE_2XX from Provisioning Gateway northbound HTTP for the last 2 days.                                                          |
|          89 | IMS     | MCO      | SMF/UPF/PDU session   | For S6b AAA reachability failures, inspect the existing SMF-to-local-DRA path before attributing failure to direct AAA connectivity.                          |
|         945 | IMS     | MCO      | SeGW                  | For SeGW IKE signaling lost at vLB-FE, inspect existing GRE encapsulation and forwarding evidence between vLB-FE and SECP in both directions.                 |
|         155 | PACO    | PLATFORM | AUSF                  | Does AUSF KafkaConnectionDown match loss of broker connectivity or incorrect configured broker host and port during telemetry loss?                           |
|         346 | PACO    | PLATFORM | AUSF                  | I'm checking total bytes transmitted to Kafka brokers. Bring up the related AUSF NF management measurements for the last 2 days.                              |
|        1665 | PACO    | PLATFORM | CCLB                  | CCLB_HA_ACTIVE_SESSION_BACKUP_SENT_TOTAL is much higher than yesterday at the same time, what changed?                                                        |
|        1667 | PACO    | PLATFORM | CCLB                  | CCLB_HA_ACTIVE_SESSION_BACKUP_SENT_TOTAL spiked in the last 30 minutes, is it still ongoing or already recovered?                                             |
|        1202 | RAN     | PLATFORM | Media Engine          | Show the readings related to opened ports in Media Engine GRE for both NAT44 and NAT64 for the past 2 days.                                                   |
|        1203 | RAN     | PLATFORM | Media Engine          | Can you pull the last 2 days of port_map_entries for Media Engine GRE for both NAT44 and NAT64?                                                               |
|        1479 | PACO    | PLATFORM | NFV platform (infra)  | How are NFV platform alarms and events viewed and regenerated when checking monitoring visibility?                                                            |
|        1330 | MCO     | PLATFORM | Provisioning Gateway  | How are unsolicited Provisioning Gateway southbound HTTP notifications mediated and forwarded to the northbound Kafka cluster?                                |

### Regressions (n=107)
| pickB    |   count |
|:---------|--------:|
| MCO      |      45 |
| PLATFORM |      36 |
| IMS      |      16 |
| MDE      |       9 |
| RAN      |       1 |

| fam                  |   count |
|:---------------------|--------:|
| AUSF                 |      42 |
| peer-VNF platform    |      17 |
| Media Engine         |      16 |
| Provisioning Gateway |       9 |
| CCLB                 |       5 |
| ePDG                 |       4 |
| SeGW                 |       3 |
| SMF/UPF/PDU session  |       3 |
| MDPLB                |       3 |
| PCF/PCRF/policy      |       2 |
| AMF                  |       2 |
| NFV platform (infra) |       1 |

Regression rate by family = regressed / right-in-A
| fam                   |   rightA |   regressed |   reg% |
|:----------------------|---------:|------------:|-------:|
| AUSF                  |      377 |          42 |   11.1 |
| peer-VNF platform     |       24 |          17 |   70.8 |
| Media Engine          |       64 |          16 |   25   |
| Provisioning Gateway  |       12 |           9 |   75   |
| CCLB                  |       44 |           5 |   11.4 |
| ePDG                  |       86 |           4 |    4.7 |
| MDPLB                 |       82 |           3 |    3.7 |
| SMF/UPF/PDU session   |       56 |           3 |    5.4 |
| SeGW                  |       31 |           3 |    9.7 |
| AMF                   |      107 |           2 |    1.9 |
| PCF/PCRF/policy       |       22 |           2 |    9.1 |
| NFV platform (infra)  |       16 |           1 |    6.2 |
| Generic HTTP2 counter |        1 |           0 |    0   |
| MME                   |       96 |           0 |    0   |
| NRF/NSSF/SCP/SEPP     |       27 |           0 |    0   |
| MTCIL / observability |        1 |           0 |    0   |
| UDM/UDR/UDSF          |       19 |           0 |    0   |
| Service mesh / mTLS   |        1 |           0 |    0   |

#### N-grams over-represented in regressions vs persistently-right (min support 5)
| term                            |   n_regressed |   n_persist_right |   regress% given term |    z |
|:--------------------------------|--------------:|------------------:|----------------------:|-----:|
| peer-vnf                        |            17 |                 7 |                  70.8 | 7.11 |
| platform                        |            15 |                 3 |                  83.3 | 6.36 |
| peer-vnf platform               |            14 |                 2 |                  87.5 | 5.89 |
| ctr:format                      |            12 |                 2 |                  85.7 | 5.58 |
| ctr:msg                         |            12 |                 2 |                  85.7 | 5.58 |
| notifications                   |            10 |                 8 |                  55.6 | 5.26 |
| ctr:invalid                     |            13 |                19 |                  40.6 | 5.21 |
| media engine                    |            14 |                23 |                  37.8 | 5.19 |
| engine                          |            14 |                23 |                  37.8 | 5.19 |
| provisioning                    |             9 |                 4 |                  69.2 | 5.19 |
| media                           |            14 |                23 |                  37.8 | 5.19 |
| provisioning gateway            |             9 |                 3 |                  75   | 5.16 |
| provisioning gateway northbound |             9 |                 2 |                  81.8 | 5.02 |
| northbound                      |             9 |                 2 |                  81.8 | 5.02 |
| gateway northbound              |             9 |                 2 |                  81.8 | 5.02 |
| kafka                           |            10 |                 1 |                  90.9 | 4.81 |
| gateway                         |             9 |                15 |                  37.5 | 4.16 |
| tcp                             |             6 |                 6 |                  50   | 3.97 |
| http                            |             7 |                10 |                  41.2 | 3.9  |
| subscriber                      |             8 |                15 |                  34.8 | 3.75 |
| overload                        |             6 |                 9 |                  40   | 3.57 |
| kafka notifications             |             8 |                 0 |                 100   | 3.5  |
| gateway northbound kafka        |             8 |                 0 |                 100   | 3.5  |
| northbound kafka notifications  |             8 |                 0 |                 100   | 3.5  |
| northbound kafka                |             8 |                 0 |                 100   | 3.5  |

#### Confidence of regressions in B
|       |      confB |
|:------|-----------:|
| count | 107        |
| mean  |   0.869619 |
| std   |   0.17818  |
| min   |   0.35387  |
| 25%   |   0.76954  |
| 50%   |   0.972    |
| 75%   |   0.99942  |
| max   |   1        |


## Appendix B — Sections 6-8 full output
## 7. Root-cause categories (primary, mutually exclusive; rules in scripts/part2.py)
| category                                                          |   n queries |   wrong A |   share of A wrong % |   wrong B |   share of B wrong % |   misroute% B |
|:------------------------------------------------------------------|------------:|----------:|---------------------:|----------:|---------------------:|--------------:|
| C1 Ownership ambiguous / likely mislabeled                        |         100 |        75 |                  8.1 |        73 |                 11.4 |          73   |
| C2 Generic term overrides a named PACO NF                         |         971 |       144 |                 15.5 |       104 |                 16.2 |          10.7 |
| C3 PACO product not recognised + shared protocol/infra vocabulary |         773 |       599 |                 64.6 |       394 |                 61.6 |          51.6 |
| C4 PACO product not recognised (pure coverage gap)                |         141 |        98 |                 10.6 |        63 |                  9.8 |          44.7 |
| C5 Other (observability/LI/mesh/unidentified)                     |          14 |        11 |                  1.2 |         6 |                  0.9 |          42.9 |
| TOTAL                                                             |        1999 |       927 |                100   |       640 |                100   |          32.2 |

Catch-all overlay (Run B): MCO misroutes with NO messaging cue = 222/262; Platform misroutes with NO infra cue = 38/147
Catch-all overlay (Run A): MCO no-cue = 89/124; Platform no-cue = 28/93

### Category x Run-B destination (wrong only)
| category                                                          |   CMS |   IMS |   MCO |   MDE |   PLATFORM |   RAN |   All |
|:------------------------------------------------------------------|------:|------:|------:|------:|-----------:|------:|------:|
| C1 Ownership ambiguous / likely mislabeled                        |     0 |    18 |    17 |     4 |         34 |     0 |    73 |
| C2 Generic term overrides a named PACO NF                         |     1 |    19 |    46 |     8 |         25 |     5 |   104 |
| C3 PACO product not recognised + shared protocol/infra vocabulary |     9 |    76 |   176 |    66 |         65 |     2 |   394 |
| C4 PACO product not recognised (pure coverage gap)                |     0 |     5 |    20 |    16 |         21 |     1 |    63 |
| C5 Other (observability/LI/mesh/unidentified)                     |     0 |     0 |     3 |     0 |          2 |     1 |     6 |
| All                                                               |    10 |   118 |   262 |    94 |        147 |     9 |   640 |

### Examples per category (Run B wrong, highest confidence first, diverse families)
#### C1 Ownership ambiguous / likely mislabeled
|   Excel Row | fam                  | pickA    | pickB    |   confB | Query                                                                                                                                                                                  |
|------------:|:---------------------|:---------|:---------|--------:|:---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
|          45 | AUSF                 | IMS      | IMS      |       1 | For EPS or IMS authentication failures at the UDM boundary, inspect existing HSS GetHssAv request outcomes separately from AUSF Get outcomes without exposing authentication material. |
|          46 | UDM/UDR/UDSF         | MCO      | MCO      |       1 | For SMS-only subscription failures, compare existing UDM SMS subscription and SMS management dataset retrievals, including any combined multi-dataset request.                         |
|         481 | AMF                  | MCO      | MCO      |       1 | For SMS over NAS failure, do UE SMS-support indication, AMF SMS-allowed indication, subscription checking and SMSF selection agree?                                                    |
|         553 | MME                  | IMS      | IMS      |       1 | For a dropped IMS call during LTE-to-CS mobility, does the attempted SRVCC handover type match the documented MME Sv-supported scenarios?                                              |
|        1337 | Provisioning Gateway | IMS      | IMS      |       1 | How are partial IMS HSS service creation, Provisioning Gateway rollback and rollback failure reported in the asynchronous result and alarms?                                           |
|        1495 | peer-VNF platform    | PLATFORM | PLATFORM |       1 | Could you check the recent peer-VNF platform CAP readings for CAP_CIR_INV_RCVD, covering the last 2 days?                                                                              |
|        1467 | NFV platform (infra) | PLATFORM | PLATFORM |       1 | How should platform NFV CPU-status and disk-status alarms be investigated separately from utilization threshold alarms?                                                                |

#### C2 Generic term overrides a named PACO NF
|   Excel Row | fam             | pickA    | pickB    |   confB | Query                                                                                                                                                                  |
|------------:|:----------------|:---------|:---------|--------:|:-----------------------------------------------------------------------------------------------------------------------------------------------------------------------|
|           5 | PCF/PCRF/policy | MDE      | MDE      | 1       | For an unexpected charging destination, inspect whether the PCF supplied CHF addresses in the existing PCC rule before downstream selection used other sources.        |
|         150 | AUSF            | PLATFORM | PLATFORM | 1       | Do Kubernetes Watch timeouts or undecodable events explain stale runtime state observations in AUSF?                                                                   |
|         393 | AUSF            | PACO     | MDE      | 1       | Can you check total security-edge-proxy subscription renewal attempts sent before expiry in AUSF SEPP interaction over the last 2 days?                                |
|         580 | MME             | IMS      | IMS      | 1       | Could RAT remapping policy explain a terrestrial, NB-IoT or satellite RAT value reported to HSS that differs from the MME-served UE's apparent access?                 |
|        1818 | AUSF            | PACO     | MCO      | 0.99999 | I need to activate a subscriber trace on the N12 interface on the AUSF, which mCMS or CLI parameters are involved and does the change need a restart or a pod rollout? |
|         106 | UDM/UDR/UDSF    | PLATFORM | MDE      | 0.99998 | A Couchbase pod backing UDSF has failed. Inspect existing replica promotion, cluster-map updates and client adoption of the new active vBucket locations.              |
|         260 | AUSF            | PACO     | IMS      | 0.99994 | How do the recorded values for liveness-probe responses sent by the authentication service look over the last 2 days in AUSF request handling?                         |

#### C3 PACO product not recognised + shared protocol/infra vocabulary
|   Excel Row | fam                  | pickA    | pickB    |   confB | Query                                                                                                                                                |
|------------:|:---------------------|:---------|:---------|--------:|:-----------------------------------------------------------------------------------------------------------------------------------------------------|
|        1612 | peer-VNF platform    | MCO      | MCO      |       1 | Can you check HTTP GET requests sent to application to process in peer-VNF platform WAS HTTP message handling over the last 2 days?                  |
|        1513 | peer-VNF platform    | IMS      | IMS      |       1 | What values were recorded for RE_PERF_DIAMRE_AVG_LATENCY over the last 2 days in peer-VNF platform DIAMRE?                                           |
|         829 | ePDG                 | PACO     | IMS      |       1 | Could you check the recent ePDG Latency readings for EPDG_DIAM_MIN_LATENCY, covering the last 2 days?                                                |
|        1435 | Provisioning Gateway | MDE      | MDE      |       1 | Can you check 413 Request Entity Too Large responses received for Requests in Provisioning Gateway southbound HTTP over the last 2 days?             |
|        1492 | peer-VNF platform    | PLATFORM | PLATFORM |       1 | Please check the measurements associated with critical Alarms generated in the measured period in peer-VNF platform Alarm, covering the last 2 days. |
|         808 | ePDG                 | IMS      | MCO      |       1 | I'm checking encrypted-data packets failing cryptographic authentication. Bring up the related ePDG IPsec measurements for the last 2 days.          |
|        1010 | SeGW                 | IMS      | IMS      |       1 | Can you pull the last 2 days of NUM_ECA_RESP_RCVD_WITH_RC_2001 for SeGW DIAMRE equipment-identity checking?                                          |

#### C4 PACO product not recognised (pure coverage gap)
|   Excel Row | fam                  | pickA    | pickB    |   confB | Query                                                                                                                                                                     |
|------------:|:---------------------|:---------|:---------|--------:|:--------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
|         677 | ePDG                 | PLATFORM | PLATFORM | 1       | How are node measurements collected centrally and organized into independently enabled ePDG performance groups?                                                           |
|         843 | ePDG                 | IMS      | IMS      | 1       | Fetch EPDG_DIAM_MIN from ePDG Peak System Transaction for the last 2 days.                                                                                                |
|        1538 | peer-VNF platform    | PLATFORM | PLATFORM | 1       | What do the available peer-VNF platform connection-tracking flow control measurements show for cumulative count of active Conntrack entries during the last 2 days?       |
|        1276 | Media Engine         | MCO      | MCO      | 1       | What values were recorded for setup_messages over the last 2 days in Media Engine RTSP?                                                                                   |
|        1609 | peer-VNF platform    | IMS      | IMS      | 1       | I'd like to check UAGU_DP_DISCARD_REASON_RATE_LIMITING in peer-VNF platform UAG Data Path. Retrieve its readings for the last 2 days.                                     |
|         764 | ePDG                 | MCO      | MCO      | 0.99999 | I'd like the last 2 days of measurements for received internet control messages asking a sender to reduce traffic from ePDG Data Path.                                    |
|        1332 | Provisioning Gateway | MDE      | MDE      | 0.99998 | How can ValidationService, WorkflowService, ConnectorService, NotificationService and DbGw be followed to locate a stalled Provisioning Gateway provisioning transaction? |

#### C5 Other (observability/LI/mesh/unidentified)
|   Excel Row | fam                   | pickA    | pickB    |   confB | Query                                                                                                                                                                                                               |
|------------:|:----------------------|:---------|:---------|--------:|:--------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
|          23 | MTCIL / observability | IMS      | MCO      | 1       | For missing threshold-crossed alarms, inspect whether the documented metric threshold and duration conditions were met before tracing the MTCIL alarm path.                                                         |
|        1636 | Unidentified          | PLATFORM | PLATFORM | 0.98947 | Investigate why session recovery after a pod loss takes much longer than designed, pull the related counters and logs and tell us what stands out.                                                                  |
|        1795 | Subscriber migration  | RAN      | RAN      | 0.9294  | Radio paging load rose during the subscriber move, is it the migration?                                                                                                                                             |
|         121 | Service mesh / mTLS   | PLATFORM | MCO      | 0.89277 | For mTLS connection failures on a documented mesh path, inspect existing client/server certificate assignment and https scheme consistency in authority, location and payload URIs without collecting private keys. |

### B.6b. Rows that arguably carry a wrong / ambiguous expected label
C1 rows: 100; wrong in A: 75; wrong in B: 73; both runs picked the same non-PACO agent: 58
| reason                                                                                              |   n |   wrongB |   same_nonPACO_both |
|:----------------------------------------------------------------------------------------------------|----:|---------:|--------------------:|
| SS7/IN signalling (CAP/MAP/INAP/TCAP/SCCP/M3UA) - not packet core                                   |  35 |       32 |                  24 |
| NFV infrastructure alarm/resource -> PLATFORM?                                                      |  28 |        9 |                   6 |
| messaging (SMS/SMTP/MMS) -> MCO?                                                                    |  16 |       15 |                  12 |
| IMS/SIP subject -> IMS?                                                                             |  10 |        7 |                   7 |
| offline/online charging records -> MDE?                                                             |  10 |        9 |                   8 |
| messaging (SMS/SMTP/MMS) -> MCO?; SS7/IN signalling (CAP/MAP/INAP/TCAP/SCCP/M3UA) - not packet core |   1 |        1 |                   1 |

Whole peer-VNF platform family: n=140, wrong A=116, wrong B=130, right in BOTH runs=7
peer-VNF rows not caught by C1 cues (exported for ownership review): 79
### B.8a. Top-30 trap terms (ranked by excess misroutes over baseline, both runs)
### 8a-i. Unrecognised PACO product names (the biggest pull, listed separately)
| term                            |   n |   wrongA |   ratA |   wrongB |   ratB | destA     | destB         |   excess |
|:--------------------------------|----:|---------:|-------:|---------:|-------:|:----------|:--------------|---------:|
| platform                        | 132 |      114 |   86.4 |      126 |   95.5 | IMS (40)  | PLATFORM (64) |    136.3 |
| media                           | 211 |      168 |   79.6 |      120 |   59.4 | RAN (84)  | MCO (80)      |    125.2 |
| provisioning                    | 123 |      110 |   89.4 |       82 |   66.7 | MDE (74)  | MDE (46)      |     95.4 |
| segw                            | 174 |      143 |   82.2 |       80 |   46   | IMS (111) | MCO (41)      |     86.4 |
| epdg                            | 293 |      208 |   71   |       98 |   33.4 | IMS (113) | MCO (51)      |     75.9 |
| northbound                      |  50 |       39 |   78   |       44 |   88   | MDE (16)  | PLATFORM (19) |     43.7 |
| epdg ike                        |  34 |       33 |   97.1 |       23 |   67.6 | IMS (29)  | MCO (12)      |     29.3 |
| provisioning gateway southbound |  38 |       38 |  100   |       20 |   52.6 | MDE (31)  | MDE (16)      |     28.2 |

### 8a-ii. Top-30 trap terms excluding product names (Jaccard-deduplicated)
|    | term                  |   n |   wrongA |   ratA |   wrongB |   ratB | destA         | destB         |   excess |
|---:|:----------------------|----:|---------:|-------:|---------:|-------:|:--------------|:--------------|---------:|
|  1 | received              | 127 |       94 |   74   |       78 |   61.4 | MDE (29)      | MDE (24)      |     72.3 |
|  2 | http                  |  98 |       81 |   82.7 |       60 |   61.2 | MDE (59)      | MDE (39)      |     64   |
|  3 | ike                   |  50 |       49 |   98   |       34 |   68   | IMS (44)      | MCO (21)      |     43.7 |
|  4 | nat44                 |  50 |       47 |   94   |       30 |   61.2 | RAN (25)      | MCO (13)      |     38.1 |
|  5 | responses             |  60 |       45 |   75   |       40 |   66.7 | MDE (31)      | MDE (28)      |     37.9 |
|  6 | ipsec                 |  55 |       47 |   85.5 |       33 |   60   | IMS (47)      | MCO (23)      |     36.8 |
|  7 | nat64                 |  48 |       43 |   89.6 |       29 |   65.9 | RAN (23)      | MCO (14)      |     35.6 |
|  8 | notifications         |  56 |       38 |   67.9 |       39 |   69.6 | MDE (23)      | PLATFORM (20) |     33   |
|  9 | diamre                |  26 |       26 |  100   |       26 |  100   | IMS (25)      | IMS (22)      |     31.6 |
| 10 | esp                   |  31 |       28 |   90.3 |       24 |   77.4 | IMS (20)      | MCO (18)      |     27.7 |
| 11 | requests              | 143 |       84 |   58.7 |       56 |   39.2 | MDE (39)      | MDE (32)      |     27.7 |
| 12 | packets               |  62 |       44 |   71   |       31 |   53.4 | IMS (22)      | MCO (26)      |     27.6 |
| 13 | kafka                 |  31 |       20 |   64.5 |       30 |   96.8 | PLATFORM (9)  | PLATFORM (25) |     25.7 |
| 14 | error                 |  35 |       28 |   80   |       25 |   71.4 | PLATFORM (10) | PLATFORM (11) |     25.5 |
| 15 | i'm                   |  43 |       32 |   74.4 |       26 |   60.5 | IMS (14)      | MCO (13)      |     24.2 |
| 16 | nat44 and nat64       |  30 |       28 |   93.3 |       19 |   65.5 | RAN (17)      | PLATFORM (8)  |     23.8 |
| 17 | ikev2                 |  36 |       36 |  100   |       15 |   41.7 | IMS (33)      | MCO (7)       |     22.7 |
| 18 | transaction           |  38 |       32 |   84.2 |       20 |   52.6 | IMS (11)      | MDE (10)      |     22.2 |
| 19 | responses received    |  26 |       22 |   84.6 |       20 |   76.9 | MDE (18)      | MDE (16)      |     21.6 |
| 20 | sent                  |  53 |       33 |   62.3 |       29 |   54.7 | IMS (11)      | MCO (12)      |     20.4 |
| 21 | control               |  23 |       20 |   87   |       18 |   78.3 | MCO (8)       | MCO (13)      |     19.9 |
| 22 | response              |  48 |       31 |   64.6 |       26 |   54.2 | PLATFORM (9)  | PLATFORM (10) |     19.3 |
| 23 | system                |  42 |       32 |   76.2 |       20 |   47.6 | IMS (12)      | MDE (7)       |     19   |
| 24 | messages              |  23 |       20 |   87   |       17 |   73.9 | MCO (9)       | MCO (13)      |     18.9 |
| 25 | received for requests |  17 |       17 |  100   |       15 |   88.2 | MDE (17)      | MDE (15)      |     18.6 |
| 26 | ipsec esp             |  20 |       17 |   85   |       17 |   85   | IMS (17)      | MCO (12)      |     18.3 |
| 27 | like to check         |  68 |       38 |   55.9 |       33 |   50   | IMS (21)      | MCO (15)      |     18.2 |
| 28 | kafka notifications   |  21 |       13 |   61.9 |       21 |  100   | PLATFORM (8)  | PLATFORM (19) |     17.5 |
| 29 | http notifications    |  21 |       20 |   95.2 |       13 |   61.9 | MDE (19)      | MDE (12)      |     16.5 |
| 30 | used                  |  41 |       28 |   68.3 |       20 |   48.8 | RAN (10)      | MCO (12)      |     15.8 |

### B.8d. 100-query regression set composition
| category                                                          |   persistently wrong |   regressed |   All |
|:------------------------------------------------------------------|---------------------:|------------:|------:|
| C1 Ownership ambiguous / likely mislabeled                        |                   12 |           3 |    15 |
| C2 Generic term overrides a named PACO NF                         |                   12 |          16 |    28 |
| C3 PACO product not recognised + shared protocol/infra vocabulary |                   17 |          18 |    35 |
| C4 PACO product not recognised (pure coverage gap)                |                   12 |           4 |    16 |
| C5 Other (observability/LI/mesh/unidentified)                     |                    6 |           0 |     6 |
| All                                                               |                   59 |          41 |   100 |

| fam                   |   count |
|:----------------------|--------:|
| peer-VNF platform     |      16 |
| Media Engine          |      12 |
| ePDG                  |      12 |
| AUSF                  |      10 |
| SeGW                  |      10 |
| Provisioning Gateway  |       8 |
| UDM/UDR/UDSF          |       7 |
| MME                   |       4 |
| SMF/UPF/PDU session   |       3 |
| PCF/PCRF/policy       |       3 |
| AMF                   |       3 |
| NFV platform (infra)  |       3 |
| CCLB                  |       2 |
| MTCIL / observability |       2 |
| Unidentified          |       2 |
| MDPLB                 |       1 |
| Service mesh / mTLS   |       1 |
| Subscriber migration  |       1 |

exported rows: 1999

## Appendix C — Root-cause category examples (6 per category, wrong in A or B, diverse families)
### C1 Ownership ambiguous / likely mislabeled
|   Excel Row | fam                  | pickA   | pickB   | Query                                                                                                                                                                                  |
|------------:|:---------------------|:--------|:--------|:---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
|          45 | AUSF                 | IMS     | IMS     | For EPS or IMS authentication failures at the UDM boundary, inspect existing HSS GetHssAv request outcomes separately from AUSF Get outcomes without exposing authentication material. |
|          46 | UDM/UDR/UDSF         | MCO     | MCO     | For SMS-only subscription failures, compare existing UDM SMS subscription and SMS management dataset retrievals, including any combined multi-dataset request.                         |
|         481 | AMF                  | MCO     | MCO     | For SMS over NAS failure, do UE SMS-support indication, AMF SMS-allowed indication, subscription checking and SMSF selection agree?                                                    |
|         553 | MME                  | IMS     | IMS     | For a dropped IMS call during LTE-to-CS mobility, does the attempted SRVCC handover type match the documented MME Sv-supported scenarios?                                              |
|        1337 | Provisioning Gateway | IMS     | IMS     | How are partial IMS HSS service creation, Provisioning Gateway rollback and rollback failure reported in the asynchronous result and alarms?                                           |
|        1521 | peer-VNF platform    | IMS     | IMS     | I'd like to check NUM_CCA_RESP_RCVD_WITH_RC_9005 in peer-VNF platform DIAMRE RO INTERFACE. Retrieve its readings for the last 2 days.                                                  |

### C2 Generic term overrides a named PACO NF
|   Excel Row | fam                 | pickA    | pickB    | Query                                                                                                                                                             |
|------------:|:--------------------|:---------|:---------|:------------------------------------------------------------------------------------------------------------------------------------------------------------------|
|           3 | PCF/PCRF/policy     | IMS      | PACO     | For a removed dynamic PCC rule that persists, inspect whether the existing PCF rule map used a NULL entry for deactivation or removal.                            |
|           5 | PCF/PCRF/policy     | MDE      | MDE      | For an unexpected charging destination, inspect whether the PCF supplied CHF addresses in the existing PCC rule before downstream selection used other sources.   |
|         101 | UDM/UDR/UDSF        | CMS      | PACO     | For a missing or stale context record, review existing Nudsf create, update and delete outcomes without replaying any data-changing request.                      |
|         150 | AUSF                | PLATFORM | PLATFORM | Do Kubernetes Watch timeouts or undecodable events explain stale runtime state observations in AUSF?                                                              |
|         174 | AUSF                | RAN      | PACO     | Do UPU protection failures indicate malformed AUSF requests, unavailable UE context, counter overflow or security-material generation failure?                    |
|          88 | SMF/UPF/PDU session | PLATFORM | PACO     | For N4 modification or deletion failures after takeover, inspect whether the replacement SMF's Node ID and new CP F-SEID were applied to the taken-over sessions. |

### C3 PACO product not recognised + shared protocol/infra vocabulary
|   Excel Row | fam               | pickA   | pickB   | Query                                                                                                                         |
|------------:|:------------------|:--------|:--------|:------------------------------------------------------------------------------------------------------------------------------|
|         691 | ePDG              | MCO     | MCO     | Which control-plane message initiators should be checked when verifying the supported S2b signaling flows?                    |
|        1526 | peer-VNF platform | IMS     | IMS     | Show the available RE_RX_TOTAL_STR_REQ_SENT samples over the past 2 days from peer-VNF platform DIAMRE RX INTERFACE.          |
|        1527 | peer-VNF platform | IMS     | IMS     | What values were recorded for NUM_ECA_RESP_RCVD_WITH_ERC_XXXX over the last 2 days in peer-VNF platform DIAMRE S13 INTERFACE? |
|         683 | ePDG              | IMS     | IMS     | How should the bearer-specific IMS idle timer relate to the general secure-ePDG tunnel liveness timer?                        |
|        1286 | Media Engine      | IMS     | IMS     | I'd like to check GRE unknown version in Media Engine Security. Retrieve its readings for the last 2 days.                    |
|        1273 | Media Engine      | MCO     | PACO    | Could you check the recent Media Engine RTSP readings for drops, covering the last 2 days?                                    |

### C4 PACO product not recognised (pure coverage gap)
|   Excel Row | fam               | pickA    | pickB    | Query                                                                                                                |
|------------:|:------------------|:---------|:---------|:---------------------------------------------------------------------------------------------------------------------|
|         843 | ePDG              | IMS      | IMS      | Fetch EPDG_DIAM_MIN from ePDG Peak System Transaction for the last 2 days.                                           |
|         839 | ePDG              | IMS      | IMS      | Show the available EPDG_DIAM_AVG samples over the past 2 days from ePDG Peak System Transaction.                     |
|        1260 | Media Engine      | MDE      | PACO     | Pull up the last 2 days of Media Engine PPTP data related to processed Call Clear Requests.                          |
|        1261 | Media Engine      | RAN      | PACO     | Looking at Media Engine PPTP, what does call_disconnect_notifications show for the past 2 days?                      |
|         972 | SeGW              | IMS      | PACO     | Which brief and detailed nasDb displays can be used to inspect client state held by SeGW?                            |
|        1597 | peer-VNF platform | PLATFORM | PLATFORM | Retrieve the timestamped AVG_CPU_OCC_FP measurements for the past 2 days from peer-VNF platform fast-path resources. |

### C5 Other (observability/LI/mesh/unidentified)
|   Excel Row | fam                   | pickA    | pickB    | Query                                                                                                                                                                                                                                 |
|------------:|:----------------------|:---------|:---------|:--------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
|          23 | MTCIL / observability | IMS      | MCO      | For missing threshold-crossed alarms, inspect whether the documented metric threshold and duration conditions were met before tracing the MTCIL alarm path.                                                                           |
|          25 | MTCIL / observability | IMS      | PACO     | For operation-registration failures at the MTCIL boundary, inspect existing OPERATION_REGISTER_REQ_TOTAL and OPERATION_REGISTER_RSP_TOTAL observations by response statusCode; these are NF-side observations, not MTCIL-native KPIs. |
|        1795 | Subscriber migration  | RAN      | RAN      | Radio paging load rose during the subscriber move, is it the migration?                                                                                                                                                               |
|         518 | Lawful Intercept      | RAN      | PACO     | For an authorized LI_X1 availability incident, inspect existing sanitized LIPF-to-POI transport and response outcomes; distinguish this boundary from the separate POI-to-MDF2 LI_X2 path without issuing any provisioning request.   |
|         519 | Lawful Intercept      | RAN      | PACO     | Review authorized, sanitized existing interface records to verify that ADMF LI_X1 usage for a Triggered POI is audit/management rather than provisioning, as documented; do not inspect target records or change tasks.               |
|        1636 | Unidentified          | PLATFORM | PLATFORM | Investigate why session recovery after a pod loss takes much longer than designed, pull the related counters and logs and tell us what stands out.                                                                                    |

## Appendix D — All 107 regressions (right in A, wrong in B), with tagged cause
|   Excel Row | fam                  | pickA   |   confA | pickB    |   confB | cause                                        | Query                                                                                                                                                                                                                                   |
|------------:|:---------------------|:--------|--------:|:---------|--------:|:---------------------------------------------|:----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
|        1665 | CCLB                 | PACO    | 0.99724 | PLATFORM | 0.9638  | CCLB/MDPLB counter in free-form ops phrasing | CCLB_HA_ACTIVE_SESSION_BACKUP_SENT_TOTAL is much higher than yesterday at the same time, what changed?                                                                                                                                  |
|        1667 | CCLB                 | PACO    | 0.99844 | PLATFORM | 0.92289 | CCLB/MDPLB counter in free-form ops phrasing | CCLB_HA_ACTIVE_SESSION_BACKUP_SENT_TOTAL spiked in the last 30 minutes, is it still ongoing or already recovered?                                                                                                                       |
|        1668 | CCLB                 | PACO    | 0.99738 | PLATFORM | 0.74439 | CCLB/MDPLB counter in free-form ops phrasing | CCLB_HA_ACTIVE_SESSION_BACKUP_SENT_TOTAL has been flat at zero since the upgrade, is the counter still being reported?                                                                                                                  |
|        1678 | CCLB                 | PACO    | 0.99995 | PLATFORM | 0.85887 | CCLB/MDPLB counter in free-form ops phrasing | CCLB_HA_STANDBY_SESSION_BACKUP_RECEIVED_TOTAL is much higher than yesterday at the same time, what changed?                                                                                                                             |
|        1680 | CCLB                 | PACO    | 0.99995 | PLATFORM | 0.58079 | CCLB/MDPLB counter in free-form ops phrasing | CCLB_HA_STANDBY_SESSION_BACKUP_RECEIVED_TOTAL spiked in the last 30 minutes, is it still ongoing or already recovered?                                                                                                                  |
|        1757 | MDPLB                | PACO    | 0.99999 | IMS      | 0.98038 | CCLB/MDPLB counter in free-form ops phrasing | What was the peak of MDPLB_SESSION_SCTP_HEARTBEAT_RX_UL_DELTA over the past 7 days and when did it happen?                                                                                                                              |
|        1770 | MDPLB                | PACO    | 0.99999 | IMS      | 0.76506 | CCLB/MDPLB counter in free-form ops phrasing | What was the peak of MDPLB_SESSION_SCTP_HEARTBEAT_ACK_RX_UL_DELTA over the past 7 days and when did it happen?                                                                                                                          |
|        1777 | MDPLB                | PACO    | 0.99994 | IMS      | 0.74562 | CCLB/MDPLB counter in free-form ops phrasing | What was the peak of MDPLB_SESSION_SCTP_SHUTDOWN_ACK_RX_DELTA over the past 7 days and when did it happen?                                                                                                                              |
|         167 | AUSF                 | PACO    | 0.5815  | IMS      | 0.57921 | HTTP/request-handling wording                | Is the AUSF overload incident represented by global HTTP 503 load control, per-client HTTP 429 limits or received OCI peer-overload indications?                                                                                        |
|         205 | AUSF                 | PACO    | 0.99946 | IMS      | 0.96721 | HTTP/request-handling wording                | Get the last 2 days of reported AUSF_NAUSF_AUTH_AV_REQ_OK_COUNT values from AUSF authentication processing.                                                                                                                             |
|         254 | AUSF                 | PACO    | 0.76736 | MCO      | 0.99984 | HTTP/request-handling wording                | Could you look into detected consumer overload events associated with overload-control indications using the last 2 days of AUSF request handling measurements?                                                                         |
|         260 | AUSF                 | PACO    | 0.76161 | IMS      | 0.99994 | HTTP/request-handling wording                | How do the recorded values for liveness-probe responses sent by the authentication service look over the last 2 days in AUSF request handling?                                                                                          |
|         263 | AUSF                 | PACO    | 0.99311 | IMS      | 0.998   | HTTP/request-handling wording                | Get the last 2 days of reported AUSF_NAUSF_NOT_READY_COUNT values from AUSF request handling.                                                                                                                                           |
|         267 | AUSF                 | PACO    | 0.9992  | IMS      | 0.99628 | HTTP/request-handling wording                | Get the last 2 days of reported AUSF_NAUSF_REQ_NOT_READY_COUNT values from AUSF request handling.                                                                                                                                       |
|         269 | AUSF                 | PACO    | 0.99946 | IMS      | 0.97991 | HTTP/request-handling wording                | Get the last 2 days of reported AUSF_NAUSF_REQ_OK_COUNT values from AUSF request handling.                                                                                                                                              |
|         271 | AUSF                 | PACO    | 0.9993  | IMS      | 0.97574 | HTTP/request-handling wording                | Get the last 2 days of reported AUSF_NAUSF_REQ_RECV_TOTAL values from AUSF request handling.                                                                                                                                            |
|         276 | AUSF                 | PACO    | 0.59442 | MCO      | 0.84368 | HTTP/request-handling wording                | I'm checking HTTP Too Many Requests error responses sent by the service. Bring up the related AUSF request handling measurements for the last 2 days.                                                                                   |
|         510 | AMF                  | PACO    | 0.9965  | RAN      | 0.53647 | HTTP/request-handling wording                | During recovery from N2 overload, did AMF send revised reduction percentages or OVERLOAD STOP to the same affected RAN nodes?                                                                                                           |
|        1378 | Provisioning Gateway | PACO    | 0.82984 | MCO      | 0.99141 | HTTP/request-handling wording                | Fetch PROVGW_NB_HTTP_SND_RESPONSE_2XX from Provisioning Gateway northbound HTTP for the last 2 days.                                                                                                                                    |
|        1461 | peer-VNF platform    | PACO    | 0.53283 | MCO      | 0.76647 | HTTP/request-handling wording                | How can peer-VNF HTTP client queueing, connection and response failures be distinguished from server-side routing, validation and application timeout results?                                                                          |
|        1493 | peer-VNF platform    | PACO    | 0.99298 | PLATFORM | 0.99997 | HTTP/request-handling wording                | Please look up CID_AVG_AVAIL_HD_SPACE for the last 2 days in the peer-VNF platform Average Overload measurements.                                                                                                                       |
|        1533 | peer-VNF platform    | PACO    | 0.94582 | PLATFORM | 0.99999 | HTTP/request-handling wording                | Can you pull the last 2 days of CID_AVG_DISK_RES_UTIL for peer-VNF platform Disk Overload?                                                                                                                                              |
|        1539 | peer-VNF platform    | PACO    | 0.63084 | PLATFORM | 0.99896 | HTTP/request-handling wording                | I'd like to check HCM_FAILURES_LIFE_TIMEOUT in peer-VNF platform HTTP client manager. Retrieve its readings for the last 2 days.                                                                                                        |
|        1541 | peer-VNF platform    | PACO    | 0.95573 | PLATFORM | 0.99943 | HTTP/request-handling wording                | Can you pull the last 2 days of HCM_HTTP_REQUESTS_POST for peer-VNF platform HTTP client manager?                                                                                                                                       |
|        1575 | peer-VNF platform    | PACO    | 0.60463 | PLATFORM | 0.99993 | HTTP/request-handling wording                | I'd like to check CID_OVLD_UP_1 in peer-VNF platform Overload. Retrieve its readings for the last 2 days.                                                                                                                               |
|        1613 | peer-VNF platform    | PACO    | 0.64523 | MCO      | 0.99999 | HTTP/request-handling wording                | I need the recorded WAS_HTTP_REQ_ROUTE_NOT_FOUND samples from peer-VNF platform WAS HTTP message handling for the last 2 days.                                                                                                          |
|         155 | AUSF                 | PACO    | 0.66302 | PLATFORM | 0.99984 | Kafka -> PLATFORM                            | Does AUSF KafkaConnectionDown match loss of broker connectivity or incorrect configured broker host and port during telemetry loss?                                                                                                     |
|         344 | AUSF                 | PACO    | 0.56067 | MCO      | 0.95734 | Kafka -> PLATFORM                            | Can you retrieve the timestamped measurements concerning messages produced to Kafka, classified by topic from AUSF NF management for the last 2 days?                                                                                   |
|         346 | AUSF                 | PACO    | 0.99945 | PLATFORM | 0.99999 | Kafka -> PLATFORM                            | I'm checking total bytes transmitted to Kafka brokers. Bring up the related AUSF NF management measurements for the last 2 days.                                                                                                        |
|        1352 | Provisioning Gateway | PACO    | 0.77619 | PLATFORM | 0.99962 | Kafka -> PLATFORM                            | Please look up PROVGW_KAFKA_DATABUS_RCV_RESPONSE_ERR_BROKER_NOT_AVAILABLE for the last 2 days in the Provisioning Gateway northbound Kafka notifications measurements.                                                                  |
|        1354 | Provisioning Gateway | PACO    | 0.70661 | PLATFORM | 0.99892 | Kafka -> PLATFORM                            | Retrieve the timestamped PROVGW_KAFKA_DATABUS_RCV_RESPONSE_ERR_NETWORK_EXCEPTION measurements for the past 2 days from Provisioning Gateway northbound Kafka notifications.                                                             |
|        1358 | Provisioning Gateway | PACO    | 0.91584 | PLATFORM | 0.75942 | Kafka -> PLATFORM                            | Bring up PROVGW_KAFKA_DATABUS_RCV_RESPONSE_ERR__ALL_BROKERS_DOWN for Provisioning Gateway northbound Kafka notifications over the last 2 days, keeping the recorded timestamps.                                                         |
|        1360 | Provisioning Gateway | PACO    | 0.51102 | PLATFORM | 0.99422 | Kafka -> PLATFORM                            | What values were recorded for PROVGW_KAFKA_DATABUS_RCV_RESPONSE_ERR__FAIL over the last 2 days in Provisioning Gateway northbound Kafka notifications?                                                                                  |
|        1362 | Provisioning Gateway | PACO    | 0.73585 | PLATFORM | 0.55681 | Kafka -> PLATFORM                            | What values were recorded for PROVGW_KAFKA_DATABUS_RCV_RESPONSE_ERR__FATAL over the last 2 days in Provisioning Gateway northbound Kafka notifications?                                                                                 |
|        1364 | Provisioning Gateway | PACO    | 0.6878  | PLATFORM | 0.46909 | Kafka -> PLATFORM                            | Bring up PROVGW_KAFKA_DATABUS_RCV_RESPONSE_ERR__MSG_TIMED_OUT for Provisioning Gateway northbound Kafka notifications over the last 2 days, keeping the recorded timestamps.                                                            |
|        1366 | Provisioning Gateway | PACO    | 0.64713 | PLATFORM | 0.99996 | Kafka -> PLATFORM                            | Get the last 2 days of reported PROVGW_KAFKA_DATABUS_RCV_RESPONSE_ERR__TRANSPORT values from Provisioning Gateway northbound Kafka notifications.                                                                                       |
|        1368 | Provisioning Gateway | PACO    | 0.67975 | MDE      | 0.54817 | Kafka -> PLATFORM                            | Get the last 2 days of reported PROVGW_KAFKA_DATABUS_RCV_RESPONSE_SUCCESS values from Provisioning Gateway northbound Kafka notifications.                                                                                              |
|        1164 | Media Engine         | PACO    | 0.70012 | MDE      | 0.95761 | Media Engine                                 | Can you pull the last 2 days of bfd_echo_packets_sen for Media Engine BFD?                                                                                                                                                              |
|        1196 | Media Engine         | PACO    | 0.31279 | MCO      | 0.57394 | Media Engine                                 | What do the available Media Engine Fragment measurements show for packets dropped due to "limit on number of fragments for one IP packet is reached" during the last 2 days?                                                            |
|        1226 | Media Engine         | PACO    | 0.28886 | MCO      | 0.80254 | Media Engine                                 | How do the recorded values for packets dropped due to "ACL denial" look over the last 2 days in Media Engine NAT44?                                                                                                                     |
|        1256 | Media Engine         | PACO    | 0.588   | MCO      | 0.77261 | Media Engine                                 | Could you look into packets dropped due to "reached address mappings limit" using the last 2 days of Media Engine NAT64 Drop measurements?                                                                                              |
|        1264 | Media Engine         | PACO    | 0.35204 | MDE      | 0.97502 | Media Engine                                 | I'm checking processed Outgoing Call Replies. Bring up the related Media Engine PPTP measurements for the last 2 days.                                                                                                                  |
|        1268 | Media Engine         | PACO    | 0.86565 | PLATFORM | 0.86675 | Media Engine                                 | I'd like the last 2 days of measurements for addresses currently used (for pools of type "nat") from Media Engine Pool Stats.                                                                                                           |
|        1282 | Media Engine         | PACO    | 0.62031 | MCO      | 0.99872 | Media Engine                                 | Show the available tcp_null_flags_drops samples over the past 2 days from Media Engine Security.                                                                                                                                        |
|        1283 | Media Engine         | PACO    | 0.65013 | MCO      | 0.99143 | Media Engine                                 | Could you look into TCP packets dropped with no flags using the last 2 days of Media Engine Security measurements?                                                                                                                      |
|        1284 | Media Engine         | PACO    | 0.33693 | MCO      | 0.72158 | Media Engine                                 | Could you check the recent Media Engine Security readings for tcp_xmas_flags_drops, covering the last 2 days?                                                                                                                           |
|        1289 | Media Engine         | PACO    | 0.50139 | MCO      | 0.99941 | Media Engine                                 | What values were recorded for TCP SYN fragment drops over the last 2 days in Media Engine Security?                                                                                                                                     |
|        1297 | Media Engine         | PACO    | 0.38829 | IMS      | 0.95626 | Media Engine                                 | Could you check the recent Media Engine TCP Optimizer readings for dl_spi_failure, covering the last 2 days?                                                                                                                            |
|        1298 | Media Engine         | PACO    | 0.44178 | MCO      | 0.88385 | Media Engine                                 | Please pull the recorded readings for times downlink packet processing was failed over the past 2 days from Media Engine TCP Optimizer.                                                                                                 |
|        1302 | Media Engine         | PACO    | 0.6025  | MCO      | 0.95668 | Media Engine                                 | Can you check packets retransmitted from local cached packets in Media Engine TCP Optimizer over the last 2 days?                                                                                                                       |
|        1303 | Media Engine         | PACO    | 0.60642 | MCO      | 0.99817 | Media Engine                                 | I'd like to check tcp_flows_created in Media Engine TCP Optimizer. Retrieve its readings for the last 2 days.                                                                                                                           |
|         375 | AUSF                 | PACO    | 0.62712 | MDE      | 0.54081 | SEPP/security-edge-proxy -> MDE              | Can you retrieve the timestamped measurements concerning security-edge-proxy discovery queries that failed or timed out from AUSF SEPP interaction for the last 2 days?                                                                 |
|         377 | AUSF                 | PACO    | 0.3038  | MDE      | 0.99028 | SEPP/security-edge-proxy -> MDE              | I need to review security-edge-proxy discovery attempts reported successful by the Service Proxy client, including responses without a usable profile in AUSF SEPP interaction; show the measurements for the past 2 days.              |
|         381 | AUSF                 | PACO    | 0.94421 | MDE      | 0.98124 | SEPP/security-edge-proxy -> MDE              | I'm checking status notifications discarded because subscription context was unusable or the notification did not map to a subscribed security-edge proxy. Bring up the related AUSF SEPP interaction measurements for the last 2 days. |
|         391 | AUSF                 | PACO    | 0.40243 | MDE      | 0.99999 | SEPP/security-edge-proxy -> MDE              | How do the recorded values for security-edge-proxy subscription renewal attempts that failed look over the last 2 days in AUSF SEPP interaction?                                                                                        |
|         393 | AUSF                 | PACO    | 0.79096 | MDE      | 1       | SEPP/security-edge-proxy -> MDE              | Can you check total security-edge-proxy subscription renewal attempts sent before expiry in AUSF SEPP interaction over the last 2 days?                                                                                                 |
|         148 | AUSF                 | PACO    | 0.421   | MCO      | 0.81813 | malformed/invalid-format wording -> MCO      | Are malformed AUSF HTTP/2 requests or stream reset errors, including the documented invalid content-length case, associated with the incident?                                                                                          |
|         209 | AUSF                 | PACO    | 0.99161 | MCO      | 0.99449 | malformed/invalid-format wording -> MCO      | Show the available AUSF_NAUSF_AUTH_INVALID_MSG_FORMAT_COUNT samples over the past 2 days from AUSF authentication processing.                                                                                                           |
|         255 | AUSF                 | PACO    | 0.71039 | IMS      | 0.48009 | malformed/invalid-format wording -> MCO      | Show the available AUSF_NAUSF_INVALID_API samples over the past 2 days from AUSF request handling.                                                                                                                                      |
|        1844 | Media Engine         | PACO    | 0.99921 | MCO      | 0.902   | malformed/invalid-format wording -> MCO      | Threshold alert fired on AUSF_NAUSF_EAP_AKA_SESSION_INVALID_MSG_FORMAT_COUNT at 14:50, give me the 15 minute series around it.                                                                                                          |
|        1845 | AUSF                 | PACO    | 0.99527 | MCO      | 0.99958 | malformed/invalid-format wording -> MCO      | Overlay AUSF_NAUSF_EAP_AKA_SESSION_INVALID_MSG_FORMAT_COUNT on yesterday's evening traffic peak, did it follow the load?                                                                                                                |
|        1846 | AUSF                 | PACO    | 0.95006 | MCO      | 0.48873 | malformed/invalid-format wording -> MCO      | Break down AUSF_NAUSF_EAP_AKA_SESSION_INVALID_MSG_FORMAT_COUNT per pod for the busiest hour today.                                                                                                                                      |
|        1847 | AUSF                 | PACO    | 0.99951 | MCO      | 0.99994 | malformed/invalid-format wording -> MCO      | Export AUSF_NAUSF_EAP_AKA_SESSION_INVALID_MSG_FORMAT_COUNT for the 02:00 to 04:00 maintenance window and compare it with the hour before.                                                                                               |
|        1849 | AUSF                 | PACO    | 0.99971 | MCO      | 0.99664 | malformed/invalid-format wording -> MCO      | Compare AUSF_NAUSF_EAP_AKA_SESSION_INVALID_MSG_FORMAT_COUNT this week against the same weekday last week.                                                                                                                               |
|        1982 | AUSF                 | PACO    | 0.99996 | MCO      | 0.99809 | malformed/invalid-format wording -> MCO      | AUSF_NAUSF_EAP_SESSION_INVALID_MSG_FORMAT_COUNT dropped below its usual level after last night's maintenance window, what is the delta against the previous week?                                                                       |
|        1983 | AUSF                 | PACO    | 0.99948 | MCO      | 0.99004 | malformed/invalid-format wording -> MCO      | Plot AUSF_NAUSF_EAP_SESSION_INVALID_MSG_FORMAT_COUNT per peer and per label for the last 6 hours, one site looks different.                                                                                                             |
|        1984 | AUSF                 | PACO    | 0.99976 | MCO      | 0.99962 | malformed/invalid-format wording -> MCO      | Compare AUSF_NAUSF_EAP_SESSION_INVALID_MSG_FORMAT_COUNT today against yesterday for the same hours, did it move?                                                                                                                        |
|        1985 | Media Engine         | PACO    | 0.99645 | MCO      | 0.98569 | malformed/invalid-format wording -> MCO      | Threshold alert fired on AUSF_NAUSF_EAP_SESSION_INVALID_MSG_FORMAT_COUNT at 14:50, give me the 15 minute series around it.                                                                                                              |
|        1986 | AUSF                 | PACO    | 0.98833 | MCO      | 0.99989 | malformed/invalid-format wording -> MCO      | Overlay AUSF_NAUSF_EAP_SESSION_INVALID_MSG_FORMAT_COUNT on yesterday's evening traffic peak, did it follow the load?                                                                                                                    |
|        1987 | AUSF                 | PACO    | 0.94371 | MCO      | 0.92767 | malformed/invalid-format wording -> MCO      | Break down AUSF_NAUSF_EAP_SESSION_INVALID_MSG_FORMAT_COUNT per pod for the busiest hour today.                                                                                                                                          |
|          78 | PCF/PCRF/policy      | PACO    | 0.98652 | MCO      | 0.99985 | other                                        | For notifications missing at UDM or PCF, inspect existing udr-notify delivery evidence and whether the affected consumer previously subscribed.                                                                                         |
|         192 | AUSF                 | PACO    | 0.96546 | IMS      | 0.99982 | other                                        | Does existing get_ausf_version output show a consistent build across AUSF instances involved in the incident?                                                                                                                           |
|         208 | AUSF                 | PACO    | 0.91649 | MCO      | 0.48846 | other                                        | Could you look into total authentication-vector requests received using the last 2 days of AUSF authentication processing measurements?                                                                                                 |
|         244 | AUSF                 | PACO    | 0.35379 | MCO      | 0.972   | other                                        | Can you check CCA authorization failures in AUSF request handling over the last 2 days?                                                                                                                                                 |
|         256 | AUSF                 | PACO    | 0.56634 | MCO      | 0.40073 | other                                        | Can you check non-authentication-service requests received on the authentication-service interface in AUSF request handling over the last 2 days?                                                                                       |
|         466 | PCF/PCRF/policy      | PACO    | 0.83239 | MCO      | 0.68424 | other                                        | Could local policy, Allowed NSSAI, AMF-served UE usage setting or PCF authorization explain an RFSP index different from the subscribed value?                                                                                          |
|         644 | ePDG                 | PACO    | 0.34037 | MDE      | 0.45336 | other                                        | How does centralized ePDG management retain application configuration while exposing cloud-native lifecycle functions through APIs?                                                                                                     |
|         821 | ePDG                 | PACO    | 0.6247  | PLATFORM | 0.87494 | other                                        | Bring up EPDG_DP_IPSEC_TOTAL_TRANSPORT for ePDG IPsec over the last 2 days, keeping the recorded timestamps.                                                                                                                            |
|         825 | ePDG                 | PACO    | 0.99898 | IMS      | 1       | other                                        | Looking at ePDG Latency, what does EPDG_DIAM_AVG_LATENCY show for the past 2 days?                                                                                                                                                      |
|         829 | ePDG                 | PACO    | 0.90337 | IMS      | 1       | other                                        | Could you check the recent ePDG Latency readings for EPDG_DIAM_MIN_LATENCY, covering the last 2 days?                                                                                                                                   |
|         980 | SeGW                 | PACO    | 0.34366 | MCO      | 0.66661 | other                                        | How can SeGW QoS subport statistics and the brief QoS configuration help localize congestion above an individual pipe?                                                                                                                  |
|        1099 | SeGW                 | PACO    | 0.99992 | MCO      | 0.99997 | other                                        | Looking at SeGW IPsec ESP, what does DP_IPSEC_PEAK_TRANSPORT show for the past 2 days?                                                                                                                                                  |
|        1105 | SeGW                 | PACO    | 0.97687 | MCO      | 0.93154 | other                                        | I'd like to check DP_IPSEC_TUNNEL_INACTIVITY_TIMEOUT_PEAK_RATE in SeGW IPsec ESP. Retrieve its readings for the last 2 days.                                                                                                            |
|        1479 | NFV platform (infra) | PACO    | 0.55866 | PLATFORM | 0.95076 | other                                        | How are NFV platform alarms and events viewed and regenerated when checking monitoring visibility?                                                                                                                                      |
|        1638 | SMF/UPF/PDU session  | PACO    | 0.62888 | PLATFORM | 0.78785 | other                                        | Investigate why AN release sometimes causes the PDU session to be lost, pull the related counters and logs and tell us what stands out.                                                                                                 |
|        1642 | SMF/UPF/PDU session  | PACO    | 0.37498 | PLATFORM | 0.98586 | other                                        | RCA needed for an incident where PDU session modification fails after a handover, what is the most likely root cause and how do we confirm it?                                                                                          |
|        1643 | SMF/UPF/PDU session  | PACO    | 0.31673 | PLATFORM | 0.97813 | other                                        | RCA needed for an incident where AN release sometimes causes the PDU session to be lost, what is the most likely root cause and how do we confirm it?                                                                                   |
|        1450 | peer-VNF platform    | PACO    | 0.44528 | PLATFORM | 0.35387 | peer-VNF platform                            | How can peer-VNF database-adapter-manager outcomes and minimum/maximum/average latency be used to investigate database access where that manager is deployed?                                                                           |
|        1452 | peer-VNF platform    | PACO    | 0.99688 | MCO      | 0.97291 | peer-VNF platform                            | How can per-protocol packet counts and per-external-IP connection-tracking results distinguish peer-VNF front-end traffic processing problems?                                                                                          |
|        1497 | peer-VNF platform    | PACO    | 0.80059 | PLATFORM | 1       | peer-VNF platform                            | Bring up CAP_PA_INV_RCVD for peer-VNF platform CAP over the last 2 days, keeping the recorded timestamps.                                                                                                                               |
|        1503 | peer-VNF platform    | PACO    | 0.99902 | MCO      | 0.68759 | peer-VNF platform                            | I'd like to check AVG_INC_THROUGHPUT_VNF_APP_INTERFACE in peer-VNF platform CAS platform. Retrieve its readings for the last 2 days.                                                                                                    |
|        1505 | peer-VNF platform    | PACO    | 0.94136 | PLATFORM | 0.99934 | peer-VNF platform                            | Please look up TOTAL_TRL_FAILED_TO_SYNC_PER_VNFID for the last 2 days in the peer-VNF platform CAS transaction logs measurements.                                                                                                       |
|        1511 | peer-VNF platform    | PACO    | 0.47199 | PLATFORM | 0.99999 | peer-VNF platform                            | Looking at peer-VNF platform database adapter manager, what does DB_ADAPTER_MGR_LATENCY_MIN show for the past 2 days?                                                                                                                   |
|        1555 | peer-VNF platform    | PACO    | 0.99878 | PLATFORM | 0.92839 | peer-VNF platform                            | Looking at peer-VNF platform Lower Level System, what does TCP_CONN_CLR_OG show for the past 2 days?                                                                                                                                    |
|        1557 | peer-VNF platform    | PACO    | 0.99963 | PLATFORM | 1       | peer-VNF platform                            | Retrieve the timestamped M3UA_DAUD_RCVD measurements for the past 2 days from peer-VNF platform M3UA.                                                                                                                                   |
|        1571 | peer-VNF platform    | PACO    | 0.84523 | PLATFORM | 0.95378 | peer-VNF platform                            | What values were recorded for MAP_UPDATE_PS_LOC_RET_ERR_RCVD over the last 2 days in peer-VNF platform MAP?                                                                                                                             |
|        1573 | peer-VNF platform    | PACO    | 0.98674 | PLATFORM | 0.99979 | peer-VNF platform                            | Retrieve the timestamped MTP3_UPU_RCVD measurements for the past 2 days from peer-VNF platform MTP3.                                                                                                                                    |
|        1632 | AMF                  | PACO    | 0.99992 | IMS      | 0.88171 | pod/K8s wording -> PLATFORM                  | I need to enable subscriber level tracing for a SUPI on the AMF, which parameters are involved and does the change need a restart or a pod rollout?                                                                                     |
|        1818 | AUSF                 | PACO    | 0.66639 | MCO      | 0.99999 | pod/K8s wording -> PLATFORM                  | I need to activate a subscriber trace on the N12 interface on the AUSF, which mCMS or CLI parameters are involved and does the change need a restart or a pod rollout?                                                                  |
|        1819 | AUSF                 | PACO    | 0.38555 | PLATFORM | 0.54511 | pod/K8s wording -> PLATFORM                  | I need to run get_ausf_supi to check the stored context of one subscriber on the AUSF, which mCMS or CLI parameters are involved and does the change need a restart or a pod rollout?                                                   |
|        1908 | AUSF                 | PACO    | 0.99421 | PLATFORM | 0.6141  | pod/K8s wording -> PLATFORM                  | Break down AUSF_NAUSF_EAP_TLS_SESSION_REQ_RECV_TOTAL per pod for the busiest hour today.                                                                                                                                                |
|        1915 | AUSF                 | PACO    | 0.96188 | PLATFORM | 0.93367 | pod/K8s wording -> PLATFORM                  | Break down AUSF_NAUSF_EAP_TLS_SESSION_CACHE_FULL_COUNT per pod for the busiest hour today.                                                                                                                                              |
|        1815 | AUSF                 | PACO    | 0.9375  | MCO      | 0.57894 | subscriber/context wording -> MCO            | Get_ausf_supi shows an old context for a subscriber who already deregistered, where should we start looking?                                                                                                                            |
|        1816 | AUSF                 | PACO    | 0.99398 | MCO      | 0.7802  | subscriber/context wording -> MCO            | Get_ausf_supi finds no context for a subscriber who is registered, and it only started after the last upgrade, which checks do we run first?                                                                                            |
|        1817 | AUSF                 | PACO    | 0.98377 | MCO      | 0.74359 | subscriber/context wording -> MCO            | Del_ausf_supi was used and the subscriber still fails to register, and it only started after the last upgrade, which checks do we run first?                                                                                            |
|        1822 | AUSF                 | PACO    | 0.70006 | MCO      | 0.88387 | subscriber/context wording -> MCO            | Investigate why get_ausf_supi shows an old context for a subscriber who already deregistered, pull the related counters and logs and tell us what stands out.                                                                           |
|        1823 | AUSF                 | PACO    | 0.33812 | MCO      | 0.99321 | subscriber/context wording -> MCO            | RCA needed for an incident where get_ausf_supi finds no context for a subscriber who is registered, what is the most likely root cause and how do we confirm it?                                                                        |

## Appendix E — Arguably mislabeled / ownership-ambiguous rows (C1, n=100)
|   Excel Row | pickA    | pickB    |   confB | reason                                                                                              | Query                                                                                                                                                                                                               |
|------------:|:---------|:---------|--------:|:----------------------------------------------------------------------------------------------------|:--------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
|          45 | IMS      | IMS      | 1       | IMS/SIP subject -> IMS?                                                                             | For EPS or IMS authentication failures at the UDM boundary, inspect existing HSS GetHssAv request outcomes separately from AUSF Get outcomes without exposing authentication material.                              |
|          46 | MCO      | MCO      | 1       | messaging (SMS/SMTP/MMS) -> MCO?                                                                    | For SMS-only subscription failures, compare existing UDM SMS subscription and SMS management dataset retrievals, including any combined multi-dataset request.                                                      |
|         481 | MCO      | MCO      | 1       | messaging (SMS/SMTP/MMS) -> MCO?                                                                    | For SMS over NAS failure, do UE SMS-support indication, AMF SMS-allowed indication, subscription checking and SMSF selection agree?                                                                                 |
|         539 | PACO     | PACO     | 0.99999 | IMS/SIP subject -> IMS?                                                                             | Do MME Sv Echo exchanges show an MSC path failure before the associated SRVCC or MSC-selection failure?                                                                                                             |
|         553 | IMS      | IMS      | 1       | IMS/SIP subject -> IMS?                                                                             | For a dropped IMS call during LTE-to-CS mobility, does the attempted SRVCC handover type match the documented MME Sv-supported scenarios?                                                                           |
|         571 | PACO     | PACO     | 1       | IMS/SIP subject -> IMS?                                                                             | For unsuccessful MME P-CSCF restoration, what HSS-triggered restoration configuration and observed signaling show the point of failure?                                                                             |
|         590 | MCO      | MCO      | 0.99997 | messaging (SMS/SMTP/MMS) -> MCO?                                                                    | Could the documented NB-S1 UE capability prerequisites explain failure of SMS over MME SGs for a control-plane-only IoT device?                                                                                     |
|         608 | PACO     | PACO     | 1       | messaging (SMS/SMTP/MMS) -> MCO?                                                                    | Is absent MME TRL evidence expected for SCEF, SGd SMS, location services or eNodeB setup/configuration because these are explicitly excluded?                                                                       |
|         902 | IMS      | IMS      | 0.74058 | IMS/SIP subject -> IMS?                                                                             | Looking at ePDG Functional, what does EPDG_PDN_CONN_SETUP_PCSCF_OVERRIDE_ATTEMPTS show for the past 2 days?                                                                                                         |
|         903 | IMS      | PACO     | 0.77701 | IMS/SIP subject -> IMS?                                                                             | I'd like to check EPDG_PDN_CONN_SETUP_PCSCF_OVERRIDE_SUCCESS in ePDG Functional. Retrieve its readings for the last 2 days.                                                                                         |
|         944 | PLATFORM | PLATFORM | 0.51488 | NFV infrastructure alarm/resource -> PLATFORM?                                                      | For a virtual load-balancer fault, separate existing FE IP/L4 packet-processing evidence from RE application-routing, overload-control and security evidence; verify the deployed FE/RE placement first.            |
|        1337 | IMS      | IMS      | 1       | IMS/SIP subject -> IMS?                                                                             | How are partial IMS HSS service creation, Provisioning Gateway rollback and rollback failure reported in the asynchronous result and alarms?                                                                        |
|        1448 | PLATFORM | PLATFORM | 0.98946 | NFV infrastructure alarm/resource -> PLATFORM?                                                      | How can NFV CRDL database-node failure be distinguished from failure of the CRDL administration monitor?                                                                                                            |
|        1449 | MCO      | MCO      | 0.82138 | SS7/IN signalling (CAP/MAP/INAP/TCAP/SCCP/M3UA) - not packet core                                   | How can SCTP and M3UA association, transport and message results be used to investigate an applicable SS7 peer-VNF front-end peer?                                                                                  |
|        1451 | PACO     | PACO     | 0.98171 | NFV infrastructure alarm/resource -> PLATFORM?                                                      | How can graceful and forceful NFV component locks be distinguished from a spontaneous service failure?                                                                                                              |
|        1453 | PACO     | PACO     | 0.99997 | NFV infrastructure alarm/resource -> PLATFORM?                                                      | How can reboot, administrative-lock, active/standby-switch and downtime measurements help interpret a NFV component-availability incident?                                                                          |
|        1454 | PACO     | PACO     | 0.99997 | offline/online charging records -> MDE?                                                             | Which peer-VNF CAS CDR, TRL, storage and interface-throughput definitions can be used for an applicable analytics deployment without inferring broader PACO applicability?                                          |
|        1455 | IMS      | PACO     | 0.98896 | NFV infrastructure alarm/resource -> PLATFORM?                                                      | Which NIC connectivity and NFV memory-fault conditions are documented, and what recovery events indicate restoration?                                                                                               |
|        1456 | PLATFORM | PLATFORM | 0.96508 | NFV infrastructure alarm/resource -> PLATFORM?                                                      | Which Scylla, Grafana and Prometheus NFV process-state alarms are relevant only when those components are deployed?                                                                                                 |
|        1458 | PACO     | PACO     | 0.99991 | NFV infrastructure alarm/resource -> PLATFORM?                                                      | Which NFV alarm type, severity and event fields should be collected to classify an incident before assigning it to a deployed VNF?                                                                                  |
|        1459 | PACO     | PACO     | 0.99958 | SS7/IN signalling (CAP/MAP/INAP/TCAP/SCCP/M3UA) - not packet core                                   | Which defined peer-VNF CAP and INAP send/receive triggers are available for SS7 peers, without assuming these interfaces are present in PACO?                                                                       |
|        1462 | PLATFORM | PLATFORM | 0.9931  | NFV infrastructure alarm/resource -> PLATFORM?                                                      | How can a NFV database filesystem becoming read-only be distinguished from a Couchbase rebalance blocked by unreachable nodes?                                                                                      |
|        1463 | IMS      | MCO      | 0.99788 | NFV infrastructure alarm/resource -> PLATFORM?                                                      | How can inode usage be investigated separately from free disk capacity for the database inode-threshold NFV alarm?                                                                                                  |
|        1465 | PACO     | PACO     | 0.99999 | NFV infrastructure alarm/resource -> PLATFORM?                                                      | How do minor disk-usage threshold events differ from the critical disk-full NFV alarm?                                                                                                                              |
|        1466 | IMS      | MDE      | 0.54172 | NFV infrastructure alarm/resource -> PLATFORM?                                                      | How do the documented iostat and NFV process checks help investigate excessive disk I/O utilization?                                                                                                                |
|        1467 | PLATFORM | PLATFORM | 1       | NFV infrastructure alarm/resource -> PLATFORM?                                                      | How should platform NFV CPU-status and disk-status alarms be investigated separately from utilization threshold alarms?                                                                                             |
|        1468 | PACO     | PACO     | 0.9036  | NFV infrastructure alarm/resource -> PLATFORM?                                                      | What checks are documented for the NFV alarm EID_LOCAL_HOST_DB_DOWN, and why is its standby-DB-only scope important?                                                                                                |
|        1469 | PACO     | PACO     | 1       | NFV infrastructure alarm/resource -> PLATFORM?                                                      | What does the NFV process-hung-thread event indicate, and what automatic process-manager recovery is documented?                                                                                                    |
|        1470 | PLATFORM | PLATFORM | 0.90994 | NFV infrastructure alarm/resource -> PLATFORM?                                                      | What process-state check and recovery event are documented for a Cassandra process-down NFV alarm where Cassandra is deployed?                                                                                      |
|        1471 | CMS      | PACO     | 0.77045 | NFV infrastructure alarm/resource -> PLATFORM?                                                      | Which NFS mount state, NFV configuration and system-log checks are documented for redundancy-directory mount or unmount timeout?                                                                                    |
|        1472 | CMS      | PACO     | 0.99731 | NFV infrastructure alarm/resource -> PLATFORM?                                                      | Which NTP offset and configured threshold evidence should be compared when the database time-offset NFV alarm is active?                                                                                            |
|        1473 | PACO     | PACO     | 0.99997 | NFV infrastructure alarm/resource -> PLATFORM?                                                      | Which NFV NTP status and network-connectivity checks are documented when system time is not synchronized?                                                                                                           |
|        1474 | PACO     | PACO     | 0.83648 | NFV infrastructure alarm/resource -> PLATFORM?                                                      | Which PCS-to-metadata-database connectivity evidence should be collected when the database-adapter metadata-cluster NFV alarm is active?                                                                            |
|        1476 | CMS      | PACO     | 1       | NFV infrastructure alarm/resource -> PLATFORM?                                                      | Which configured partition thresholds and disk-usage evidence should be checked for the NFV alarm EID_MAX_DISK_USAGE_EXCEEDED?                                                                                      |
|        1478 | PACO     | PACO     | 1       | NFV infrastructure alarm/resource -> PLATFORM?                                                      | Which documented standby and active-side conditions help investigate an unexpected NFV protection-group takeover?                                                                                                   |
|        1479 | PACO     | PLATFORM | 0.95076 | NFV infrastructure alarm/resource -> PLATFORM?                                                      | How are NFV platform alarms and events viewed and regenerated when checking monitoring visibility?                                                                                                                  |
|        1481 | PACO     | PACO     | 0.79573 | NFV infrastructure alarm/resource -> PLATFORM?                                                      | How can generated and cleared minor, major and critical NFV alarm counts be compared over the measured period?                                                                                                      |
|        1482 | PACO     | PACO     | 1       | NFV infrastructure alarm/resource -> PLATFORM?                                                      | How do NFV CPU overload entry thresholds and below-abatement clear events describe resource pressure and recovery?                                                                                                  |
|        1483 | PACO     | PACO     | 1       | NFV infrastructure alarm/resource -> PLATFORM?                                                      | How do minimum, average and maximum NFV disk utilization measurements differ from free-space measurements and what sampling interval is documented?                                                                 |
|        1484 | PACO     | PACO     | 1       | NFV infrastructure alarm/resource -> PLATFORM?                                                      | How do minimum, average, maximum and current NFV resource measurements differ, including their documented sampling intervals?                                                                                       |
|        1485 | PACO     | PACO     | 1       | NFV infrastructure alarm/resource -> PLATFORM?                                                      | How do upward/downward NFV card-overload transitions differ from the documented overload-level percentage measurements?                                                                                             |
|        1487 | PACO     | PACO     | 0.99755 | NFV infrastructure alarm/resource -> PLATFORM?                                                      | Which fast-path NFV CPU and memory utilization definitions are available, and which source inconsistencies need to be retained when interpreting them?                                                              |
|        1495 | PLATFORM | PLATFORM | 1       | SS7/IN signalling (CAP/MAP/INAP/TCAP/SCCP/M3UA) - not packet core                                   | Could you check the recent peer-VNF platform CAP readings for CAP_CIR_INV_RCVD, covering the last 2 days?                                                                                                           |
|        1496 | PLATFORM | PLATFORM | 0.99993 | SS7/IN signalling (CAP/MAP/INAP/TCAP/SCCP/M3UA) - not packet core                                   | How do the recorded values for received CAP Call Information Report Invoke received look over the last 2 days in peer-VNF platform CAP?                                                                             |
|        1497 | PACO     | PLATFORM | 1       | SS7/IN signalling (CAP/MAP/INAP/TCAP/SCCP/M3UA) - not packet core                                   | Bring up CAP_PA_INV_RCVD for peer-VNF platform CAP over the last 2 days, keeping the recorded timestamps.                                                                                                           |
|        1498 | PLATFORM | PLATFORM | 1       | SS7/IN signalling (CAP/MAP/INAP/TCAP/SCCP/M3UA) - not packet core                                   | Show the readings related to received Play Announcement (PA) in peer-VNF platform CAP for the past 2 days.                                                                                                          |
|        1499 | MCO      | MCO      | 0.99999 | SS7/IN signalling (CAP/MAP/INAP/TCAP/SCCP/M3UA) - not packet core                                   | Show the available CAP_RST_TMR_SMS_RCVD samples over the past 2 days from peer-VNF platform CAP.                                                                                                                    |
|        1500 | MCO      | MCO      | 1       | messaging (SMS/SMTP/MMS) -> MCO?; SS7/IN signalling (CAP/MAP/INAP/TCAP/SCCP/M3UA) - not packet core | I'm checking received Reset Timer for SMS (RST SMS). Bring up the related peer-VNF platform CAP measurements for the last 2 days.                                                                                   |
|        1501 | MDE      | MDE      | 0.99994 | offline/online charging records -> MDE?                                                             | Get the last 2 days of reported AVG_CDR_FILE_SIZE values from peer-VNF platform CAS charging records.                                                                                                               |
|        1502 | MDE      | MDE      | 0.99905 | offline/online charging records -> MDE?                                                             | Could you look into the average size of a CDR file on the storage used by the VM. Unit: KB using the last 2 days of peer-VNF platform CAS charging records measurements?                                            |
|        1504 | MDE      | PLATFORM | 0.83791 | offline/online charging records -> MDE?                                                             | Can you check the average incoming throughput on which the CDR records are received (via Kafka interface) in peer-VNF platform CAS platform over the last 2 days?                                                   |
|        1507 | IMS      | IMS      | 0.99998 | IMS/SIP subject -> IMS?                                                                             | I'd like to check DBAPG_ATT in peer-VNF platform CSCF database adapter. Retrieve its readings for the last 2 days.                                                                                                  |
|        1508 | IMS      | IMS      | 0.60188 | IMS/SIP subject -> IMS?                                                                             | I'm checking current value of the sessdb sync/fetch attempt. Bring up the related peer-VNF platform CSCF database adapter measurements for the last 2 days.                                                         |
|        1517 | IMS      | IMS      | 1       | offline/online charging records -> MDE?                                                             | Please look up NUM_CCA_RESP_RCVD_WITH_RC_9001 for the last 2 days in the peer-VNF platform DIAMRE RO INTERFACE measurements.                                                                                        |
|        1518 | IMS      | IMS      | 0.98957 | offline/online charging records -> MDE?                                                             | I'm checking CCA responses received with Result-Code = Bypass CCN enabled. Bring up the related peer-VNF platform DIAMRE RO INTERFACE measurements for the last 2 days.                                             |
|        1519 | IMS      | IMS      | 1       | offline/online charging records -> MDE?                                                             | I'd like to check NUM_CCA_RESP_RCVD_WITH_RC_9002 in peer-VNF platform DIAMRE RO INTERFACE. Retrieve its readings for the last 2 days.                                                                               |
|        1520 | IMS      | IMS      | 0.99997 | offline/online charging records -> MDE?                                                             | What do the available peer-VNF platform DIAMRE RO INTERFACE measurements show for CCA responses received with Result-Code = Oracle Error - Enable to perform charging/refund correlation during the last 2 days?    |
|        1521 | IMS      | IMS      | 1       | offline/online charging records -> MDE?                                                             | I'd like to check NUM_CCA_RESP_RCVD_WITH_RC_9005 in peer-VNF platform DIAMRE RO INTERFACE. Retrieve its readings for the last 2 days.                                                                               |
|        1522 | MDE      | MDE      | 0.99519 | offline/online charging records -> MDE?                                                             | I'm checking CCA responses received with Result-Code = Refund Failed: last charge for transaction id was unsuccessful. Bring up the related peer-VNF platform DIAMRE RO INTERFACE measurements for the last 2 days. |
|        1543 | IMS      | IMS      | 0.99995 | SS7/IN signalling (CAP/MAP/INAP/TCAP/SCCP/M3UA) - not packet core                                   | I'd like to check INAP_IDP_INV_SENT in peer-VNF platform INAP. Retrieve its readings for the last 2 days.                                                                                                           |
|        1544 | IMS      | PLATFORM | 0.99694 | SS7/IN signalling (CAP/MAP/INAP/TCAP/SCCP/M3UA) - not packet core                                   | Could you look into sent INAP Initial Detection Point (IDP) Invoke using the last 2 days of peer-VNF platform INAP measurements?                                                                                    |
|        1545 | IMS      | IMS      | 0.99985 | SS7/IN signalling (CAP/MAP/INAP/TCAP/SCCP/M3UA) - not packet core                                   | Show the available INAP_OPEN_CFM_RCVD samples over the past 2 days from peer-VNF platform INAP.                                                                                                                     |
|        1546 | IMS      | PLATFORM | 0.97682 | SS7/IN signalling (CAP/MAP/INAP/TCAP/SCCP/M3UA) - not packet core                                   | Pull up the last 2 days of peer-VNF platform INAP data related to received INAP OPEN Confirm.                                                                                                                       |
|        1557 | PACO     | PLATFORM | 1       | SS7/IN signalling (CAP/MAP/INAP/TCAP/SCCP/M3UA) - not packet core                                   | Retrieve the timestamped M3UA_DAUD_RCVD measurements for the past 2 days from peer-VNF platform M3UA.                                                                                                               |
|        1558 | MCO      | MCO      | 0.99426 | SS7/IN signalling (CAP/MAP/INAP/TCAP/SCCP/M3UA) - not packet core                                   | I'm checking M3UA DAUD messages received. Bring up the related peer-VNF platform M3UA measurements for the last 2 days.                                                                                             |
|        1559 | PLATFORM | PLATFORM | 0.9999  | SS7/IN signalling (CAP/MAP/INAP/TCAP/SCCP/M3UA) - not packet core                                   | I'd like to check M3UA_NOTIFY_RCVD in peer-VNF platform M3UA. Retrieve its readings for the last 2 days.                                                                                                            |
|        1560 | PLATFORM | PLATFORM | 0.99989 | SS7/IN signalling (CAP/MAP/INAP/TCAP/SCCP/M3UA) - not packet core                                   | Show the readings related to M3UA notification messages received in peer-VNF platform M3UA for the past 2 days.                                                                                                     |
|        1561 | PLATFORM | PLATFORM | 0.99996 | SS7/IN signalling (CAP/MAP/INAP/TCAP/SCCP/M3UA) - not packet core                                   | Looking at peer-VNF platform M3UA Associations, what does M3UA_ASPIA_ACK_RCVD show for the past 2 days?                                                                                                             |
|        1562 | PLATFORM | PLATFORM | 0.99939 | SS7/IN signalling (CAP/MAP/INAP/TCAP/SCCP/M3UA) - not packet core                                   | Could you look into ASP Inactive acknowledgments received using the last 2 days of peer-VNF platform M3UA Associations measurements?                                                                                |
|        1563 | RAN      | PLATFORM | 0.99552 | SS7/IN signalling (CAP/MAP/INAP/TCAP/SCCP/M3UA) - not packet core                                   | I need the recorded M3UA_BYTE_RCVD samples from peer-VNF platform M3UA Associations for the last 2 days.                                                                                                            |
|        1564 | PLATFORM | PLATFORM | 0.99986 | SS7/IN signalling (CAP/MAP/INAP/TCAP/SCCP/M3UA) - not packet core                                   | Please check the measurements associated with total number bytes received for M3UA payload in peer-VNF platform M3UA Associations, covering the last 2 days.                                                        |
|        1565 | PLATFORM | PLATFORM | 0.99999 | SS7/IN signalling (CAP/MAP/INAP/TCAP/SCCP/M3UA) - not packet core                                   | What values were recorded for MAP_ACTIVE_DIALOG over the last 2 days in peer-VNF platform MAP?                                                                                                                      |
|        1566 | PLATFORM | PLATFORM | 0.99997 | SS7/IN signalling (CAP/MAP/INAP/TCAP/SCCP/M3UA) - not packet core                                   | Please pull the recorded readings for MAP Dialogs usage over the past 2 days from peer-VNF platform MAP.                                                                                                            |
|        1567 | PLATFORM | PACO     | 0.82748 | SS7/IN signalling (CAP/MAP/INAP/TCAP/SCCP/M3UA) - not packet core                                   | Fetch MAP_MO_FSM_RCVD from peer-VNF platform MAP for the last 2 days.                                                                                                                                               |
|        1568 | PACO     | PACO     | 0.99964 | SS7/IN signalling (CAP/MAP/INAP/TCAP/SCCP/M3UA) - not packet core                                   | What do the available peer-VNF platform MAP measurements show for one reception MO FSM during the last 2 days?                                                                                                      |
|        1569 | MCO      | PLATFORM | 0.99997 | SS7/IN signalling (CAP/MAP/INAP/TCAP/SCCP/M3UA) - not packet core                                   | Please look up MAP_SES_ACK_SENT for the last 2 days in the peer-VNF platform MAP measurements.                                                                                                                      |
|        1570 | PLATFORM | PLATFORM | 0.99909 | SS7/IN signalling (CAP/MAP/INAP/TCAP/SCCP/M3UA) - not packet core                                   | How do the recorded values for send End Signal response sent look over the last 2 days in peer-VNF platform MAP?                                                                                                    |
|        1571 | PACO     | PLATFORM | 0.95378 | SS7/IN signalling (CAP/MAP/INAP/TCAP/SCCP/M3UA) - not packet core                                   | What values were recorded for MAP_UPDATE_PS_LOC_RET_ERR_RCVD over the last 2 days in peer-VNF platform MAP?                                                                                                         |
|        1572 | PLATFORM | PLATFORM | 0.99999 | SS7/IN signalling (CAP/MAP/INAP/TCAP/SCCP/M3UA) - not packet core                                   | I need to review update GPRS Location Error received in peer-VNF platform MAP; show the measurements for the past 2 days.                                                                                           |
|        1577 | IMS      | IMS      | 0.99976 | IMS/SIP subject -> IMS?                                                                             | Get the last 2 days of reported SIPRE_ROUTING_RESELECTION values from peer-VNF platform Routing.                                                                                                                    |
|        1581 | IMS      | IMS      | 0.99906 | SS7/IN signalling (CAP/MAP/INAP/TCAP/SCCP/M3UA) - not packet core                                   | Retrieve the timestamped SCCP_CONN_REFUSE_RCVD measurements for the past 2 days from peer-VNF platform SCCP.                                                                                                        |
|        1582 | IMS      | IMS      | 0.99924 | SS7/IN signalling (CAP/MAP/INAP/TCAP/SCCP/M3UA) - not packet core                                   | Show the readings related to SCCP CREF received in peer-VNF platform SCCP for the past 2 days.                                                                                                                      |
|        1583 | IMS      | IMS      | 0.99968 | SS7/IN signalling (CAP/MAP/INAP/TCAP/SCCP/M3UA) - not packet core                                   | Please look up SCCP_XUDTS_RCVD for the last 2 days in the peer-VNF platform SCCP measurements.                                                                                                                      |
|        1584 | IMS      | IMS      | 0.99929 | SS7/IN signalling (CAP/MAP/INAP/TCAP/SCCP/M3UA) - not packet core                                   | I need to review SCCP XUDT S received in peer-VNF platform SCCP; show the measurements for the past 2 days.                                                                                                         |
|        1585 | MCO      | MCO      | 1       | messaging (SMS/SMTP/MMS) -> MCO?                                                                    | Looking at peer-VNF platform SMTP, what does SMTP_HELO_EHLO_504_RCVD show for the past 2 days?                                                                                                                      |
|        1586 | MCO      | PLATFORM | 0.87792 | messaging (SMS/SMTP/MMS) -> MCO?                                                                    | I need to review rsp 504 for cmd helo/ehlo received in peer-VNF platform SMTP; show the measurements for the past 2 days.                                                                                           |
|        1587 | MCO      | MCO      | 1       | messaging (SMS/SMTP/MMS) -> MCO?                                                                    | Show the available SMTP_QUIT_221_RCVD samples over the past 2 days from peer-VNF platform SMTP.                                                                                                                     |
|        1588 | MCO      | MCO      | 0.51496 | messaging (SMS/SMTP/MMS) -> MCO?                                                                    | Pull up the last 2 days of peer-VNF platform SMTP data related to rsp 221 for cmd quit received.                                                                                                                    |
|        1589 | MCO      | MCO      | 0.99997 | messaging (SMS/SMTP/MMS) -> MCO?                                                                    | Please look up SMTP_VRFY_252_RCVD for the last 2 days in the peer-VNF platform SMTP measurements.                                                                                                                   |
|        1590 | MCO      | PLATFORM | 0.47605 | messaging (SMS/SMTP/MMS) -> MCO?                                                                    | Show the readings related to rsp 252 for cmd vrfy received in peer-VNF platform SMTP for the past 2 days.                                                                                                           |
|        1591 | MCO      | MCO      | 0.99997 | messaging (SMS/SMTP/MMS) -> MCO?                                                                    | What values were recorded for SMTP_MM4_DELIVERY_REPORT_RES_SND_MESSAGE_FORAMT_CORRUPT over the last 2 days in peer-VNF platform SMTP MM4?                                                                           |
|        1592 | MCO      | MCO      | 0.99979 | messaging (SMS/SMTP/MMS) -> MCO?                                                                    | I'd like the last 2 days of measurements for sent MM4 Delivery Report Response with Request Status Code ? ERROR MESSAGE FORAMT C ORRUPT from peer-VNF platform SMTP MM4.                                            |
|        1593 | MCO      | MCO      | 0.99959 | messaging (SMS/SMTP/MMS) -> MCO?                                                                    | Retrieve the timestamped SMTP_MM4_FWD_RES_RCVD_ERROR_SENDING_ADDRESS_UNRESOLVED measurements for the past 2 days from peer-VNF platform SMTP MM4.                                                                   |
|        1594 | MCO      | MCO      | 0.96059 | messaging (SMS/SMTP/MMS) -> MCO?                                                                    | Can you check on receiving MM4 Forward Response with "Request Status Code -ERROR SENDING ADDRESS UNRESOL VED" in peer-VNF platform SMTP MM4 over the last 2 days?                                                   |
|        1595 | MCO      | MCO      | 0.99995 | messaging (SMS/SMTP/MMS) -> MCO?                                                                    | Show the available SMTP_MM4_READREPLY_REPORT_RES_RCV_NETWORK_PROBLEM samples over the past 2 days from peer-VNF platform SMTP MM4.                                                                                  |
|        1596 | MCO      | PLATFORM | 0.99522 | messaging (SMS/SMTP/MMS) -> MCO?                                                                    | What do the available peer-VNF platform SMTP MM4 measurements show for received MM4 read-reply report responses indicating a network problem during the last 2 days?                                                |
|        1599 | PLATFORM | PLATFORM | 0.99643 | SS7/IN signalling (CAP/MAP/INAP/TCAP/SCCP/M3UA) - not packet core                                   | I need the recorded TCAP_CMP_RCVD samples from peer-VNF platform TCAP for the last 2 days.                                                                                                                          |
|        1600 | RAN      | PLATFORM | 0.46567 | SS7/IN signalling (CAP/MAP/INAP/TCAP/SCCP/M3UA) - not packet core                                   | I'm checking times TCAP Component received. Bring up the related peer-VNF platform TCAP measurements for the last 2 days.                                                                                           |
|        1601 | PLATFORM | PLATFORM | 0.99999 | SS7/IN signalling (CAP/MAP/INAP/TCAP/SCCP/M3UA) - not packet core                                   | Retrieve the timestamped TCAP_CWOP_RCVD measurements for the past 2 days from peer-VNF platform TCAP.                                                                                                               |
|        1602 | PLATFORM | PLATFORM | 0.99986 | SS7/IN signalling (CAP/MAP/INAP/TCAP/SCCP/M3UA) - not packet core                                   | Can you retrieve the timestamped measurements concerning times TCAP Conversation Without Permission received (ANSI only) from peer-VNF platform TCAP for the last 2 days?                                           |

## Appendix F — Proposed 100-query regression test set
|   Excel Row | category                                                          | segment            | fam                   | pickA    | pickB    |   confB | Query                                                                                                                                                                                                                                               |
|------------:|:------------------------------------------------------------------|:-------------------|:----------------------|:---------|:---------|--------:|:----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
|         481 | C1 Ownership ambiguous / likely mislabeled                        | persistently wrong | AMF                   | MCO      | MCO      | 1       | For SMS over NAS failure, do UE SMS-support indication, AMF SMS-allowed indication, subscription checking and SMSF selection agree?                                                                                                                 |
|          45 | C1 Ownership ambiguous / likely mislabeled                        | persistently wrong | AUSF                  | IMS      | IMS      | 1       | For EPS or IMS authentication failures at the UDM boundary, inspect existing HSS GetHssAv request outcomes separately from AUSF Get outcomes without exposing authentication material.                                                              |
|         553 | C1 Ownership ambiguous / likely mislabeled                        | persistently wrong | MME                   | IMS      | IMS      | 1       | For a dropped IMS call during LTE-to-CS mobility, does the attempted SRVCC handover type match the documented MME Sv-supported scenarios?                                                                                                           |
|         590 | C1 Ownership ambiguous / likely mislabeled                        | persistently wrong | MME                   | MCO      | MCO      | 0.99997 | Could the documented NB-S1 UE capability prerequisites explain failure of SMS over MME SGs for a control-plane-only IoT device?                                                                                                                     |
|        1479 | C1 Ownership ambiguous / likely mislabeled                        | regressed          | NFV platform (infra)  | PACO     | PLATFORM | 0.95076 | How are NFV platform alarms and events viewed and regenerated when checking monitoring visibility?                                                                                                                                                  |
|        1463 | C1 Ownership ambiguous / likely mislabeled                        | persistently wrong | NFV platform (infra)  | IMS      | MCO      | 0.99788 | How can inode usage be investigated separately from free disk capacity for the database inode-threshold NFV alarm?                                                                                                                                  |
|        1466 | C1 Ownership ambiguous / likely mislabeled                        | persistently wrong | NFV platform (infra)  | IMS      | MDE      | 0.54172 | How do the documented iostat and NFV process checks help investigate excessive disk I/O utilization?                                                                                                                                                |
|        1337 | C1 Ownership ambiguous / likely mislabeled                        | persistently wrong | Provisioning Gateway  | IMS      | IMS      | 1       | How are partial IMS HSS service creation, Provisioning Gateway rollback and rollback failure reported in the asynchronous result and alarms?                                                                                                        |
|          46 | C1 Ownership ambiguous / likely mislabeled                        | persistently wrong | UDM/UDR/UDSF          | MCO      | MCO      | 1       | For SMS-only subscription failures, compare existing UDM SMS subscription and SMS management dataset retrievals, including any combined multi-dataset request.                                                                                      |
|         902 | C1 Ownership ambiguous / likely mislabeled                        | persistently wrong | ePDG                  | IMS      | IMS      | 0.74058 | Looking at ePDG Functional, what does EPDG_PDN_CONN_SETUP_PCSCF_OVERRIDE_ATTEMPTS show for the past 2 days?                                                                                                                                         |
|        1497 | C1 Ownership ambiguous / likely mislabeled                        | regressed          | peer-VNF platform     | PACO     | PLATFORM | 1       | Bring up CAP_PA_INV_RCVD for peer-VNF platform CAP over the last 2 days, keeping the recorded timestamps.                                                                                                                                           |
|        1517 | C1 Ownership ambiguous / likely mislabeled                        | persistently wrong | peer-VNF platform     | IMS      | IMS      | 1       | Please look up NUM_CCA_RESP_RCVD_WITH_RC_9001 for the last 2 days in the peer-VNF platform DIAMRE RO INTERFACE measurements.                                                                                                                        |
|        1500 | C1 Ownership ambiguous / likely mislabeled                        | persistently wrong | peer-VNF platform     | MCO      | MCO      | 1       | I'm checking received Reset Timer for SMS (RST SMS). Bring up the related peer-VNF platform CAP measurements for the last 2 days.                                                                                                                   |
|        1501 | C1 Ownership ambiguous / likely mislabeled                        | persistently wrong | peer-VNF platform     | MDE      | MDE      | 0.99994 | Get the last 2 days of reported AVG_CDR_FILE_SIZE values from peer-VNF platform CAS charging records.                                                                                                                                               |
|        1557 | C1 Ownership ambiguous / likely mislabeled                        | regressed          | peer-VNF platform     | PACO     | PLATFORM | 1       | Retrieve the timestamped M3UA_DAUD_RCVD measurements for the past 2 days from peer-VNF platform M3UA.                                                                                                                                               |
|         510 | C2 Generic term overrides a named PACO NF                         | regressed          | AMF                   | PACO     | RAN      | 0.53647 | During recovery from N2 overload, did AMF send revised reduction percentages or OVERLOAD STOP to the same affected RAN nodes?                                                                                                                       |
|        1632 | C2 Generic term overrides a named PACO NF                         | regressed          | AMF                   | PACO     | IMS      | 0.88171 | I need to enable subscriber level tracing for a SUPI on the AMF, which parameters are involved and does the change need a restart or a pod rollout?                                                                                                 |
|        1818 | C2 Generic term overrides a named PACO NF                         | regressed          | AUSF                  | PACO     | MCO      | 0.99999 | I need to activate a subscriber trace on the N12 interface on the AUSF, which mCMS or CLI parameters are involved and does the change need a restart or a pod rollout?                                                                              |
|         260 | C2 Generic term overrides a named PACO NF                         | regressed          | AUSF                  | PACO     | IMS      | 0.99994 | How do the recorded values for liveness-probe responses sent by the authentication service look over the last 2 days in AUSF request handling?                                                                                                      |
|         346 | C2 Generic term overrides a named PACO NF                         | regressed          | AUSF                  | PACO     | PLATFORM | 0.99999 | I'm checking total bytes transmitted to Kafka brokers. Bring up the related AUSF NF management measurements for the last 2 days.                                                                                                                    |
|         393 | C2 Generic term overrides a named PACO NF                         | regressed          | AUSF                  | PACO     | MDE      | 1       | Can you check total security-edge-proxy subscription renewal attempts sent before expiry in AUSF SEPP interaction over the last 2 days?                                                                                                             |
|         181 | C2 Generic term overrides a named PACO NF                         | persistently wrong | AUSF                  | IMS      | RAN      | 0.99913 | For resynchronization failure, does evidence point to missing SUPI/SUCI or AUSF authentication vector data from UDM rather than a UDSF storage failure?                                                                                             |
|        1847 | C2 Generic term overrides a named PACO NF                         | regressed          | AUSF                  | PACO     | MCO      | 0.99994 | Export AUSF_NAUSF_EAP_AKA_SESSION_INVALID_MSG_FORMAT_COUNT for the 02:00 to 04:00 maintenance window and compare it with the hour before.                                                                                                           |
|         192 | C2 Generic term overrides a named PACO NF                         | regressed          | AUSF                  | PACO     | IMS      | 0.99982 | Does existing get_ausf_version output show a consistent build across AUSF instances involved in the incident?                                                                                                                                       |
|         155 | C2 Generic term overrides a named PACO NF                         | regressed          | AUSF                  | PACO     | PLATFORM | 0.99984 | Does AUSF KafkaConnectionDown match loss of broker connectivity or incorrect configured broker host and port during telemetry loss?                                                                                                                 |
|         391 | C2 Generic term overrides a named PACO NF                         | regressed          | AUSF                  | PACO     | MDE      | 0.99999 | How do the recorded values for security-edge-proxy subscription renewal attempts that failed look over the last 2 days in AUSF SEPP interaction?                                                                                                    |
|        1665 | C2 Generic term overrides a named PACO NF                         | regressed          | CCLB                  | PACO     | PLATFORM | 0.9638  | CCLB_HA_ACTIVE_SESSION_BACKUP_SENT_TOTAL is much higher than yesterday at the same time, what changed?                                                                                                                                              |
|        1667 | C2 Generic term overrides a named PACO NF                         | regressed          | CCLB                  | PACO     | PLATFORM | 0.92289 | CCLB_HA_ACTIVE_SESSION_BACKUP_SENT_TOTAL spiked in the last 30 minutes, is it still ongoing or already recovered?                                                                                                                                   |
|        1757 | C2 Generic term overrides a named PACO NF                         | regressed          | MDPLB                 | PACO     | IMS      | 0.98038 | What was the peak of MDPLB_SESSION_SCTP_HEARTBEAT_RX_UL_DELTA over the past 7 days and when did it happen?                                                                                                                                          |
|         580 | C2 Generic term overrides a named PACO NF                         | persistently wrong | MME                   | IMS      | IMS      | 1       | Could RAT remapping policy explain a terrestrial, NB-IoT or satellite RAT value reported to HSS that differs from the MME-served UE's apparent access?                                                                                              |
|         568 | C2 Generic term overrides a named PACO NF                         | persistently wrong | MME                   | CMS      | CMS      | 0.6488  | For missing NSA dual connectivity, what UE capability and MME DCNR configuration evidence explains the eligibility decision?                                                                                                                        |
|          78 | C2 Generic term overrides a named PACO NF                         | regressed          | PCF/PCRF/policy       | PACO     | MCO      | 0.99985 | For notifications missing at UDM or PCF, inspect existing udr-notify delivery evidence and whether the affected consumer previously subscribed.                                                                                                     |
|          11 | C2 Generic term overrides a named PACO NF                         | persistently wrong | PCF/PCRF/policy       | IMS      | IMS      | 0.99977 | Rx authorization through the PCF Diam-IWF is failing. Can you inspect the existing AAR/AAA exchanges and separate this from an SM policy SBI failure?                                                                                               |
|           5 | C2 Generic term overrides a named PACO NF                         | persistently wrong | PCF/PCRF/policy       | MDE      | MDE      | 1       | For an unexpected charging destination, inspect whether the PCF supplied CHF addresses in the existing PCC rule before downstream selection used other sources.                                                                                     |
|        1642 | C2 Generic term overrides a named PACO NF                         | regressed          | SMF/UPF/PDU session   | PACO     | PLATFORM | 0.98586 | RCA needed for an incident where PDU session modification fails after a handover, what is the most likely root cause and how do we confirm it?                                                                                                      |
|          89 | C2 Generic term overrides a named PACO NF                         | persistently wrong | SMF/UPF/PDU session   | IMS      | MCO      | 0.54202 | For S6b AAA reachability failures, inspect the existing SMF-to-local-DRA path before attributing failure to direct AAA connectivity.                                                                                                                |
|        1643 | C2 Generic term overrides a named PACO NF                         | regressed          | SMF/UPF/PDU session   | PACO     | PLATFORM | 0.97813 | RCA needed for an incident where AN release sometimes causes the PDU session to be lost, what is the most likely root cause and how do we confirm it?                                                                                               |
|          99 | C2 Generic term overrides a named PACO NF                         | persistently wrong | UDM/UDR/UDSF          | RAN      | PLATFORM | 0.99752 | For a database cluster that has not recovered automatically, inspect existing udsf-db-admin monitoring and healing evidence without triggering repair.                                                                                              |
|        1644 | C2 Generic term overrides a named PACO NF                         | persistently wrong | UDM/UDR/UDSF          | IMS      | MCO      | 0.99581 | RCA needed for an incident where subscriber data is purged while the UE is still attached, what is the most likely root cause and how do we confirm it?                                                                                             |
|          67 | C2 Generic term overrides a named PACO NF                         | persistently wrong | UDM/UDR/UDSF          | PLATFORM | IMS      | 0.42201 | For prolonged database outages, inspect recorded operator intervention and whether consumers moved to a remote UDR; flag the HLD's unresolved x-second threshold rather than invent a timeout.                                                      |
|         106 | C2 Generic term overrides a named PACO NF                         | persistently wrong | UDM/UDR/UDSF          | PLATFORM | MDE      | 0.99998 | A Couchbase pod backing UDSF has failed. Inspect existing replica promotion, cluster-map updates and client adoption of the new active vBucket locations.                                                                                           |
|          79 | C2 Generic term overrides a named PACO NF                         | persistently wrong | UDM/UDR/UDSF          | PLATFORM | PLATFORM | 0.99616 | After local database recovery, inspect the current UDR-to-database connection and prior operator records for return to the local cluster; do not initiate reconnection.                                                                             |
|        1639 | C2 Generic term overrides a named PACO NF                         | persistently wrong | UDM/UDR/UDSF          | MDE      | MCO      | 0.98894 | Investigate why subscriber data is purged while the UE is still attached, pull the related counters and logs and tell us what stands out.                                                                                                           |
|        1289 | C3 PACO product not recognised + shared protocol/infra vocabulary | regressed          | Media Engine          | PACO     | MCO      | 0.99941 | What values were recorded for TCP SYN fragment drops over the last 2 days in Media Engine Security?                                                                                                                                                 |
|        1230 | C3 PACO product not recognised + shared protocol/infra vocabulary | persistently wrong | Media Engine          | IMS      | PLATFORM | 0.99998 | Pull up the last 2 days of Media Engine NAT44 data related to packets dropped due to "hairpinning loop".                                                                                                                                            |
|        1297 | C3 PACO product not recognised + shared protocol/infra vocabulary | regressed          | Media Engine          | PACO     | IMS      | 0.95626 | Could you check the recent Media Engine TCP Optimizer readings for dl_spi_failure, covering the last 2 days?                                                                                                                                        |
|        1164 | C3 PACO product not recognised + shared protocol/infra vocabulary | regressed          | Media Engine          | PACO     | MDE      | 0.95761 | Can you pull the last 2 days of bfd_echo_packets_sen for Media Engine BFD?                                                                                                                                                                          |
|        1155 | C3 PACO product not recognised + shared protocol/infra vocabulary | persistently wrong | Media Engine          | CMS      | CMS      | 0.99996 | The Media Engine generates CGNAT syslog records, but they do not reach their destination. What existing logging configuration should be inspected?                                                                                                  |
|        1191 | C3 PACO product not recognised + shared protocol/infra vocabulary | persistently wrong | Media Engine          | RAN      | RAN      | 0.81832 | Bring up drops for Media Engine FTP over the last 2 days, keeping the recorded timestamps.                                                                                                                                                          |
|        1282 | C3 PACO product not recognised + shared protocol/infra vocabulary | regressed          | Media Engine          | PACO     | MCO      | 0.99872 | Show the available tcp_null_flags_drops samples over the past 2 days from Media Engine Security.                                                                                                                                                    |
|        1229 | C3 PACO product not recognised + shared protocol/infra vocabulary | persistently wrong | Media Engine          | PLATFORM | PLATFORM | 0.99976 | Please look up hairpinning_loop_drops for the last 2 days in the Media Engine NAT44 measurements.                                                                                                                                                   |
|        1368 | C3 PACO product not recognised + shared protocol/infra vocabulary | regressed          | Provisioning Gateway  | PACO     | MDE      | 0.54817 | Get the last 2 days of reported PROVGW_KAFKA_DATABUS_RCV_RESPONSE_SUCCESS values from Provisioning Gateway northbound Kafka notifications.                                                                                                          |
|        1366 | C3 PACO product not recognised + shared protocol/infra vocabulary | regressed          | Provisioning Gateway  | PACO     | PLATFORM | 0.99996 | Get the last 2 days of reported PROVGW_KAFKA_DATABUS_RCV_RESPONSE_ERR__TRANSPORT values from Provisioning Gateway northbound Kafka notifications.                                                                                                   |
|        1378 | C3 PACO product not recognised + shared protocol/infra vocabulary | regressed          | Provisioning Gateway  | PACO     | MCO      | 0.99141 | Fetch PROVGW_NB_HTTP_SND_RESPONSE_2XX from Provisioning Gateway northbound HTTP for the last 2 days.                                                                                                                                                |
|        1348 | C3 PACO product not recognised + shared protocol/infra vocabulary | persistently wrong | Provisioning Gateway  | CMS      | CMS      | 0.82727 | How can configured retry counts and continue-versus-terminate behavior be reviewed for repeated northbound or Provisioning Gateway southbound failures?                                                                                             |
|        1377 | C3 PACO product not recognised + shared protocol/infra vocabulary | persistently wrong | Provisioning Gateway  | MDE      | MDE      | 1       | Pull up the last 2 days of Provisioning Gateway northbound HTTP data related to 202 OK responses sent to requests.                                                                                                                                  |
|        1352 | C3 PACO product not recognised + shared protocol/infra vocabulary | regressed          | Provisioning Gateway  | PACO     | PLATFORM | 0.99962 | Please look up PROVGW_KAFKA_DATABUS_RCV_RESPONSE_ERR_BROKER_NOT_AVAILABLE for the last 2 days in the Provisioning Gateway northbound Kafka notifications measurements.                                                                              |
|        1099 | C3 PACO product not recognised + shared protocol/infra vocabulary | regressed          | SeGW                  | PACO     | MCO      | 0.99997 | Looking at SeGW IPsec ESP, what does DP_IPSEC_PEAK_TRANSPORT show for the past 2 days?                                                                                                                                                              |
|        1010 | C3 PACO product not recognised + shared protocol/infra vocabulary | persistently wrong | SeGW                  | IMS      | IMS      | 1       | Can you pull the last 2 days of NUM_ECA_RESP_RCVD_WITH_RC_2001 for SeGW DIAMRE equipment-identity checking?                                                                                                                                         |
|        1004 | C3 PACO product not recognised + shared protocol/infra vocabulary | persistently wrong | SeGW                  | CMS      | CMS      | 0.99999 | How can the documented show configuration options be used to capture the current SeGW configuration before an incident change?                                                                                                                      |
|        1046 | C3 PACO product not recognised + shared protocol/infra vocabulary | persistently wrong | SeGW                  | IMS      | MDE      | 1       | Looking at SeGW IKEv2, what does NUM_IKESA_SETUP_FAILED_BUILD_CFG_REPLY show for the past 2 days?                                                                                                                                                   |
|        1005 | C3 PACO product not recognised + shared protocol/infra vocabulary | persistently wrong | SeGW                  | CMS      | PLATFORM | 0.55666 | How can the fast-path configuration and SeGW DPDK core-to-port mapping be checked for an affected forwarding instance?                                                                                                                              |
|         999 | C3 PACO product not recognised + shared protocol/infra vocabulary | persistently wrong | SeGW                  | RAN      | RAN      | 0.81024 | How can request fpath fp-SeGW CPU-usage be used to inspect forwarding CPU consumption during a traffic incident?                                                                                                                                    |
|        1105 | C3 PACO product not recognised + shared protocol/infra vocabulary | regressed          | SeGW                  | PACO     | MCO      | 0.93154 | I'd like to check DP_IPSEC_TUNNEL_INACTIVITY_TIMEOUT_PEAK_RATE in SeGW IPsec ESP. Retrieve its readings for the last 2 days.                                                                                                                        |
|        1011 | C3 PACO product not recognised + shared protocol/infra vocabulary | persistently wrong | SeGW                  | IMS      | IMS      | 1       | I'd like to check NUM_ECA_RESP_RCVD_WITH_RC_5003 in SeGW DIAMRE equipment-identity checking. Retrieve its readings for the last 2 days.                                                                                                             |
|         691 | C3 PACO product not recognised + shared protocol/infra vocabulary | persistently wrong | ePDG                  | MCO      | MCO      | 1       | Which control-plane message initiators should be checked when verifying the supported S2b signaling flows?                                                                                                                                          |
|         825 | C3 PACO product not recognised + shared protocol/infra vocabulary | regressed          | ePDG                  | PACO     | IMS      | 1       | Looking at ePDG Latency, what does EPDG_DIAM_AVG_LATENCY show for the past 2 days?                                                                                                                                                                  |
|         644 | C3 PACO product not recognised + shared protocol/infra vocabulary | regressed          | ePDG                  | PACO     | MDE      | 0.45336 | How does centralized ePDG management retain application configuration while exposing cloud-native lifecycle functions through APIs?                                                                                                                 |
|         821 | C3 PACO product not recognised + shared protocol/infra vocabulary | regressed          | ePDG                  | PACO     | PLATFORM | 0.87494 | Bring up EPDG_DP_IPSEC_TOTAL_TRANSPORT for ePDG IPsec over the last 2 days, keeping the recorded timestamps.                                                                                                                                        |
|         776 | C3 PACO product not recognised + shared protocol/infra vocabulary | persistently wrong | ePDG                  | IMS      | MCO      | 1       | Can you check security-association establishment failures caused by an unacceptable message sequence identity in ePDG IKE over the last 2 days?                                                                                                     |
|         829 | C3 PACO product not recognised + shared protocol/infra vocabulary | regressed          | ePDG                  | PACO     | IMS      | 1       | Could you check the recent ePDG Latency readings for EPDG_DIAM_MIN_LATENCY, covering the last 2 days?                                                                                                                                               |
|        1511 | C3 PACO product not recognised + shared protocol/infra vocabulary | regressed          | peer-VNF platform     | PACO     | PLATFORM | 0.99999 | Looking at peer-VNF platform database adapter manager, what does DB_ADAPTER_MGR_LATENCY_MIN show for the past 2 days?                                                                                                                               |
|        1464 | C3 PACO product not recognised + shared protocol/infra vocabulary | persistently wrong | peer-VNF platform     | IMS      | IMS      | 1       | How do peer-VNF flow-control connection creation/release, active tracks and no-free-entry or missing-flow drops describe a VLB forwarding incident?                                                                                                 |
|        1613 | C3 PACO product not recognised + shared protocol/infra vocabulary | regressed          | peer-VNF platform     | PACO     | MCO      | 0.99999 | I need the recorded WAS_HTTP_REQ_ROUTE_NOT_FOUND samples from peer-VNF platform WAS HTTP message handling for the last 2 days.                                                                                                                      |
|        1532 | C3 PACO product not recognised + shared protocol/infra vocabulary | persistently wrong | peer-VNF platform     | IMS      | MDE      | 0.99999 | How do the recorded values for DEA response messages received with result code '5XXX'. This KPI doesn't include result codes 5001, 5003, 5004, 5005, 5012, 5050, 5051 and 5052 look over the last 2 days in peer-VNF platform DIAMRE SWM INTERFACE? |
|        1533 | C3 PACO product not recognised + shared protocol/infra vocabulary | regressed          | peer-VNF platform     | PACO     | PLATFORM | 0.99999 | Can you pull the last 2 days of CID_AVG_DISK_RES_UTIL for peer-VNF platform Disk Overload?                                                                                                                                                          |
|        1513 | C3 PACO product not recognised + shared protocol/infra vocabulary | persistently wrong | peer-VNF platform     | IMS      | IMS      | 1       | What values were recorded for RE_PERF_DIAMRE_AVG_LATENCY over the last 2 days in peer-VNF platform DIAMRE?                                                                                                                                          |
|        1493 | C3 PACO product not recognised + shared protocol/infra vocabulary | regressed          | peer-VNF platform     | PACO     | PLATFORM | 0.99997 | Please look up CID_AVG_AVAIL_HD_SPACE for the last 2 days in the peer-VNF platform Average Overload measurements.                                                                                                                                   |
|        1276 | C4 PACO product not recognised (pure coverage gap)                | persistently wrong | Media Engine          | MCO      | MCO      | 1       | What values were recorded for setup_messages over the last 2 days in Media Engine RTSP?                                                                                                                                                             |
|        1264 | C4 PACO product not recognised (pure coverage gap)                | regressed          | Media Engine          | PACO     | MDE      | 0.97502 | I'm checking processed Outgoing Call Replies. Bring up the related Media Engine PPTP measurements for the last 2 days.                                                                                                                              |
|        1268 | C4 PACO product not recognised (pure coverage gap)                | regressed          | Media Engine          | PACO     | PLATFORM | 0.86675 | I'd like the last 2 days of measurements for addresses currently used (for pools of type "nat") from Media Engine Pool Stats.                                                                                                                       |
|        1193 | C4 PACO product not recognised (pure coverage gap)                | persistently wrong | Media Engine          | RAN      | RAN      | 0.72183 | Looking at Media Engine FTP, what does translations show for the past 2 days?                                                                                                                                                                       |
|        1332 | C4 PACO product not recognised (pure coverage gap)                | persistently wrong | Provisioning Gateway  | MDE      | MDE      | 0.99998 | How can ValidationService, WorkflowService, ConnectorService, NotificationService and DbGw be followed to locate a stalled Provisioning Gateway provisioning transaction?                                                                           |
|         984 | C4 PACO product not recognised (pure coverage gap)                | persistently wrong | SeGW                  | RAN      | MCO      | 0.99996 | How can the separate IPv4 and IPv6 SeGW fast-path statistics localize a family-specific forwarding failure?                                                                                                                                         |
|         949 | C4 PACO product not recognised (pure coverage gap)                | persistently wrong | SeGW                  | PLATFORM | PLATFORM | 0.94713 | For SeGW vLB forwarding state missing from fast path, inspect existing SECP flow-information delivery to vLB-FE before blaming the selected SEDP.                                                                                                   |
|         764 | C4 PACO product not recognised (pure coverage gap)                | persistently wrong | ePDG                  | MCO      | MCO      | 0.99999 | I'd like the last 2 days of measurements for received internet control messages asking a sender to reduce traffic from ePDG Data Path.                                                                                                              |
|         848 | C4 PACO product not recognised (pure coverage gap)                | persistently wrong | ePDG                  | MDE      | MDE      | 0.99998 | Pull up the last 2 days of ePDG Peak System Transaction data related to mean sampled outgoing gateway-control traffic bandwidth in megabits per second.                                                                                             |
|         677 | C4 PACO product not recognised (pure coverage gap)                | persistently wrong | ePDG                  | PLATFORM | PLATFORM | 1       | How are node measurements collected centrally and organized into independently enabled ePDG performance groups?                                                                                                                                     |
|         839 | C4 PACO product not recognised (pure coverage gap)                | persistently wrong | ePDG                  | IMS      | IMS      | 1       | Show the available EPDG_DIAM_AVG samples over the past 2 days from ePDG Peak System Transaction.                                                                                                                                                    |
|         758 | C4 PACO product not recognised (pure coverage gap)                | persistently wrong | ePDG                  | MCO      | MCO      | 0.99981 | I'd like the last 2 days of measurements for received internet control messages answering a reachability probe from ePDG Data Path.                                                                                                                 |
|        1573 | C4 PACO product not recognised (pure coverage gap)                | regressed          | peer-VNF platform     | PACO     | PLATFORM | 0.99979 | Retrieve the timestamped MTP3_UPU_RCVD measurements for the past 2 days from peer-VNF platform MTP3.                                                                                                                                                |
|        1609 | C4 PACO product not recognised (pure coverage gap)                | persistently wrong | peer-VNF platform     | IMS      | IMS      | 1       | I'd like to check UAGU_DP_DISCARD_REASON_RATE_LIMITING in peer-VNF platform UAG Data Path. Retrieve its readings for the last 2 days.                                                                                                               |
|        1475 | C4 PACO product not recognised (pure coverage gap)                | persistently wrong | peer-VNF platform     | MDE      | MDE      | 0.99991 | Which peer-VNF Ro credit-control timeout, result-code and experimental-result measurements help localize charging failures where Ro is deployed?                                                                                                    |
|        1505 | C4 PACO product not recognised (pure coverage gap)                | regressed          | peer-VNF platform     | PACO     | PLATFORM | 0.99934 | Please look up TOTAL_TRL_FAILED_TO_SYNC_PER_VNFID for the last 2 days in the peer-VNF platform CAS transaction logs measurements.                                                                                                                   |
|          23 | C5 Other (observability/LI/mesh/unidentified)                     | persistently wrong | MTCIL / observability | IMS      | MCO      | 1       | For missing threshold-crossed alarms, inspect whether the documented metric threshold and duration conditions were met before tracing the MTCIL alarm path.                                                                                         |
|          26 | C5 Other (observability/LI/mesh/unidentified)                     | persistently wrong | MTCIL / observability | MCO      | MCO      | 0.99937 | Using existing alarm samples, compare MTCIL-originated alarm visibility in mCMS and Mavenir Analytics without creating test alarms.                                                                                                                 |
|         121 | C5 Other (observability/LI/mesh/unidentified)                     | persistently wrong | Service mesh / mTLS   | PLATFORM | MCO      | 0.89277 | For mTLS connection failures on a documented mesh path, inspect existing client/server certificate assignment and https scheme consistency in authority, location and payload URIs without collecting private keys.                                 |
|        1795 | C5 Other (observability/LI/mesh/unidentified)                     | persistently wrong | Subscriber migration  | RAN      | RAN      | 0.9294  | Radio paging load rose during the subscriber move, is it the migration?                                                                                                                                                                             |
|        1636 | C5 Other (observability/LI/mesh/unidentified)                     | persistently wrong | Unidentified          | PLATFORM | PLATFORM | 0.98947 | Investigate why session recovery after a pod loss takes much longer than designed, pull the related counters and logs and tell us what stands out.                                                                                                  |
|        1641 | C5 Other (observability/LI/mesh/unidentified)                     | persistently wrong | Unidentified          | PLATFORM | PLATFORM | 0.61125 | RCA needed for an incident where session recovery after a pod loss takes much longer than designed, what is the most likely root cause and how do we confirm it?                                                                                    |


## Appendix G — Code

### scripts/load.py
```python
import pandas as pd, re
D='data/'
FA=D+'df248164-Laya-router-results-2026-11-16T06-00-26-329Z-16180.xlsx'
FB=D+'93835066-Laya-router-results-2026-11-18T09-39-39-422Z-146768.xlsx'
def norm(a):
    if pd.isna(a): return 'ERROR'
    return a.replace('-worker','').replace('_worker','').upper()
def load():
    A=pd.read_excel(FA,'Results'); B=pd.read_excel(FB,'Results')
    m=A[['Excel Row','Query','Picked Agent','Confidence','Verdict']].merge(
      B[['Excel Row','Picked Agent','Confidence','Verdict','Error']],on='Excel Row',suffixes=('_A','_B'))
    m['pickA']=m['Picked Agent_A'].map(norm); m['pickB']=m['Picked Agent_B'].map(norm)
    m['confA']=m['Confidence_A']; m['confB']=m['Confidence_B']
    m['vA']=m['Verdict_A']; m['vB']=m['Verdict_B']
    return m
# Product family = the network function / product the query is about (ordered: first match wins)
PRODUCTS=[
 ('peer-VNF platform', r'peer-vnf'),
 ('NFV platform (infra)', r'\bnfv\b|virtual load-balancer'),
 ('Provisioning Gateway', r'provisioning gateway|provgw|\bdbgw\b'),
 ('Media Engine', r'media engine|\bme\b|cgnat|nat44|nat64'),
 ('SeGW', r'\bsegw\b|uag-seg'),
 ('ePDG', r'\bepdg\b|\bs2b\b'),
 ('CCLB', r'\bcclb'),
 ('MDPLB', r'\bmdplb'),
 ('AUSF', r'ausf'),
 ('PCF/PCRF/policy', r'\bpcf|\bpcrf\b|pcc rule|\bpcc\b|sm policy|policy (control|decision|rule|association)|\bn7\b|\bgx\b|\brx\b|\bsy\b|predefined rule|charging rule'),
 ('SMF/UPF/PDU session', r'\bsmf\b|\bupf\b|\bpfcp\b|\bsaegw|\bpgw\b|\bsgw\b|\bn4\b|nsmf|pdu session|session management relay|\bdnn\b'),
 ('AMF', r'\bamf|namf'),
 ('MME', r'\bmme\b'),
 ('UDM/UDR/UDSF', r'\budm\b|\budr\b|\budsf\b|udr-db|nudr|nudm|nudsf|subscriber data'),
 ('NRF/NSSF/SCP/SEPP', r'\bnrf\b|\bnssf\b|\bscp\b|\bsepp\b|service[- ]proxy|servproxy|nnrf|nnssf'),
 ('Lawful Intercept', r'\badmf\b|\blipf\b|\bli_x|\bpoi\b'),
 ('Service mesh / mTLS', r'libmesh|sidecar|mtls|\bmesh\b'),
 ('MTCIL / observability', r'mtcil'),
 ('NWDAF', r'\bnwdaf'),
 ('Subscriber migration', r'migrat'),
 ('Generic HTTP2 counter', r'http2_'),
]
def product(q):
    s=q.lower()
    for name,pat in PRODUCTS:
        if re.search(pat,s): return name
    return 'Unidentified'

```

### scripts/analysis.py
```python
import sys, re, math, collections, json
sys.path.insert(0,'scripts')
import pandas as pd, numpy as np
from load import load, product
pd.set_option('display.max_colwidth',160); pd.set_option('display.width',250)
OUT=open('analysis_out.md','w')
def P(*a):
    s=' '.join(str(x) for x in a); print(s); OUT.write(s+'\n')
def T(df, idx=False): P(df.to_markdown(index=idx)); P('')

m=load(); m['fam']=m.Query.map(product)
N=len(m)
# ---------- 0. reconciliation
P('## 0. Reconciliation')
for r in 'AB':
    v=m['v'+r].value_counts()
    P(f"Run {r}: right={v.get('right',0)} wrong={v.get('wrong',0)} error={v.get('error',0)} total={v.sum()} acc_all={v.get('right',0)/N*100:.2f}% acc_excl_err={v.get('right',0)/(N-v.get('error',0))*100:.2f}%")
err=m[m.vB=='error']; P('Run B error rows:', list(err['Excel Row']))
# per-run wrong flag (errors excluded)
m['wA']=m.vA=='wrong'; m['wB']=m.vB=='wrong'; m['errB']=m.vB=='error'
def seg(r):
    if r.errB: return 'excluded (B error)'
    if r.wA and not r.wB: return 'fixed'
    if not r.wA and r.wB: return 'regressed'
    if r.wA and r.wB: return 'persistently wrong'
    return 'persistently right'
m['segment']=m.apply(seg,axis=1)
P('## 1. Segments'); s=m.segment.value_counts().rename('count').to_frame(); s['%of1999']=(s['count']/N*100).round(2); s['%of1990']=(s['count']/(N-len(err))*100).round(2); T(s,True)
P('Error rows (excluded) — their Run A pick:'); T(err[['Excel Row','pickA','Query']])

# ---------- tokenization
ACR=set('PCF PCRF SMF UPF AMF PCC N7 N11 GX RX SY S1 SIP DNN QOS GTP AUSF UDM UDR UDSF NRF NSSF SEPP SCP MME EPDG SEGW IMS PDU UE IKE IKEV2 IPSEC ESP NAT44 NAT64 CGNAT HTTP KPI APN TAC TAU EAP AKA TLS SCTP MAP CAP INAP TCAP M3UA SS7 CDR CCA CCR RAR RAA DIAMETER BGP BFD VRF GRE RTSP TCP UDP ICMP DHCP DNS NFV VNF CPU NF RAN NG GTPC GTPU QCI SUPI SUCI PFCP'.split())
STOP=set('the a an of for in on to from and or is are was were be by with over last past days day 2 2 two its it this that what which how do does did can could should would i i\'d me my we us our you your show pull get fetch retrieve readings measurements values recorded please related data samples bring up look into using covering at as than not any any whether there their these those when while into about between same per'.split())
def toks(q):
    q=re.sub(r'[“”"(),;:?.!\[\]]',' ',q)
    out=[]
    for w in q.split():
        w=w.strip("'-/")
        if not w: continue
        if re.fullmatch(r'[A-Z0-9]+(_[A-Z0-9]+)+',w):   # counter name -> keep + emit its pieces
            out.append('<COUNTER>'); 
            continue
        lw=w.lower()
        out.append(lw)
    return out
def ngrams(q):
    t=toks(q); g=set()
    for n in (1,2,3):
        for i in range(len(t)-n+1):
            gram=t[i:i+n]
            if all(x in STOP for x in gram) : continue
            if gram[0] in STOP or gram[-1] in STOP: continue
            g.add(' '.join(gram))
    return g
m['grams']=m.Query.map(ngrams)
# counter-name pieces too (e.g. EPDG, IKEV2) as separate features
def counter_parts(q):
    s=set()
    for w in re.findall(r'\b[A-Z0-9]+(?:_[A-Z0-9]+)+\b',q):
        for p in w.split('_'):
            if len(p)>1 and not p.isdigit(): s.add('ctr:'+p.lower())
    return s
m['grams']=m.apply(lambda r: r.grams|counter_parts(r.Query),axis=1)

def logodds_table(df, run, agent, minsup=8, top=20):
    pick=df['pick'+run]
    tgt=df[pick==agent]; ok=df[pick=='PACO']
    ct=collections.Counter(g for s in tgt.grams for g in s)
    co=collections.Counter(g for s in ok.grams for g in s)
    nt,no=len(tgt),len(ok); rows=[]
    for g,c in ct.items():
        if c<minsup: continue
        c0=co.get(g,0)
        # smoothed log-odds ratio (Jeffreys +0.5) with z-score
        a,b,cc,d=c+.5,nt-c+.5,c0+.5,no-c0+.5
        lor=math.log(a/b)-math.log(cc/d); se=math.sqrt(1/a+1/b+1/cc+1/d)
        lift=(c/nt)/((c0+.5)/no)
        rows.append((g,c,c0,round(lift,2),round(lor,2),round(lor/se,2),agent))
    t=pd.DataFrame(rows,columns=['term','n_misrouted','n_correct(PACO)','lift','log_odds','z','dest'])
    t=t[t.n_misrouted>=minsup].sort_values(['z'],ascending=False)
    # drop terms subsumed by a longer gram with same count
    keep=[]
    for _,r in t.iterrows():
        if any((r.term in k.term) and k.term!=r.term and k.n_misrouted==r.n_misrouted for k in keep): continue
        keep.append(r)
    return pd.DataFrame(keep).head(top), nt
SHARED=['session','bearer','registration','sip','alarm','kpi','latency','failure','congestion','throttling','authentication','tunnel','ipsec','ike','http','diameter','charging','cdr','sctp','tcp','nat','configuration','disk','cpu','pod','overload','routing','interface','packets dropped','subscriber','ue','handover','paging','qos','policy','dns','certificate','kafka','database','syslog','logging','error','timeout','response','request','throughput','peak','trend','compare']
P('## 2. Over-represented n-grams per wrong destination (smoothed log-odds, Jeffreys prior, min support 8; baseline = queries correctly routed to PACO in the same run)')
all_lo=[]
for run in 'AB':
    for ag in ['IMS','RAN','MCO','MDE','PLATFORM','CMS']:
        t,nt=logodds_table(m,run,ag)
        P(f'### Run {run} -> {ag} (n misrouted={nt})')
        if len(t)==0: P('_no term reaches support >= 8_\n'); continue
        t['shared_vocab']=t.term.map(lambda x: 'YES' if any(re.search(r'\b'+re.escape(s)+r'\b',x) for s in SHARED) else '')
        t['run']=run; all_lo.append(t)
        T(t.drop(columns=['run']))
lo=pd.concat(all_lo); lo.to_csv('logodds_all.csv',index=False)

# ---------- 3. structure
P('## 3. Query-structure features vs misroute rate')
F={}
q=m.Query
F['has counter name (UPPER_SNAKE)']=q.str.contains(r'\b[A-Z0-9]+(?:_[A-Z0-9]+)+\b')
F['template: "last/past 2 days" measurement fetch']=q.str.contains(r'(last|past) 2 days',case=False)
F['question (ends with ?)']=q.str.strip().str.endswith('?')
F['imperative start (Show/Get/Fetch/Pull/Retrieve/Plot/Break/Compare/Investigate)']=q.str.match(r'^(Show|Get|Fetch|Pull|Retrieve|Plot|Break|Compare|Overlay|Investigate|Bring|Please|Can you|Could you|I need|I\'d like)',case=False)
F['how/which/what documented-procedure question']=q.str.match(r'^(How|Which|What)\b') & ~q.str.contains(r'(last|past) 2 days',case=False)
F['troubleshoot verb (check/investigate/why/fails/RCA/root cause)']=q.str.contains(r'\b(investigate|why|fail\w*|rca|root cause|troubleshoot|diagnos\w*)\b',case=False)
F['explicit PACO policy component (PCF/PCRF/PCC/policy/charging/Gx/Rx/Sy/N7)']=q.str.contains(r'\bpcf|\bpcrf\b|\bpcc\b|\bpolicy\b|charging rule|\bgx\b|\brx\b|\bsy\b|\bn7\b',case=False)
F['names a 5GC/EPC NF (AMF/SMF/UPF/AUSF/UDM/UDR/NRF/MME/PCF/NSSF)']=q.str.contains(r'\b(amf|smf|upf|ausf|udm|udr|udsf|nrf|mme|pcf|nssf|sepp)',case=False)
F['names IMS-flavoured term (SIP/P-CSCF/IKE/IPsec/ePDG/VoWiFi/Rx)']=q.str.contains(r'\bsip|cscf|\bike|ipsec|epdg|vowifi|\brx\b',case=False)
F['names RAN-flavoured term (radio/RAN/gNB/eNB/handover/paging/NAT/ports)']=q.str.contains(r'\bradio|\bran\b|gnb|enb|handover|paging|nat44|nat64|\bports?\b',case=False)
F['names platform/infra term (NFV/pod/disk/CPU/alarm/VNF/kafka/database)']=q.str.contains(r'\bnfv|\bpod|disk|\bcpu|alarm|vnf|kafka|database|couchbase|cassandra',case=False)
F['names HTTP status / REST (4xx/5xx/HTTP)']=q.str.contains(r'\b[45]\d\d\b|http',case=False)
F['mentions configuration/config/show command']=q.str.contains(r'configur|\bconfig\b|show (configuration|command)|commands?\b',case=False)
F['length <=14 words']=q.str.split().str.len()<=14
F['length 15-20 words']=q.str.split().str.len().between(15,20)
F['length >20 words']=q.str.split().str.len()>20
rows=[]
valid=~m.errB
for k,v in F.items():
    for flag in (True,False):
        sub=m[(v==flag)]; subB=m[(v==flag)&valid]
        rows.append((k,'yes' if flag else 'no',len(sub),round(sub.wA.mean()*100,1),len(subB),round(subB.wB.mean()*100,1)))
st=pd.DataFrame(rows,columns=['feature','present','n(A)','misroute% A','n(B, excl err)','misroute% B']); T(st)
m['feat_explicit_policy']=F['explicit PACO policy component (PCF/PCRF/PCC/policy/charging/Gx/Rx/Sy/N7)']
m['feat_counter']=F['has counter name (UPPER_SNAKE)']; m['feat_template']=F['template: "last/past 2 days" measurement fetch']
m['nwords']=q.str.split().str.len()

P('### Misroute rate and destination by product family (the dominant variable)')
def famtab(run):
    sub=m[valid] if run=='B' else m
    ct=pd.crosstab(sub.fam, sub['pick'+run])
    ct['n']=ct.sum(axis=1); ct['wrong']=ct['n']-ct.get('PACO',0); ct['misroute%']=(ct.wrong/ct.n*100).round(1)
    ct['top wrong dest']=ct.drop(columns=['n','wrong','misroute%','PACO'],errors='ignore').idxmax(axis=1)
    return ct.sort_values('wrong',ascending=False)
for r in 'AB':
    P(f'#### Run {r}'); T(famtab(r),True)
fam_seg=pd.crosstab(m.fam,m.segment); fam_seg['n']=fam_seg.sum(axis=1); P('#### Segment by product family'); T(fam_seg.sort_values('n',ascending=False),True)

# ---------- 4. confidence
P('## 4. Confidence')
rows=[]
for r in 'AB':
    sub=m[valid] if r=='B' else m
    for lab,mask in (('right',~sub['w'+r]),('wrong',sub['w'+r])):
        c=sub[mask]['conf'+r]
        rows.append((r,lab,len(c),round(c.mean(),3),round(c.median(),4),round(c.quantile(.25),3),(c>=.95).sum(),(c>=.99).sum(),(c<.7).sum()))
T(pd.DataFrame(rows,columns=['run','verdict','n','mean','median','p25','n>=0.95','n>=0.99','n<0.70']))
P('Calibration (Run B): accuracy by confidence bucket')
for r in 'AB':
    sub=(m[valid] if r=='B' else m).copy()
    sub['bucket']=pd.cut(sub['conf'+r],[0,.5,.7,.9,.95,.99,.999,1.0001],right=False)
    g=sub.groupby('bucket',observed=True).agg(n=('w'+r,'size'),wrong=('w'+r,'sum')); g['acc%']=((1-g.wrong/g.n)*100).round(1)
    P(f'Run {r}'); T(g,True)
top=m[m.wB].sort_values('confB',ascending=False).head(30)[['Excel Row','pickB','confB','pickA','confA','fam','Query']]
P('### Top 30 highest-confidence wrong routes (Run B)'); T(top)
topA=m[m.wA].sort_values('confA',ascending=False).head(30)[['Excel Row','pickA','confA','pickB','fam','Query']]
P('### Top 30 highest-confidence wrong routes (Run A)'); T(topA)

# ---------- 5. cross-run
P('## 5. Cross-run')
cm=pd.crosstab(m.pickA,m.pickB,margins=True); P('### Confusion matrix: rows = Run A pick, cols = Run B pick'); T(cm,True)
def flow(src_col,src,dst_col):
    return m[m[src_col]==src][dst_col].value_counts()
for ag in ['IMS','RAN']:
    P(f'#### Where did Run-A {ag} misroutes go in Run B?'); T(flow('pickA',ag,'pickB').to_frame(),True)
    sub=m[m.pickA==ag]; P(f'by family:'); T(pd.crosstab(sub.fam,sub.pickB),True)
for ag in ['MCO','PLATFORM']:
    P(f'#### Where did Run-B {ag} misroutes come from in Run A?'); T(flow('pickB',ag,'pickA').to_frame(),True)
    sub=m[m.pickB==ag]; P('by family:'); T(pd.crosstab(sub.fam,sub.pickA),True)
# terms whose share going to agent X changed most A->B
def term_shift(ag, minsup=10):
    rows=[]
    cnt=collections.Counter(g for s in m.grams for g in s)
    for g,c in cnt.items():
        if c<minsup: continue
        mask=m.grams.map(lambda s: g in s)
        a=(m[mask].pickA==ag).sum(); b=(m[mask&valid].pickB==ag).sum()
        rows.append((g,c,a,b,b-a))
    t=pd.DataFrame(rows,columns=['term','n_queries','->%s in A'%ag,'->%s in B'%ag,'delta'])
    return t
for ag in ['IMS','RAN','MCO','PLATFORM']:
    t=term_shift(ag); asc= ag in ('IMS','RAN')
    t=t.sort_values('delta',ascending=asc)
    t=t[~t.term.str.startswith('ctr:')|True]
    P(f'#### Terms with the largest change in pull toward {ag} (A->B)'); T(t.head(15))
ex=m[(m.pickB.isin(['MCO','PLATFORM']))&(m.pickA!=m.pickB)].sort_values(['pickB','fam'])
ex20=pd.concat([ex[ex.pickB=='MCO'].groupby('fam').head(2).head(12), ex[ex.pickB=='PLATFORM'].groupby('fam').head(2).head(8)])
P('### 20 before/after examples now pulled to MCO / Platform'); T(ex20[['Excel Row','pickA','pickB','fam','Query']])
reg=m[m.segment=='regressed']
P(f'### Regressions (n={len(reg)})'); T(reg.pickB.value_counts().to_frame(),True); T(reg.fam.value_counts().to_frame(),True)
P('Regression rate by family = regressed / right-in-A'); 
rA=m[(~m.wA)&valid]; rr=rA.groupby('fam').agg(rightA=('segment','size'),regressed=('segment',lambda s:(s=='regressed').sum())); rr['reg%']=(rr.regressed/rr.rightA*100).round(1); T(rr.sort_values('regressed',ascending=False),True)
# regression n-grams vs persistently right (which features of the right-in-A set predict regression)
reg_ct=collections.Counter(g for s in reg.grams for g in s); pr=m[m.segment=='persistently right']; pr_ct=collections.Counter(g for s in pr.grams for g in s)
rows=[]
for g,c in reg_ct.items():
    if c<5: continue
    c0=pr_ct.get(g,0); a,b,cc,d=c+.5,len(reg)-c+.5,c0+.5,len(pr)-c0+.5
    lor=math.log(a/b)-math.log(cc/d); se=math.sqrt(1/a+1/b+1/cc+1/d)
    rows.append((g,c,c0,round(c/(c+c0)*100,1),round(lor/se,2)))
P('#### N-grams over-represented in regressions vs persistently-right (min support 5)')
T(pd.DataFrame(rows,columns=['term','n_regressed','n_persist_right','regress% given term','z']).sort_values('z',ascending=False).head(25))
P('#### Confidence of regressions in B'); T(reg.confB.describe().to_frame(),True)
reg[['Excel Row','pickA','confA','pickB','confB','fam','Query']].to_csv('regressions_107.csv',index=False)
m.to_pickle('m.pkl')
OUT.close()

```

### scripts/part2.py
```python
import re, math, collections, pandas as pd, numpy as np
pd.set_option('display.max_colwidth',150); pd.set_option('display.width',250)
m=pd.read_pickle('m.pkl'); N=len(m); valid=~m.errB
OUT=open('analysis_out2.md','w')
def P(*a):
    s=' '.join(str(x) for x in a); print(s); OUT.write(s+'\n')
def T(df,idx=False): P(df.to_markdown(index=idx)); P('')
q=m.Query
# ---------------- 7. root-cause categories (mutually exclusive, priority order)
OTHER_DOMAIN=r'\bSMS\b|SMSF|SMTP|\bMM4\b|\bMMS\b|\bCAP\b|\bMAP\b|\bINAP\b|\bTCAP\b|\bSCCP\b|\bM3UA\b|SIPRE|\bSIP\b|CSCF|SRVCC|IMS call|IMS HSS|IMS authentication|\bCDR\b|charging records|DIAMRE RO|\bNFV\b'
ANCHORED={'AUSF','AMF','MME','SMF/UPF/PDU session','NRF/NSSF/SCP/SEPP','MDPLB','CCLB','PCF/PCRF/policy','UDM/UDR/UDSF'}
UNCOVERED={'ePDG','SeGW','Media Engine','Provisioning Gateway','peer-VNF platform'}
SHARED_PROTO=r'(?i)ipsec|\bike|\besp\b|tunnel|nat44|nat64|\bgre\b|\btcp\b|\budp\b|icmp|\bbgp\b|\bbfd\b|\bvrf\b|http|\b[245]\d\d\b|[245]xx|kafka|diamre|diameter|sctp|snmp|gtp|alarm|disk|\bcpu\b|memory|configur|syslog|security|authenticat|bearer|session|packets?|drop|port|throughput|latency|overload|database'
m['other_domain_cue']=q.str.contains(OTHER_DOMAIN)
m['shared_proto']=q.str.contains(SHARED_PROTO)
def cat(r):
    if r.other_domain_cue or r.fam=='NFV platform (infra)': return 'C1 Ownership ambiguous / likely mislabeled'
    if r.fam in ANCHORED: return 'C2 Generic term overrides a named PACO NF'
    if r.fam in UNCOVERED and r.shared_proto: return 'C3 PACO product not recognised + shared protocol/infra vocabulary'
    if r.fam in UNCOVERED: return 'C4 PACO product not recognised (pure coverage gap)'
    return 'C5 Other (observability/LI/mesh/unidentified)'
m['category']=m.apply(cat,axis=1)
P('## 7. Root-cause categories (primary, mutually exclusive; rules in scripts/part2.py)')
rows=[]
for c in sorted(m.category.unique()):
    s=m[m.category==c]
    rows.append((c,len(s),int(s.wA.sum()),round(s.wA.sum()/m.wA.sum()*100,1),int(s.wB.sum()),round(s.wB.sum()/m.wB.sum()*100,1),round(s.wB.sum()/(s.wB.sum()+((s.vB=='right').sum()))*100,1)))
t=pd.DataFrame(rows,columns=['category','n queries','wrong A','share of A wrong %','wrong B','share of B wrong %','misroute% B'])
t.loc[len(t)]=['TOTAL',len(m),int(m.wA.sum()),100.0,int(m.wB.sum()),100.0,round(m.wB.sum()/valid.sum()*100,1)]
T(t)
# overlay: catch-all
MSG=r'(?i)\bsms|smtp|\bmm4|\bmms|messag'
INFRA=r'(?i)\bnfv|kafka|disk|\bcpu|memory|\bpod|database|couchbase|cassandra|alarm|ntp|vnf'
w=m[m.wB]
mco=w[w.pickB=='MCO']; plat=w[w.pickB=='PLATFORM']
P(f"Catch-all overlay (Run B): MCO misroutes with NO messaging cue = {(~mco.Query.str.contains(MSG)).sum()}/{len(mco)}; Platform misroutes with NO infra cue = {(~plat.Query.str.contains(INFRA)).sum()}/{len(plat)}")
P(f"Catch-all overlay (Run A): MCO no-cue = {(~m[m.pickA=='MCO'].Query.str.contains(MSG)).sum()}/{(m.pickA=='MCO').sum()}; Platform no-cue = {(~m[m.pickA=='PLATFORM'].Query.str.contains(INFRA)).sum()}/{(m.pickA=='PLATFORM').sum()}")
P('')
P('### Category x Run-B destination (wrong only)'); T(pd.crosstab(w.category,w.pickB,margins=True),True)
P('### Examples per category (Run B wrong, highest confidence first, diverse families)')
for c in sorted(m.category.unique()):
    s=w[w.category==c].sort_values('confB',ascending=False).groupby(['fam','pickB']).head(1).head(7)
    P('####',c); T(s[['Excel Row','fam','pickA','pickB','confB','Query']])

# ---------------- 6. mislabel candidates
P('## 6b. Rows that arguably carry a wrong / ambiguous expected label')
mis=m[(m.category.str.startswith('C1'))].copy()
def reason(qq,fam):
    rs=[]
    if re.search(r'\bSMS\b|SMSF|SMTP|\bMM4\b|\bMMS\b',qq): rs.append('messaging (SMS/SMTP/MMS) -> MCO?')
    if re.search(r'\bCAP\b|\bMAP\b|\bINAP\b|\bTCAP\b|\bSCCP\b|\bM3UA\b',qq): rs.append('SS7/IN signalling (CAP/MAP/INAP/TCAP/SCCP/M3UA) - not packet core')
    if re.search(r'SIPRE|\bSIP\b|CSCF|SRVCC|IMS call|IMS HSS|IMS authentication',qq): rs.append('IMS/SIP subject -> IMS?')
    if re.search(r'\bCDR\b|charging records|DIAMRE RO',qq): rs.append('offline/online charging records -> MDE?')
    if re.search(r'\bNFV\b',qq) or fam=='NFV platform (infra)': rs.append('NFV infrastructure alarm/resource -> PLATFORM?')
    return '; '.join(rs)
mis['reason']=[reason(a,b) for a,b in zip(mis.Query,mis.fam)]
mis['both_runs_agree_nonPACO']=(mis.pickA==mis.pickB)&(mis.pickA!='PACO')
P(f'C1 rows: {len(mis)}; wrong in A: {int(mis.wA.sum())}; wrong in B: {int(mis.wB.sum())}; both runs picked the same non-PACO agent: {int(mis.both_runs_agree_nonPACO.sum())}')
T(mis.groupby('reason').agg(n=('Query','size'),wrongB=('wB','sum'),same_nonPACO_both=('both_runs_agree_nonPACO','sum')).sort_values('n',ascending=False),True)
pv=m[(m.fam=='peer-VNF platform')]
P(f'Whole peer-VNF platform family: n={len(pv)}, wrong A={int(pv.wA.sum())}, wrong B={int(pv.wB.sum())}, right in BOTH runs={int(((pv.vA=="right")&(pv.vB=="right")).sum())}')
mis.sort_values('Excel Row')[['Excel Row','pickA','pickB','confB','reason','Query']].to_csv('mislabel_candidates.csv',index=False)
# also peer-VNF rows not in C1 (ownership question)
pv2=pv[~pv.index.isin(mis.index)]
pv2[['Excel Row','pickA','pickB','confB','Query']].to_csv('peer_vnf_ownership_review.csv',index=False)
P(f'peer-VNF rows not caught by C1 cues (exported for ownership review): {len(pv2)}')

# ---------------- 8. trap terms
P('## 8a. Top-30 trap terms (ranked by excess misroutes over baseline, both runs)')
FILLER=set('last past days readings measurements values recorded show pull get fetch retrieve please related data samples bring look using covering check like need review available timestamped concerning reported checking can you could i\'d i what how do does the of for in from'.split())
cnt=collections.Counter(g for s in m.grams for g in s)
baseA=m.wA.mean(); baseB=m.wB.sum()/valid.sum()
rows=[]
for g,c in cnt.items():
    if c<8 or g.startswith('ctr:') or g=='<COUNTER>': continue
    if all(t in FILLER for t in g.split()): continue
    mask=m.grams.map(lambda s:g in s)
    s=m[mask]; sv=s[~s.errB]
    wa=int(s.wA.sum()); wb=int(sv.wB.sum())
    excess=(wa-c*baseA)+(wb-len(sv)*baseB)
    dA=s[s.wA].pickA.value_counts(); dB=sv[sv.wB].pickB.value_counts()
    rows.append(dict(term=g,n=c,wrongA=wa,ratA=round(wa/c*100,1),wrongB=wb,ratB=round(wb/max(len(sv),1)*100,1),
        destA=(f'{dA.index[0]} ({dA.iloc[0]})' if len(dA) else '-'),destB=(f'{dB.index[0]} ({dB.iloc[0]})' if len(dB) else '-'),excess=round(excess,1)))
tt=pd.DataFrame(rows).sort_values('excess',ascending=False)
PRODUCT_GRAMS=r'peer-vnf|platform|media|engine|provisioning|gateway|segw|epdg|ausf|cclb|mdplb|\bme\b|northbound|southbound'
qsets={}
def qs(g):
    if g not in qsets: qsets[g]=set(m.index[m.grams.map(lambda s:g in s)])
    return qsets[g]
prod_rows=tt[tt.term.str.contains(PRODUCT_GRAMS)]
tt2=tt[~tt.term.str.contains(PRODUCT_GRAMS)]
keep=[]
for _,r in tt2.iterrows():
    a=qs(r.term)
    if any(len(a&qs(k['term']))/len(a|qs(k['term']))>0.7 for k in keep): continue
    keep.append(r)
    if len(keep)==30: break
P('### 8a-i. Unrecognised PACO product names (the biggest pull, listed separately)')
pk=[]
for _,r in prod_rows.iterrows():
    a=qs(r.term)
    if any(len(a&qs(k['term']))/len(a|qs(k['term']))>0.7 for k in pk): continue
    pk.append(r)
    if len(pk)==8: break
T(pd.DataFrame(pk))
P('### 8a-ii. Top-30 trap terms excluding product names (Jaccard-deduplicated)')
trap=pd.DataFrame(keep).reset_index(drop=True); trap.index+=1
T(trap,True)
trap.to_csv('trap_terms_top30.csv')
TRAPS=list(trap.term)
m['trap_terms']=m.grams.map(lambda s:'; '.join(t for t in TRAPS if t in s))

# ---------------- 8d. 100-query regression set
quota={'C2 Generic term overrides a named PACO NF':28,'C3 PACO product not recognised + shared protocol/infra vocabulary':34,
       'C4 PACO product not recognised (pure coverage gap)':16,'C1 Ownership ambiguous / likely mislabeled':14,'C5 Other (observability/LI/mesh/unidentified)':8}
pool=m[m.segment.isin(['regressed','persistently wrong'])].copy()
pool['prio']=np.where(pool.segment=='regressed',0,1)
sel=[]
for c,k in quota.items():
    s=pool[pool.category==c].sort_values(['prio','confB'],ascending=[True,False])
    groups=[g for _,g in s.groupby(['fam','pickB'])]
    groups.sort(key=lambda g:-len(g))
    picked=[]; i=0
    while len(picked)<k and any(len(g)>i for g in groups):
        for g in groups:
            if len(g)>i and len(picked)<k: picked.append(g.index[i])
        i+=1
    sel+=picked
rs=m.loc[sel]
short=100-len(rs)
if short>0:
    extra=pool[~pool.index.isin(rs.index)].sort_values(['prio','confB'],ascending=[True,False]).head(short); rs=pd.concat([rs,extra])
P('## 8d. 100-query regression set composition')
T(pd.crosstab(rs.category,rs.segment,margins=True),True)
T(rs.fam.value_counts().to_frame(),True)
rs.sort_values(['category','fam'])[['Excel Row','category','segment','fam','pickA','pickB','confB','trap_terms','Query']].to_csv('regression_test_set_100.csv',index=False)

# ---------------- CSV export
ex=m[['Excel Row','Query','fam','pickA','confA','vA','pickB','confB','vB','segment','category','trap_terms','other_domain_cue']].rename(columns={
 'fam':'product_family','pickA':'runA_pick','confA':'runA_conf','vA':'runA_verdict','pickB':'runB_pick','confB':'runB_conf','vB':'runB_verdict','other_domain_cue':'possible_mislabel_cue'})
ex.to_csv('per_query_analysis.csv',index=False)
P('exported rows:',len(ex))
m.to_pickle('m2.pkl'); OUT.close()

```

### scripts/regression_tags.py
```python
import re, pandas as pd
m=pd.read_pickle('m2.pkl'); reg=m[m.segment=='regressed']
def tag(q):   # first matching rule wins
    rules=[(r'INVALID_MSG_FORMAT|malformed|invalid','malformed/invalid-format wording -> MCO'),(r'(?i)kafka','Kafka -> PLATFORM'),
     (r'(?i)per pod|\bpod\b|kubernetes','pod/K8s wording -> PLATFORM'),(r'security-edge|SEPP','SEPP/security-edge-proxy -> MDE'),
     (r'(?i)subscriber|supi|context','subscriber/context wording -> MCO'),(r'(?i)http|\b4\d\d\b|5\d\d|liveness|overload|not.ready|REQ_','HTTP/request-handling wording'),
     (r'peer-VNF','peer-VNF platform'),(r'Media Engine','Media Engine'),(r'Provisioning Gateway','Provisioning Gateway'),(r'CCLB|MDPLB','CCLB/MDPLB counter in free-form ops phrasing')]
    for p,t in rules:
        if re.search(p,q, 0 if p.startswith('(?i)') else re.I if t.startswith('malformed') else 0): return t
    return 'other'
reg=reg.assign(cause=reg.Query.map(tag)); m.loc[reg.index,'reg_cause']=reg.cause; m.to_pickle('m2.pkl')
reg.sort_values(['cause','Excel Row'])[['Excel Row','fam','pickA','confA','pickB','confB','cause','Query']].to_csv('regressions_107.csv',index=False)
print(reg.cause.value_counts().to_dict())

```

### scripts/appendix.py
```python
import pandas as pd
pd.set_option('display.max_colwidth',400)
m=pd.read_pickle('m2.pkl')
out=open('appendix_generated.md','w')
W=lambda s: out.write(s+'\n')
W('## Appendix C — Root-cause category examples (6 per category, wrong in A or B, diverse families)')
for c in sorted(m.category.unique()):
    s=m[(m.wA|m.wB)&(m.category==c)].copy()
    s['conf']=s[['confA','confB']].max(axis=1)
    s=s.sort_values('conf',ascending=False).groupby('fam').head(2).head(6)
    W(f'### {c}'); W(s[['Excel Row','fam','pickA','pickB','Query']].to_markdown(index=False)); W('')
W('## Appendix D — All 107 regressions (right in A, wrong in B), with tagged cause')
r=pd.read_csv('regressions_107.csv'); W(r.to_markdown(index=False)); W('')
W('## Appendix E — Arguably mislabeled / ownership-ambiguous rows (C1, n=100)')
mc=pd.read_csv('mislabel_candidates.csv'); W(mc.to_markdown(index=False)); W('')
W('## Appendix F — Proposed 100-query regression test set')
t=pd.read_csv('regression_test_set_100.csv'); W(t.drop(columns=['trap_terms']).to_markdown(index=False)); W('')
out.close()
ex=m[['Excel Row','Query','fam','pickA','confA','vA','pickB','confB','vB','segment','category','reg_cause','trap_terms','other_domain_cue']].rename(columns={
 'fam':'product_family','pickA':'runA_pick','confA':'runA_conf','vA':'runA_verdict','pickB':'runB_pick','confB':'runB_conf','vB':'runB_verdict',
 'reg_cause':'regression_cause','other_domain_cue':'possible_mislabel_cue'})
ex['in_regression_test_set']=ex['Excel Row'].isin(t['Excel Row'])
ex.to_csv('per_query_analysis.csv',index=False)
# reconciliation assertions
assert len(ex)==1999
for r_ in 'AB':
    v=ex[f'run{r_}_verdict'].value_counts(); assert v.sum()==1999, v
assert (ex.runA_verdict=='right').sum()==1072 and (ex.runA_verdict=='wrong').sum()==927
assert (ex.runB_verdict=='right').sum()==1350 and (ex.runB_verdict=='wrong').sum()==640 and (ex.runB_verdict=='error').sum()==9
assert ex.segment.value_counts().sum()==1999 and ex.in_regression_test_set.sum()==100
print('reconciliation OK', ex.segment.value_counts().to_dict())

```

Run order: `python3 -I scripts/analysis.py && python3 -I scripts/part2.py && python3 -I scripts/regression_tags.py && python3 -I scripts/appendix.py`
