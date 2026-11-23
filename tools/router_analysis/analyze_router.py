#!/usr/bin/env python3
"""PACO router mis-routing analysis (steps 0-7).

Usage:
  python analyze_router.py RESULTS.xlsx [--sheet Results]
        [--ims IMS_results.xlsx] [--mco MCO_Unique_Queries.xlsx] [--mde mde_out.xlsx]
        [--eid EID_IMS_vs_PACO.csv] [--kpi PACO_All_KPI_Alarm_Names_Only.csv]
        [--prev OLDER_RESULTS.xlsx]

Writes everything into <input_dir>/<input_stem>_analysis/ :
  report.md, step*.csv, wrong_by_group.csv, keyword_wrong_right_table.csv, run_info.json
Every number in report.md is measured from the files (FACT). Text marked INFERRED is interpretation.
"""
import argparse, json, math, re, sys
from collections import Counter
from pathlib import Path

import pandas as pd

EXPECTED = "paco"

# ---------------------------------------------------------------- helpers
def W(p):
    """Word-bounded regex where '_' and '-' count as separators (AUSF_X matches AUSF)."""
    return rf"(?<![A-Za-z0-9])(?:{p})(?![A-Za-z0-9])"

def norm_worker(x):
    if x is None or (isinstance(x, float) and math.isnan(x)):
        return None
    s = str(x).strip().lower().replace("_", "-")
    if not s or s == "nan":
        return None
    return re.sub(r"-?worker$", "", s).strip("-")

def md(df, maxrows=60, floatfmt="{:.1f}"):
    if df is None or len(df) == 0:
        return "_(no rows)_\n"
    df = df.head(maxrows).astype(object)
    cols = [str(c) for c in df.columns]
    out = ["| " + " | ".join(cols) + " |", "|" + "---|" * len(cols)]
    for _, r in df.iterrows():
        cells = []
        for v in r.values:
            if isinstance(v, float) and float(v).is_integer():
                cells.append(str(int(v)))
            elif isinstance(v, float):
                cells.append(floatfmt.format(v) if not math.isnan(v) else "")
            else:
                cells.append(str(v).replace("|", "/").replace("\n", " "))
        out.append("| " + " | ".join(cells) + " |")
    return "\n".join(out) + "\n"

def pct(a, b):
    return round(100.0 * a / b, 1) if b else float("nan")

# ---------------------------------------------------------------- vocab
PRODUCTS = {  # order matters only for display
    "peer-VNF": r"peer-?VNF",
    "Media Engine": r"Media\s+Engine",
    "ProvGW": r"Provisioning\s+Gateway|ProvGW|PROVGW",
    "SeGW": r"SeGW",
    "ePDG": r"ePDG",
    "AUSF": r"AUSF", "AMF": r"AMF", "MME": r"MME", "SMF": r"SMF", "PCF": r"PCF",
    "UDM": r"UDM", "UDR": r"UDR", "NRF": r"NRF", "NSSF": r"NSSF", "SEPP": r"SEPP",
    "AAA": r"AAA", "DRA": r"DRA", "DNS": r"DNS", "MDPLB": r"MDPLB", "CCLB": r"CCLB",
    "N3IWF": r"N3IWF", "CCS": r"CCS", "PGW": r"PGW", "SGW": r"SGW",
}
PROD_RE = {k: re.compile(W(v), re.I) for k, v in PRODUCTS.items()}
G7_NF = ["AMF", "MME", "SMF", "PCF", "UDM", "UDR", "NRF", "NSSF", "SEPP", "AAA", "DRA",
         "DNS", "MDPLB", "PGW", "SGW", "CCLB", "N3IWF", "CCS"]
GROUP_ORDER = [("G1 peer-VNF platform", ["peer-VNF"]), ("G2 Media Engine", ["Media Engine"]),
               ("G3 Provisioning Gateway", ["ProvGW"]), ("G4 SeGW", ["SeGW"]),
               ("G5 ePDG", ["ePDG"]), ("G6 AUSF", ["AUSF"]), ("G7 other core NF", G7_NF)]
