from __future__ import annotations

from .extractor import ExtractionResult

_VALID_DIRECTIONS = {"income", "expense"}

# Canonical entity slug → list of issuer name substrings (lowercase) to match against.
# Order matters within each group — more specific patterns first.
# Sources: HKMA licensed banks list, IA authorized insurers, SFC register, MPFA trustees.
_ENTITY_ALIASES: dict[str, list[str]] = {

    # ── HK BANKS (full licensed + virtual) ────────────────────────────────────
    "hsbc":                 ["hongkong and shanghai banking", "hsbc"],
    "hang_seng":            ["hang seng bank"],
    "bochk":                ["bank of china (hong kong)", "bank of china hong kong", "bochk"],
    "standard_chartered":   ["standard chartered"],
    "bea":                  ["bank of east asia", "東亞銀行"],
    "dbs_hk":               ["dbs bank (hong kong)", "dbs bank hong kong", "dbs hk"],
    "citic_bank_intl":      ["china citic bank international", "citic bank international", "citic bank"],
    "cmb_wing_lung":        ["cmb wing lung", "wing lung bank"],
    "ocbc_hk":              ["ocbc bank (hong kong)", "ocbc hong kong", "ocbc"],
    "icbc_asia":            ["industrial and commercial bank of china (asia)", "icbc (asia)", "icbc asia"],
    "ccb_asia":             ["china construction bank (asia)", "ccb (asia)", "ccb asia"],
    "bocom_hk":             ["bank of communications (hong kong)", "bank of communications hong kong"],
    "nanyang":              ["nanyang commercial bank", "nanyang commercial"],
    "dah_sing":             ["dah sing bank"],
    "chong_hing":           ["chong hing bank"],
    "fubon_hk":             ["fubon bank (hong kong)", "fubon bank hong kong", "fubon bank"],
    "public_bank_hk":       ["public bank (hong kong)", "public bank hong kong"],
    "shanghai_commercial":  ["shanghai commercial bank"],
    "chiyu":                ["chiyu banking"],
    "citibank_hk":          ["citibank (hong kong)", "citibank hong kong", "citibank"],
    "ncb":                  ["nanyang commercial"],  # legacy alias

    # Virtual banks
    "za_bank":              ["za bank", "眾安銀行"],
    "mox_bank":             ["mox bank", "mox"],
    "welab_bank":           ["welab bank", "匯立銀行"],
    "livi_bank":            ["livi bank", "理慧銀行"],
    "fusion_bank":          ["fusion bank", "富融銀行"],
    "ant_bank_hk":          ["ant bank (hong kong)", "ant bank hong kong", "ant bank", "螞蟻銀行"],
    "airstar_bank":         ["airstar bank", "天星銀行"],
    "pao_bank":             ["pao bank"],

    # ── CREDIT CARDS (non-bank issuers) ───────────────────────────────────────
    "american_express":     ["american express", "amex", "ae card"],
    "aeon_credit_hk":       ["aeon credit service (asia)", "aeon credit"],
    "primecredit":          ["primecredit", "prime credit"],
    "hkt_tap_go":           ["hkt payment", "tap & go", "tap and go"],

    # ── LIFE & HEALTH INSURANCE ────────────────────────────────────────────────
    "aia":                  ["aia international", "aia company", "aia everest", "aia"],
    "prudential_hk":        ["prudential hong kong", "prudential general insurance hong kong", "prudential"],
    "manulife":             ["manulife (international)", "manulife international", "manulife"],
    "hsbc_life":            ["hsbc life (international)", "hsbc life international", "hsbc life"],
    "fwd":                  ["fwd life insurance", "fwd general insurance", "fwd"],
    "sun_life_hk":          ["sun life hong kong", "sun life hk", "sun life"],
    "axa_hk":               ["axa china region", "axa life insurance company", "axa general insurance hong kong", "axa"],
    "bochk_life":           ["boc group life assurance", "boc group life"],
    "hang_seng_insurance":  ["hang seng insurance"],
    "china_life_overseas":  ["china life insurance (overseas)", "china life overseas", "china life"],
    "china_taiping":        ["china taiping life", "china taiping insurance", "china taiping"],
    "chubb_hk":             ["chubb life insurance", "chubb insurance hong kong", "chubb"],
    "generali_hk":          ["generali life (hong kong)", "generali life", "generali"],
    "yf_life":              ["yf life insurance", "yf life"],
    "hk_life":              ["hong kong life insurance", "hong kong life"],
    "well_link":            ["well link life insurance", "well link general insurance", "well link"],
    "bowtie":               ["bowtie life insurance", "bowtie"],
    "blue_insurance":       ["blue insurance limited", "blue cross (asia-pacific)", "blue cross", "blue insurance"],
    "za_life":              ["za life limited", "za life"],
    "cigna_hk":             ["cigna worldwide life", "cigna worldwide general", "cigna"],
    "bupa_hk":              ["bupa (asia)", "bupa asia", "bupa"],
    "aig_hk":               ["aig insurance hong kong", "aig hk", "aig"],
    "china_ping_an_hk":     ["china ping an insurance (hong kong)", "ping an insurance", "ping an"],
    "dah_sing_insurance":   ["dah sing insurance"],
    "msig_hk":              ["msig insurance (hong kong)", "msig"],
    "onedegree":            ["onedegree hong kong", "onedegree"],
    "zurich_hk":            ["zurich insurance", "zurich"],
    "tokio_marine_hk":      ["tokio marine and fire insurance", "tokio marine"],
    "chow_tai_fook_life":   ["chow tai fook life insurance", "chow tai fook life"],
    "principal_insurance":  ["principal insurance company (hong kong)", "principal insurance"],
    "hkmc_annuity":         ["hkmc annuity", "hong kong annuity"],
    "st_james_place_hk":    ["st. james's place", "st james's place", "sjp"],
    "liberty_hk":           ["liberty international insurance", "liberty insurance"],
    "qbe_hk":               ["qbe hongkong", "qbe hong kong", "qbe"],
    "sompo_hk":             ["sompo insurance (hong kong)", "sompo"],
    "allianz_hk":           ["allianz"],
    "berkshire_specialty":  ["berkshire hathaway specialty"],
    "starr_hk":             ["starr international insurance"],

    # ── SECURITIES BROKERS & INVESTMENT PLATFORMS ─────────────────────────────
    # Online/app platforms
    "futu":                 ["futu securities", "富途證券", "moomoo"],
    "tiger_brokers":        ["tiger brokers", "老虎證券", "tiger broker"],
    "interactive_brokers":  ["interactive brokers", "ibkr", "interactivebrokers"],
    "longbridge":           ["longbridge securities", "長橋證券", "longbridge"],
    "webull_hk":            ["webull securities (hk)", "webull securities hk", "webull"],
    "usmart_hk":            ["usmart securities", "贏立證券"],
    "saxo_hk":              ["saxo markets (hong kong)", "saxo markets hong kong", "saxo"],
    "stashaway_hk":         ["stashaway hong kong", "stashaway"],
    "charles_schwab_hk":    ["charles schwab"],
    "sofi_hk":              ["sofi hong kong", "sofi hk"],

    # Bank-linked platforms
    "boci_securities":      ["boci securities", "bank of china international securities", "中銀國際證券"],
    "hsbc_investdirect":    ["hsbc investdirect", "hsbc securities"],
    "hang_seng_securities": ["hang seng securities", "恒生證券"],
    "dbs_vickers":          ["dbs vickers", "星展唯高達"],
    "icbc_securities":      ["icbc (asia) securities", "icbc asia securities"],
    "ccb_securities":       ["china construction bank (asia) securities", "建銀亞洲證券"],
    "sc_securities":        ["standard chartered securities (hk)", "standard chartered securities"],
    "dah_sing_securities":  ["dah sing securities", "大新證券"],
    "chong_hing_securities":["chong hing securities", "創興證券"],
    "bea_securities":       ["bank of east asia securities"],
    "cmb_intl_securities":  ["cmb international securities", "招銀國際證券"],

    # Traditional brokers
    "phillip_securities":   ["phillip securities", "輝立證券"],
    "clsa":                 ["clsa", "里昂證券"],
    "guotai_junan":         ["guotai junan international", "guotai junan", "國泰君安國際"],
    "haitong_intl":         ["haitong international securities", "haitong international", "海通國際"],
    "bright_smart":         ["bright smart securities", "耀才證券"],
    "gf_securities_hk":     ["gf securities (hk)", "廣發證券 (香港)", "廣發證券"],
    "huatai_intl":          ["huatai international", "華泰國際"],
    "china_merchants_sec":  ["china merchants securities (hk)", "招商證券"],
    "yuanta_hk":            ["yuanta securities (hong kong)", "yuanta securities", "元大證券"],
    "kgi_hk":               ["kgi securities (hk)", "kgi securities", "凱基證券"],
    "bocom_intl_sec":       ["bocom international securities", "交銀國際證券"],
    "ccbi_securities":      ["ccb international securities", "建銀國際證券"],

    # Overseas brokers popular in HK
    "charles_schwab":       ["schwab", "charles schwab"],
    "td_ameritrade":        ["td ameritrade"],
    "fidelity":             ["fidelity"],
    "firstrade":            ["firstrade", "apex clearing", "first trade"],
    "etrade":               ["e*trade", "etrade"],
    "vanguard":             ["vanguard"],

    # ── MPF PROVIDERS ─────────────────────────────────────────────────────────
    "aia_mpf":              ["aia mpf", "aia prime value choice"],
    "bct_mpf":              ["bank consortium trust", "bct (mpf)", "bct mpf", "amtd mpf"],
    "bea_mpf":              ["bea (mpf)", "bea mpf"],
    "boci_prudential_mpf":  ["boci-prudential trustee", "boci prudential", "中銀國際英國保誠信託",
                             "my choice mpf", "boc-prudential"],
    "china_life_mpf":       ["china life trustees", "china life mpf"],
    "hsbc_mpf":             ["hsbc provident fund trustee", "hsbc mpf", "hsbc supertrust",
                             "hang seng mpf", "fidelity retirement master trust"],
    "manulife_mpf":         ["manulife provident funds trust", "manulife global select (mpf)",
                             "manulife mpf"],
    "principal_mpf":        ["principal trust company (asia)", "principal mpf"],
    "sc_mpf":               ["standard chartered trustee (hong kong)", "shkp mpf"],
    "sun_life_mpf":         ["sun life trustee", "sun life rainbow mpf"],
    "yf_life_mpf":          ["yf life trustees", "mass mandatory provident fund"],
    "bocom_mpf":            ["bank of communications trustee", "bcom joyful retirement"],
}


def _normalise_entity(issuer: str) -> str:
    """Map an issuer name to a canonical entity slug."""
    issuer_lower = issuer.lower().replace("-", " ").replace("(", " ").replace(")", " ").strip()
    for canonical, variants in _ENTITY_ALIASES.items():
        if any(v in issuer_lower for v in variants):
            return canonical
    # Fall back to slug-ified issuer name
    import re
    return re.sub(r"[^a-z0-9]+", "_", issuer_lower).strip("_")


def classify(result: ExtractionResult, known_entities: list[str]) -> ExtractionResult:
    """Normalise entity and transaction fields. Mutates result in place, returns it."""
    # Always normalise entity from issuer name — don't trust the model's entity field
    if result.issuer:
        result.entity = _normalise_entity(result.issuer)
        result.entity_confidence = "high"
    elif result.entity not in known_entities:
        result.entity = ""
        result.entity_confidence = "low"

    for t in result.transactions:
        if t.get("direction") not in _VALID_DIRECTIONS:
            t["direction"] = "expense"

    return result