SUBDOMAIN_ANCHOR = {"G1 peer-VNF platform": r"peer-?VNF\s+platform", "G2 Media Engine": r"Media\s+Engine",
                    "G3 Provisioning Gateway": r"Provisioning\s+Gateway", "G4 SeGW": r"SeGW",
                    "G5 ePDG": r"ePDG"}

# counter tokens: anything with '_' joining alnum parts, except 3GPP service names (Nudm_, Npcf_ ...)
CTR_RE = re.compile(r"(?<![A-Za-z0-9])[A-Za-z][A-Za-z0-9]*(?:_+[A-Za-z0-9]+)+(?![A-Za-z0-9])")
SVC_RE = re.compile(r"^N[a-z]+_")
UPPER_CTR_RE = re.compile(r"(?<![A-Za-z0-9])[A-Z][A-Z0-9]*(?:_+[A-Z0-9]+)+(?![A-Za-z0-9])")

METRIC_RE = re.compile(
    r"\b(last|past)\s+(\d+|seven|two)\s+(days?|hours?|minutes?)\b|\breadings?\b|\bsamples?\b|"
    r"\bmeasurements?\b|\brecorded\b|\bminute series\b|\btrend\b|\bplot\b|\boverlay\b|"
    r"\bbreak down\b|\bexport\b|\bspiked\b|\bflat at zero\b|\bpeak of\b|\bthreshold alert\b|"
    r"\bdrop(?:ped)? (?:to zero|below)\b|\bbreach\b|\bflat, growing\b|\bper pod\b|\bper amf pod\b|\bthis week against\b|\btoday against yesterday\b", re.I)

GENERIC = set("""a an the of for in on to from and or with by at as is are was were be been do does did
can could would should will what which how why when where who this that these those it its into over
last past days day 2 two show bring up pull get fetch retrieve look check need like i i'd we our you
please data readings reading samples sample measurements measurement values value recorded related
alarm alarms subscriber subscribers request requests response responses error errors total number count
counter received sent failed failure failures successfully success hours hour week today yesterday
keeping timestamps timestamped available covering period interval during review existing evidence
inspect compare about any after before between not no only than then there their them they also
via per using use used against same time n ctr""".split())

# step-4 keyword list: name -> regex (case-insensitive, '_' treated as separator)
KEYWORDS = {
    "kafka": r"kafka", "databus": r"databus", "northbound": r"northbound|PROVGW_NB\w*|NB (?:interface|webhook)", "southbound": r"southbound|PROVGW_SB\w*|SB interface",
    "notification": r"notifications?|notify", "webhook": r"webhook", "http": r"http2?|HTTP/2",
    "rest/soap": r"rest|soap", "workflow": r"workflow|grules?", "rollback": r"rollback",
    "tenant/BU": r"business[- ]unit|tenant|BU", "smtp": r"smtp", "mm4": r"mm4",
    "diameter": r"diameter|diam", "diamre": r"diamre", "ecr/eca": r"ecr|eca", "eir": r"eir|equipment-identity",
    "rx/ro/cx/rf/swm/s13": r"rx|ro|cx|rf|swm|s13", "charging/cdr": r"charging|cdr|ccr|cca|chf",
    "ike/ikev2": r"ike|ikev2", "ipsec/esp": r"ipsec|esp", "eap": r"eap|eap-aka|eap-tls",
    "certificate/crl/ocsp": r"certificates?|crl|ocsp|cmpv2", "tls": r"tls|mtls",
    "nat44/nat64": r"nat44|nat64|cgnat|nat", "icmp": r"icmp", "gre": r"gre", "tcp": r"tcp",
    "udp": r"udp", "bgp": r"bgp", "bfd": r"bfd", "acl": r"acl", "syslog": r"syslog",
    "ftp/tftp/rtsp/pptp": r"ftp|tftp|rtsp|pptp", "fragment": r"fragments?|fragmentation",
    "vrf": r"vrf", "mempool/memory": r"mempool|memory", "sctp": r"sctp|lksctp|lsksctp",
    "ss7 (m3ua/sccp/tcap/map/cap/inap/mtp3)": r"m3ua|sccp|tcap|map|cap|inap|mtp3",
    "li/x2/x3": r"li|lawful|x2|x3|lipf|admf", "sip/cscf/ims": r"sip|cscf|p-cscf|ims|pcscf|sipre",
    "udsf": r"udsf", "couchbase/db": r"couchbase|scylla|cassandra|database|dbgw|crdl",
    "kubernetes/pod": r"kubernetes|k8s|pod|pods", "cpu/disk": r"cpu|disk|inode",
    "overload": r"overload|congestion|self-?protection", "qos/dscp": r"qos|dscp",
    "vlb/load-balancer": r"vlb|vlb-fe|load[- ]balanc\w*", "dpdk/fast-path": r"dpdk|fast-?path|fpath",
    "mtcil/mcms": r"mtcil|mcms", "rca/investigate": r"rca|investigate|root cause",
    "configure/restart": r"configure|parameters|restart|rollout|mcms or cli",
    "snmp": r"snmp", "uag": r"uag|uagu", "prometheus/grafana": r"prometheus|grafana",
    # safe contrast anchors
    "AUSF_ prefix": r"AUSF_\w+", "EPDG_ prefix": r"EPDG_\w+", "PROVGW_ prefix": r"PROVGW_\w+",
    "MDPLB_ prefix": r"MDPLB_\w+", "CCLB_ prefix": r"CCLB_\w+",
    "amf": r"amf", "mme": r"mme", "nrf": r"nrf", "ausf": r"ausf", "mdplb": r"mdplb",
}
KW_RE = {k: re.compile(W(v), re.I) for k, v in KEYWORDS.items()}
WHY = {  # INFERRED explanations, edit freely
    "kafka": "Kafka/databus reads as messaging-platform infra -> platform-worker",
    "databus": "Kafka/databus reads as messaging-platform infra -> platform-worker",
    "northbound": "northbound/southbound + HTTP status codes resemble MDE/orchestration APIs",
    "southbound": "northbound/southbound + HTTP status codes resemble MDE/orchestration APIs",
    "diamre": "Diameter routing engine + Cx/Rx/Ro/SWm codes are IMS signalling vocabulary -> ims-worker",
    "diameter": "Diameter vocabulary shared with IMS core",
    "ecr/eca": "S13 ECR/ECA (EIR) reads as Diameter/IMS",
    "ike/ikev2": "IKE/IPsec words without ePDG/SeGW prefix look like generic security/messaging",
    "ipsec/esp": "IKE/IPsec words without ePDG/SeGW prefix look like generic security/messaging",
    "smtp": "SMTP/MM4 is messaging (MMS) vocabulary -> mco-worker",
    "mm4": "SMTP/MM4 is messaging (MMS) vocabulary -> mco-worker",
    "ss7 (m3ua/sccp/tcap/map/cap/inap/mtp3)": "SS7 stack words read as platform/IMS signalling",
    "kubernetes/pod": "pod/Kubernetes reads as platform infra -> platform-worker",
    "couchbase/db": "database words read as platform infra",
    "cpu/disk": "CPU/disk utilisation reads as platform infra",
    "nat44/nat64": "NAT/ACL/ICMP/security drop counters read as messaging/edge gateway -> mco-worker",
    "icmp": "NAT/ACL/ICMP/security drop counters read as messaging/edge gateway -> mco-worker",
    "sip/cscf/ims": "explicit IMS/SIP vocabulary",
    "charging/cdr": "charging/CDR vocabulary shared with MDE/charging domains",
}

def find_counters(q):
    return [t for t in CTR_RE.findall(q) if not SVC_RE.match(t)]

def template(q):
    t = q
    for c in sorted(set(find_counters(q)), key=len, reverse=True):
        t = re.sub(W(re.escape(c)), "CTR", t)
    t = re.sub(r"\d+", "N", t)
    return re.sub(r"\s+", " ", t).strip().lower()

def tokens(q):
    s = q.lower().replace("_", " ")
    return [w for w in re.findall(r"[a-z0-9]+(?:-[a-z0-9]+)*", s) if w not in GENERIC and not w.isdigit()]

def subdomain(q, gname):
    a = SUBDOMAIN_ANCHOR.get(gname)
    if not a:
        return None
    m = re.search(rf"({a})\s+(.+?)(?=\s+(?:measurements|readings|data\b|for the (?:last|past)|over the|"
                  rf"covering|keeping|show|what|retrieve|bring|is\b|look)|[,.;?]|$)", q, re.I)
    if not m:
        return None
    rest = " ".join(m.group(2).split()[:6]).lower()
    prod = re.sub(r"\s+", " ", m.group(1)).replace("peer-vnf", "peer-VNF")
    return f"{prod} | {rest}"

def load_results(path, sheet):
    xl = pd.ExcelFile(path)
    sh = sheet if sheet in xl.sheet_names else xl.sheet_names[0]
    df = pd.read_excel(path, sheet_name=sh)
    df.columns = [str(c).strip() for c in df.columns]
    return df, sh

def text_blob_rows(path):
    """All rows of every sheet (xlsx) or the csv, joined to one string per row."""
    p = Path(path)
    frames = []
    if p.suffix.lower() in (".xlsx", ".xls"):
        for _, d in pd.read_excel(p, sheet_name=None, dtype=str).items():
            frames.append(d)
    else:
        frames.append(pd.read_csv(p, dtype=str, encoding_errors="replace", on_bad_lines="skip"))
    rows = []
    for d in frames:
        rows += d.fillna("").astype(str).agg(" ".join, axis=1).tolist()
    return rows, frames

# ---------------------------------------------------------------- main
def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("results")
    ap.add_argument("--sheet", default="Results")
    for k in ("ims", "mco", "mde", "eid", "kpi", "prev"):
        ap.add_argument(f"--{k}")
    a = ap.parse_args()

    inp = Path(a.results).resolve()
    out = inp.parent / f"{inp.stem}_analysis"
    out.mkdir(exist_ok=True)
    R = []  # report lines
    def h(t): R.append(f"\n## {t}\n")
    def p(t=""): R.append(t)

    df, sheet = load_results(inp, a.sheet)
    need = ["Excel Row", "Query", "Expected Agent", "Picked Agent", "Confidence", "Verdict"]
    miss = [c for c in need if c not in df.columns]
    if miss:
        sys.exit(f"missing columns {miss}; found {list(df.columns)}")
    df["Query"] = df["Query"].astype(str)
    df["picked"] = df["Picked Agent"].map(norm_worker)
    df["expected"] = df["Expected Agent"].map(norm_worker)
    df["Confidence"] = pd.to_numeric(df["Confidence"], errors="coerce")

    # ---------------- STEP 0
    total = len(df)
    err = df[df["picked"].isna()]
    ok = df[df["picked"].notna()].copy()
    ok["wrong"] = ok["picked"] != EXPECTED
    n_wrong, n_right, n_err = int(ok["wrong"].sum()), int((~ok["wrong"]).sum()), len(err)
    verdict_mismatch = int(((ok["Verdict"].astype(str).str.lower() == "wrong") != ok["wrong"]).sum())
    h("STEP 0 - Totals (FACT)")
    p(f"Input: `{inp}` sheet `{sheet}`\n")
    s0 = pd.DataFrame([{"total": total, "right": n_right, "wrong": n_wrong, "error (no Picked Agent)": n_err,
                        "right+wrong+error": n_right + n_wrong + n_err,
                        "accuracy excl. errors %": pct(n_right, n_right + n_wrong),
                        "accuracy incl. errors %": pct(n_right, total),
                        "Verdict column disagrees with recomputed": verdict_mismatch}])
    p(md(s0))
    assert n_right + n_wrong + n_err == total
    byw = ok[ok["wrong"]].groupby("picked").size().rename("wrong rows").reset_index().sort_values("wrong rows", ascending=False)
    byw["% of wrong"] = byw["wrong rows"].map(lambda x: pct(x, n_wrong))
    p("Wrong rows by picked worker:\n"); p(md(byw))
    p("Error rows:\n"); p(md(err[["Excel Row", "Error"] if "Error" in err.columns else ["Excel Row"]]))
    byw.to_csv(out / "step0_wrong_by_worker.csv", index=False)

    # ---------------- features
    for k, rx in PROD_RE.items():
        ok[f"p_{k}"] = ok["Query"].map(lambda q, rx=rx: bool(rx.search(q)))
    pcols = [f"p_{k}" for k in PRODUCTS]
    ok["any_product"] = ok[pcols].any(axis=1)
    ok["counters"] = ok["Query"].map(find_counters)
    ok["has_counter"] = ok["counters"].map(bool)
    def _prefix(q):
        m = [t for t in find_counters(q) if t[0].isupper()]
        return m[0].split("_")[0].upper() + "_" if m else None
    ok["prefix"] = ok["Query"].map(_prefix)
    ok["shape"] = ok["Query"].map(lambda q: "metric lookup" if METRIC_RE.search(q) else "diagnostic question")
    ok["template"] = ok["Query"].map(template)

    def grp(r):
        for g, prods in GROUP_ORDER:
            if any(r[f"p_{x}"] for x in prods):
                return g
        return "G8a counter, no product" if r["has_counter"] else "G8b plain question, no product"
    ok["group"] = ok.apply(grp, axis=1)
    ok["subdomain"] = [subdomain(q, g) if s == "metric lookup" else None
                       for q, g, s in zip(ok["Query"], ok["group"], ok["shape"])]

    def rate_table(mask_series_dict, label):
        rows = []
        for name, m in mask_series_dict.items():
            sub = ok[m]
            rows.append({label: name, "rows": len(sub), "wrong": int(sub["wrong"].sum()),
                         "wrong %": pct(sub["wrong"].sum(), len(sub))})
        return pd.DataFrame(rows)

    # ---------------- STEP 1
    h("STEP 1 - PACO anchor check (FACT)")
    t1 = rate_table({k: ok[f"p_{k}"] for k in PRODUCTS}, "product word")
    t1 = t1[t1["rows"] > 0].sort_values("wrong %", ascending=False)
    p(md(t1, 40)); t1.to_csv(out / "step1_product_words.csv", index=False)
    t1b = rate_table({"with any product word": ok["any_product"], "without any product word": ~ok["any_product"]}, "anchor")
    p(md(t1b))
    pre = ok[ok["prefix"].notna()].groupby("prefix").agg(rows=("wrong", "size"), wrong=("wrong", "sum")).reset_index()
    pre = pre[pre["rows"] >= 6]
    pre["wrong %"] = [pct(w, r) for w, r in zip(pre["wrong"], pre["rows"])]
    p("Counter-name prefix (first UPPER_SNAKE token), n>=6:\n"); p(md(pre.sort_values("wrong %", ascending=False), 60))
    pre.to_csv(out / "step1_counter_prefix.csv", index=False)
    t1c = rate_table({s: ok["shape"] == s for s in ["metric lookup", "diagnostic question"]}, "query shape")
    p("Query shape:\n"); p(md(t1c))

    # ---------------- STEP 2
    h("STEP 2 - Mutually exclusive groups (FACT)")
    gl = []
    for g in [x for x, _ in GROUP_ORDER] + ["G8a counter, no product", "G8b plain question, no product"]:
        sub = ok[ok["group"] == g]; wr = sub[sub["wrong"]]
        gl.append({"group": g, "rows": len(sub), "wrong": len(wr), "right": len(sub) - len(wr),
                   "wrong % of group": pct(len(wr), len(sub)), "% of all wrong": pct(len(wr), n_wrong),
                   "distinct wrong templates": wr["template"].nunique(),
                   "avg conf (wrong)": round(wr["Confidence"].mean(), 3) if len(wr) else float("nan"),
                   "picked split": ", ".join(f"{k}:{v}" for k, v in wr["picked"].value_counts().items())})
    g2 = pd.DataFrame(gl)
    assert g2["wrong"].sum() == n_wrong, "groups do not sum to wrong total"
    p(md(g2, floatfmt="{:.3g}")); p(f"\nCheck: groups sum to {g2['wrong'].sum()} = wrong total {n_wrong}.\n")
    g2.to_csv(out / "step2_groups.csv", index=False)

    sd = ok[ok["subdomain"].notna()].groupby(["group", "subdomain"]).agg(
        rows=("wrong", "size"), wrong=("wrong", "sum"),
        picked_when_wrong=("picked", lambda s: ", ".join(f"{k}:{v}" for k, v in
                           s[ok.loc[s.index, "wrong"]].value_counts().items()))).reset_index()
    sd = sd[sd["rows"] >= 5]
    sd["wrong %"] = [pct(w, r) for w, r in zip(sd["wrong"], sd["rows"])]
    sd = sd.sort_values(["group", "wrong %"], ascending=[True, False])
    p("Metric-lookup subdomains for G1-G5 (n>=5):\n"); p(md(sd, 200))
    sd.to_csv(out / "step2_subdomains.csv", index=False)

    # ---------------- STEP 3
    h("STEP 3 - Deep dive per group (FACT tables; read samples to write INFERRED notes)")
    allw, allr = ok[ok["wrong"]], ok[~ok["wrong"]]
    for g in g2["group"]:
        sub = ok[ok["group"] == g]
        if sub["wrong"].sum() == 0:
            continue
        p(f"\n### {g}\n")
        tm = sub.groupby("template").agg(rows=("wrong", "size"), wrong=("wrong", "sum")).reset_index()
        tm["status"] = tm.apply(lambda r: "100% wrong" if r.wrong == r.rows else ("mixed" if r.wrong else "100% right"), axis=1)
        p("Template status (rows): " + ", ".join(f"{k}={v}" for k, v in tm.groupby("status")["rows"].sum().items()) + "\n")
        p("Top wrong templates:\n")
        p(md(tm[tm.wrong > 0].sort_values("wrong", ascending=False)[["template", "rows", "wrong", "status"]], 12))
        # enrichment
        Wn, Rn = int(sub["wrong"].sum()), int((~sub["wrong"]).sum())
        cw, cr = Counter(), Counter()
        for q, w in zip(sub["Query"], sub["wrong"]):
            (cw if w else cr).update(set(tokens(q)))
        en = []
        for t, nw in cw.items():
            if nw < 6:
                continue
            nr = cr.get(t, 0)
            lo = math.log((nw + .5) / (Wn - nw + .5)) - math.log((nr + .5) / (Rn - nr + .5))
            en.append({"token": t, "n_wrong": nw, "n_right": nr, "wrong % with token": pct(nw, nw + nr), "log-odds": round(lo, 2)})
        en = pd.DataFrame(en)
        if len(en):
            p("Tokens most enriched in wrong vs right (n_wrong>=6):\n")
            p(md(en.sort_values("log-odds", ascending=False), 15, "{:.2f}"))
        p("Sample wrong rows:\n")
        p(md(sub[sub["wrong"]][["Excel Row", "picked", "Confidence", "Query"]].head(8), floatfmt="{:.3f}"))
        p("Sample right rows:\n")
        p(md(sub[~sub["wrong"]][["Excel Row", "Confidence", "Query"]].head(5), floatfmt="{:.3f}"))

    # ---------------- STEP 4
    h("STEP 4 - Cross-domain keyword table (FACT counts; Why = INFERRED)")
    refs = {}
    for k in ("ims", "mco", "mde"):
        f = getattr(a, k)
        if f and Path(f).exists():
            refs[k] = text_blob_rows(f)[0]
    kt = []
    for k, rx in KW_RE.items():
        m = ok["Query"].map(lambda q, rx=rx: bool(rx.search(q)))
        sub = ok[m]
        if len(sub) == 0:
            continue
        nw = int(sub["wrong"].sum())
        ctrl_w = ctrl_n = 0
        for g in sub["group"].unique():
            c = ok[(ok["group"] == g) & ~m]
            ctrl_w += int(c["wrong"].sum()); ctrl_n += len(c)
        row = {"keyword": k, "rows": len(sub), "right": len(sub) - nw, "wrong": nw, "wrong %": pct(nw, len(sub)),
               "% of all wrong": pct(nw, n_wrong), "control wrong % (same groups, w/o kw)": pct(ctrl_w, ctrl_n),
               "goes to": ", ".join(f"{a_}:{b_}" for a_, b_ in sub[sub["wrong"]]["picked"].value_counts().head(3).items()),
               "with product word wrong %": pct(sub[sub["any_product"]]["wrong"].sum(), sub["any_product"].sum()),
               "without product word wrong %": pct(sub[~sub["any_product"]]["wrong"].sum(), (~sub["any_product"]).sum())}
        for rk, rows in refs.items():
            row[f"rows in {rk.upper()} file"] = sum(1 for t in rows if rx.search(t))
        row["why (INFERRED)"] = WHY.get(k, "")
        kt.append(row)
    kt = pd.DataFrame(kt).sort_values("wrong", ascending=False)
    kt.to_csv(out / "keyword_wrong_right_table.csv", index=False)
    p(md(kt, 80))
    if refs:
        ov = kt[[c for c in kt.columns if c.startswith("rows in")]].gt(0).any(axis=1)
        p("\nKeywords that also occur in another domain's file (possible ownership overlap): "
          + ", ".join(kt[ov & (kt["wrong"] > 0)]["keyword"]) + "\n")
    else:
        p("\n_No IMS/MCO/MDE reference files given, ownership columns skipped._\n")
    # counter-name ownership
    if a.kpi or a.eid:
        kpi_names = set()
        if a.kpi and Path(a.kpi).exists():
            _, fr = text_blob_rows(a.kpi)
            for d in fr:
                for c in d.columns:
                    kpi_names |= set(d[c].dropna().astype(str).str.strip().str.upper())
        eid_frames = text_blob_rows(a.eid)[1] if a.eid and Path(a.eid).exists() else []
        crow = []
        for c in sorted({c for cs in allw["counters"] for c in cs}):
            r = {"counter": c, "wrong rows": int(allw["counters"].map(lambda cs: c in cs).sum()),
                 "in PACO KPI/alarm list": c.upper() in kpi_names}
            hits = []
            for d in eid_frames:
                for col in d.columns:
                    if d[col].astype(str).str.upper().str.strip().eq(c.upper()).any():
                        hits.append(col)
            r["EID_IMS_vs_PACO columns containing it"] = ";".join(hits)
            crow.append(r)
        ct = pd.DataFrame(crow)
        ct.to_csv(out / "step4_counter_ownership.csv", index=False)
        p("Counter-name ownership for counters in wrong rows (full list in step4_counter_ownership.csv):\n")
        p(md(ct.sort_values("wrong rows", ascending=False), 40))

    # ---------------- STEP 5
    h("STEP 5 - Confidence (FACT)")
    wc = allw["Confidence"]
    p(md(pd.DataFrame([{"wrong rows": len(wc), "conf >= 0.95": int((wc >= .95).sum()), "conf >= 0.99": int((wc >= .99).sum()),
                        "conf < 0.65 (fallback-recoverable)": int((wc < .65).sum()),
                        "mean conf right": round(allr["Confidence"].mean(), 3), "mean conf wrong": round(wc.mean(), 3)}]),
       floatfmt="{:.3f}"))
    cw5 = ok.groupby(["picked", "wrong"])["Confidence"].agg(["size", "mean"]).reset_index()
    cw5["wrong"] = cw5["wrong"].map({True: "wrong", False: "right"})
    p(md(cw5, floatfmt="{:.3f}"))
    th = pd.DataFrame([{"threshold": t, "wrong rows below": int((wc < t).sum()), "right rows below": int((allr["Confidence"] < t).sum())}
                       for t in (0.5, 0.65, 0.8, 0.9, 0.95)])
    p("Fallback threshold trade-off (rows that a 'send to PACO/clarify below t' rule would touch):\n"); p(md(th, floatfmt="{:.2f}"))

    # ---------------- STEP 6
    h("STEP 6 - Candidate fixes ranked by wrong rows covered (FACT counts = upper bound if rule overrides)")
    fx = []
    for k in PRODUCTS:
        n = int((allw[f"p_{k}"]).sum())
        if n:
            fx.append({"fix": f"anchor rule: '{k}' in query -> paco", "wrong rows covered": n})
    for pfx, n in allw["prefix"].value_counts().items():
        fx.append({"fix": f"counter prefix {pfx} -> paco", "wrong rows covered": int(n)})
    for g in g2["group"]:
        tm = ok[ok["group"] == g].groupby("template")["wrong"].agg(["size", "sum"])
        n = int(tm[tm["sum"] == tm["size"]]["sum"].sum())
        if n:
            fx.append({"fix": f"template rules for 100%-wrong templates in {g}", "wrong rows covered": n})
    nprod = int((~allw["any_product"] & allw["prefix"].isna()).sum())
    fx.append({"fix": "wrong rows with NO product word and NO counter prefix (need training data / ownership decision)",
               "wrong rows covered": nprod})
    fx = pd.DataFrame(fx).sort_values("wrong rows covered", ascending=False)
    fx["% of all wrong"] = fx["wrong rows covered"].map(lambda x: pct(x, n_wrong))
    p(md(fx, 50)); fx.to_csv(out / "step6_fixes.csv", index=False)
    p("Note: rows overlap across fixes (a row with ePDG and EPDG_ is counted in both).\n")

    # ---------------- STEP 7
    if a.prev and Path(a.prev).exists():
        h("STEP 7 - Compare with previous run (FACT)")
        old, _ = load_results(Path(a.prev), a.sheet)
        old["picked_old"] = old["Picked Agent"].map(norm_worker)
        m = ok.merge(old[["Query", "picked_old"]].drop_duplicates("Query"), on="Query", how="left")
        m = m[m["picked_old"].notna()]
        m["old_wrong"] = m["picked_old"] != EXPECTED
        m["change"] = m.apply(lambda r: "right->wrong" if r.wrong and not r.old_wrong else
                              ("wrong->right" if r.old_wrong and not r.wrong else
                               ("still wrong" if r.wrong else "still right")), axis=1)
        p(f"Matched {len(m)} queries.\n")
        p(md(pd.crosstab(m["group"], m["change"]).reset_index()))
        m[m["change"].isin(["right->wrong", "wrong->right"])][["Excel Row", "group", "change", "picked_old", "picked", "Query"]] \
            .to_csv(out / "step7_changes.csv", index=False)

    # ---------------- exports
    allw[["Excel Row", "group", "picked", "Confidence", "Query"]].rename(columns={"picked": "picked worker",
         "Confidence": "confidence", "Query": "query"}).to_csv(out / "wrong_by_group.csv", index=False)
    ok.drop(columns=pcols).to_csv(out / "all_rows_features.csv", index=False)
    (out / "report.md").write_text("# PACO router mis-routing analysis\n" + "\n".join(R))
    json.dump({"input": str(inp), "sheet": sheet, "total": total, "right": n_right, "wrong": n_wrong, "error": n_err,
               "refs": {k: getattr(a, k) for k in ("ims", "mco", "mde", "eid", "kpi", "prev")}},
              open(out / "run_info.json", "w"), indent=2)
    print(f"OK total={total} right={n_right} wrong={n_wrong} error={n_err} -> {out}")

if __name__ == "__main__":
    main()
