# FAR-Lab 研究报告 — run run_bbnbjqywdktdyc60srya9qg39d

> 本报告由本 run 的存储对象确定性渲染生成：每一节均来自持久化对象，未记录的内容以「缺失」明示，不含任何补造。

## 1. 问题与范围

- 问题（q_53jfpr20h7vgd2rfq7q0x9xa4j）：What mechanisms allow tumor cells to evade NK cell recognition?
- 目标类型：explanatory
- 领域：immunology
- 现象：mechanisms allowing tumor cells to evade NK cell recognition

## 2. 语料与来源核验

- 语料快照 corp_5t66c5r2k9byf9kvw7atyysb8r：检索查询 6 条，文档 7 篇
  - 查询（counter_evidence）：NK cell evasion tumor failed replication
  - 查询（counter_evidence）：NK cell tumor evasion limitations methodological critique
  - 查询（discovery）：NK cell recognition tumor immune evasion mechanisms
  - 查询（discovery）：NK cell recognition tumor immune evasion mechanisms
  - 查询（supporting）：tumor cells downregulate NK cell ligands immune evasion
  - 查询（supporting）：tumor cells downregulate NK cell ligands immune evasion
| 标题 | 年份 | 深度 | 访问态 | 核验结果 | contentHash(前12位) |
|---|---|---|---|---|---|
| Functions of natural killer cells | 2008 | metadata_only | open | crossref_doi · resolved=true · titleMatch=true | 4a54fd4a5c5d |
| Immune evasion in cancer: Mechanistic basis and therapeutic strategies | 2015 | abstract | open | crossref_doi · resolved=true · titleMatch=true | d711bf3e7d11 |
| Interferon-Gamma at the Crossroads of Tumor Immune Surveillance or Evasion | 2018 | abstract | open | crossref_doi · resolved=true · titleMatch=true | aa4ba335b64d |
| Cold Tumors: A Therapeutic Challenge for Immunotherapy | 2019 | abstract | open | crossref_doi · resolved=true · titleMatch=true | 8686e4cb6bc2 |
| The history and advances in cancer immunotherapy: understanding the characteristics of tumor-infiltrating immune cells and their therapeutic implications | 2020 | abstract | open | crossref_doi · resolved=true · titleMatch=true | 1b2370452cef |
| Accessories to the Crime: Functions of Cells Recruited to the Tumor Microenvironment | 2012 | metadata_only | open | crossref_doi · resolved=true · titleMatch=true | cc4c9f04bc9e |
| Crosstalk between cancer-associated fibroblasts and immune cells in the tumor microenvironment: new findings and future perspectives | 2021 | abstract | open | crossref_doi · resolved=true · titleMatch=true | 41a4a5916174 |

## 3. 声明与绑定状态

- 声明总数：1
- verified：1 条
- resolved_unaligned：0 条
- unresolved：0 条
- missing：0 条
- 无 resolved_unaligned 声明。

## 4. 证据关系汇总

- 关系总数：11
- supports：5 条
- contradicts：1 条
- qualifies：0 条
- unknown：0 条
- weakens：5 条
- 关键反证：
  - [weakens] CAFs interact with tumor-infiltrating immune cells and other immune components via secretion of various cytokines, growt…（来源: Crosstalk between cancer-associated fibr…，strength=unrated）
  - [weakens] CAFs interact with tumor-infiltrating immune cells and other immune components via secretion of various cytokines, growt…（来源: Crosstalk between cancer-associated fibr…，strength=unrated）
  - [weakens] CAFs interact with tumor-infiltrating immune cells and other immune components via secretion of various cytokines, growt…（来源: Crosstalk between cancer-associated fibr…，strength=unrated）
  - [weakens] CAFs interact with tumor-infiltrating immune cells and other immune components via secretion of various cytokines, growt…（来源: Crosstalk between cancer-associated fibr…，strength=unrated）
  - [contradicts] CAFs interact with tumor-infiltrating immune cells and other immune components via secretion of various cytokines, growt…（来源: Crosstalk between cancer-associated fibr…，strength=unrated）
  - [weakens] CAFs interact with tumor-infiltrating immune cells and other immune components via secretion of various cytokines, growt…（来源: Crosstalk between cancer-associated fibr…，strength=unrated）

## 5. 假设（排序代表）

### hyp_5q961dp137vb2a5tyt09ndgkfa（版本 v0）

- 陈述：Tumor cells evade NK cell recognition by releasing soluble factors that downmodulate NK cell activating receptors or induce NK cell dysfunction.
- 机制：Tumor cells and associated stromal cells (including CAFs, as in the claim) secrete cytokines (e.g., TGF-β, IL-10), exosomes carrying NKG2D ligands, or other factors that bind to NK cell receptors, leading to receptor internalization and degradation, or inducing a state of NK cell exhaustion/anergy characterized by reduced cytotoxicity and cytokine production.
- 关键前提：
  - [stipulated] Soluble factors and exosomes can travel within the tumor microenvironment and interact with NK cells.
  - [stipulated] NK cell receptor downmodulation leads to functional impairment.
  - [stipulated] Exosomes can deliver ligands to NK cells at a distance.
- 证伪规格要点：观测=NKG2D surface expression on NK cells after incubation with tumor-conditioned medium (TCM) from CAF-rich tumor cultures；测量=Flow cytometry: measure mean fluorescence intensity (MFI) of NKG2D on CD56+ NK cells after 24h incubation with TCM vs. control medium. Also measure NK cell degranulation (CD107a) and cytokine production (IFN-γ) in response to K562 target cells.；判定规则=If mean NKG2D MFI in TCM-treated NK cells is <70% of control MFI, AND CD107a+ NK cell percentage is <50% of control, then hypothesis is supported. If NKG2D MFI is 70-90% of control OR CD107a is 50-80% of control, hypothesis is weakened. If NKG2D MFI ≥90% of control AND CD107a ≥80% of control, hypothesis is refuted.；证伪条件=Mean NKG2D MFI ≥90% of control and CD107a+ % ≥80% of control.；⚠ 阈值为模型拟定，无证据来源
- 证伪规格完整性（completenessCheck）：通过
- testability：testable_now；noveltyLabel：mixed（仅相对本 run 检索语料判定，未做全文献新颖性检索）
- 簇内候选数（含本代表）：1

### hyp_1ktq0px2vycbhwmn682zpbvreh（版本 v0）

- 陈述：Tumor cells evade NK cell recognition by downregulating NK-activating ligands (e.g., MICA/B) and upregulating inhibitory ligands (e.g., HLA-E) that engage NK cell inhibitory receptors.
- 机制：Tumor cells alter the surface expression of ligands for NK cell receptors: they reduce stress-induced ligands recognized by activating receptors (NKG2D, DNAM-1) and increase HLA-E or other ligands for inhibitory receptors (NKG2A, KIR). This shifts the balance of activating and inhibitory signals in NK cells toward inhibition, preventing NK cell activation and cytotoxicity.
- 关键前提：
  - [stipulated] NK cell recognition is governed by the dynamic balance of activating and inhibitory receptor signaling.
  - [stipulated] Tumor cells can modulate their surface ligand expression via genetic or epigenetic mechanisms.
  - [stipulated] Ligand expression levels directly correlate with NK cell response strength.
- 证伪规格要点：观测=Surface expression levels of MICA/B and HLA-E on tumor cells, and NK cell cytotoxicity against those tumor cells in vitro, with and without NKG2A/HLA-E blockade.；测量=Flow cytometry to quantify MICA/B and HLA-E surface expression on tumor cell lines (e.g., MFI). NK cell cytotoxicity measured by standard 4-hour 51Cr-release or LDH-release assay at multiple effector:target (E:T) ratios, using primary NK cells from healthy donors. Blocking experiments use anti-NKG2A or anti-HLA-E antibodies at saturating concentrations.；判定规则=If the average specific lysis of tumor cells with low MICA/B and high HLA-E is at least 30% lower than that of tumor cells with high MICA/B and low HLA-E at an E:T ratio of 10:1 (and this difference is statistically significant, p<0.05, with n≥3 independent experiments), AND anti-NKG2A or anti-HLA-E blockade increases lysis of the low MICA/B/high HLA-E cells by at least 20% (absolute percentage points) compared to isotype control, then the hypothesis is supported. If no significant difference is observed (p≥0.05) or the magnitude is less than 30% for the first comparison, or less than 20% for the blocking effect, the hypothesis is weakened. If the lysis of low MICA/B/high HLA-E cells is significantly higher (≥30% higher) than high MICA/B/low HLA-E cells, or if blocking NKG2A/HLA-E reduces lysis significantly (>20% reduction), the hypothesis is refuted.；证伪条件=Observed opposite direction (low MICA/B/high HLA-E cells more lysed) or blockade reduces lysis, with magnitude ≥30% or ≥20% respectively.；⚠ 阈值为模型拟定，无证据来源
- 证伪规格完整性（completenessCheck）：通过
- testability：testable_now；noveltyLabel：novel_speculation（仅相对本 run 检索语料判定，未做全文献新颖性检索）
- 簇内候选数（含本代表）：1

### hyp_1v02sv7y7xq8xzadhz8bf0c3f6（版本 v0）

- 陈述：Tumor cells shed soluble NKG2D ligands (e.g., MICA/B) into the tumor microenvironment, causing downregulation of the activating receptor NKG2D on NK cells and impairing their activation.
- 机制：Tumor-derived exosomes or proteases cleave MICA/B, releasing soluble forms that bind to NKG2D on NK cells, leading to receptor internalization and degradation.
- 关键前提：
  - [stipulated] Soluble NKG2D ligands are present at biologically active concentrations in the TME.
  - [stipulated] NKG2D downmodulation significantly reduces NK cell function.
- 证伪规格要点：观测=Mean fluorescence intensity (MFI) of NKG2D on NK cells in tumor-draining lymph nodes or tumor explants from patients or mouse models；测量=Flow cytometry or mass cytometry (CyTOF) analysis of NK cells (gated as CD3−CD56+ or NK1.1+ in mice) from matched tumor tissue and peripheral blood. NKG2D (CD314) expression quantified as MFI and percentage of NKG2D+ NK cells. Also measure soluble MICA (sMICA) concentration in plasma and tumor interstitial fluid via ELISA or multiplex bead assay.；判定规则=If Spearman correlation coefficient between sMICA and NKG2D MFI is ≤ -0.4 (with p < 0.05) AND mean tumor NKG2D MFI is at least 30% lower than peripheral blood MFI (normalized to isotype control), then hypothesis is supported. If correlation is between -0.4 and 0 or if tumor NKG2D MFI is 10-30% lower without correlation, then hypothesis is weakened. If correlation is ≥ 0 or tumor NKG2D MFI is within 10% of peripheral blood (or higher), then hypothesis is refuted.；证伪条件=Correlation ≥ 0 OR tumor NKG2D MFI within 10% of peripheral blood (or higher).；⚠ 阈值为模型拟定，无证据来源
- 证伪规格完整性（completenessCheck）：通过
- testability：testable_now；noveltyLabel：novel_speculation（仅相对本 run 检索语料判定，未做全文献新颖性检索）
- 簇内候选数（含本代表）：1

### hyp_2bkgsvqdgt2hbsjjpat003ff1g（版本 v0）

- 陈述：Tumor cells evade NK cells by upregulating the non-classical HLA-G molecule, which engages inhibitory receptors (ILT2/ILT4) on NK cells and suppresses their cytotoxicity.
- 机制：HLA-G expression on tumor surface binds to ILT2/ILT4 on NK cells, delivering inhibitory signals that override activating signals.
- 关键前提：
  - [stipulated] HLA-G is expressed by tumor cells and not shed in significant amounts.
  - [stipulated] NK cells in the tumor microenvironment express ILT2/ILT4.
- 证伪规格要点：观测=Difference in NK-cell-mediated lysis between HLA-G-positive and HLA-G-negative tumor cells in co-culture, and the effect of HLA-G/ILT2/ILT4 blockade on that lysis.；测量=In vitro cytotoxicity assay: label HLA-G-positive and HLA-G-negative tumor cell lines (isogenic pairs, e.g., HLA-G-transfected vs. mock) with calcein-AM or 51Cr, co-incubate with primary NK cells at effector:target ratios (e.g., 10:1, 5:1) for 4–6 hours, measure specific lysis. Parallel experiments with anti-HLA-G (e.g., 87G) or anti-ILT2/ILT4 (e.g., HP-F1, 27p6G11) blocking antibodies vs. isotype controls. Quantify HLA-G surface expression by flow cytometry (MFI) and shed HLA-G by ELISA in supernatant.；判定规则=Support: In ≥3 independent experiments, mean specific lysis of HLA-G-positive cells is ≥30% lower than HLA-G-negative cells at E:T=10:1 (p<0.05, two-tailed paired t-test), AND blockade of HLA-G or ILT2/ILT4 increases lysis of HLA-G-positive cells by ≥2-fold (p<0.05). Weakening: Only one of the two conditions (differential lysis or blockade effect) is met, or the effect size is smaller (e.g., 10–30% reduction, 1.5–2-fold restoration). Refutation: No significant difference in lysis between HLA-G-positive and HLA-G-negative cells (<10% reduction, p>0.05), or blockade fails to restore killing (<1.2-fold increase, p>0.05) in ≥3 independent experiments, or the primary effect is due to shed HLA-G (e.g., conditioned media from HLA-G-positive cells suppresses lysis of HLA-G-negative targets).；证伪条件=No significant difference in NK lysis between HLA-G-positive and HLA-G-negative tumors, and/or blockade of HLA-G/ILT2/ILT4 does not restore killing, across multiple experiments using validated HLA-G surface expression and functional NK assays.；⚠ 阈值为模型拟定，无证据来源
- 证伪规格完整性（completenessCheck）：通过
- testability：testable_now；noveltyLabel：novel_speculation（仅相对本 run 检索语料判定，未做全文献新颖性检索）
- 簇内候选数（含本代表）：1

### hyp_abre45rkeqdk52bc23ajrr9c50（版本 v0）

- 陈述：Tumor cells evade NK cell recognition by inducing cancer-associated fibroblasts (CAFs) to secrete TGF-β, which downregulates NK cell activating receptors (e.g., NKG2D) and reduces NK cell cytotoxicity.
- 机制：CAF-derived TGF-β suppresses NK cell receptor expression, impairing their ability to recognize and kill tumor cells.
- 关键前提：
  - [stipulated] CAFs within the tumor microenvironment secrete TGF-β in response to tumor-derived signals.
  - [stipulated] TGF-β directly or indirectly downregulates NKG2D and other activating receptors on NK cells.
- 证伪规格要点：观测=Expression level of NKG2D (and other activating receptors like NKp30, NKp46) on NK cells after co-culture with CAFs in the presence vs. absence of TGF-β signaling blockade, and corresponding NK cell cytotoxicity against tumor cells.；测量=In an in vitro co-culture assay: (1) Isolate primary human NK cells and CAFs (from tumor tissue or derived cell lines). (2) Co-culture NK cells with CAFs (1:1 ratio) for 24-48 hours, with and without a TGF-β neutralizing antibody (e.g., 10 μg/mL anti-TGF-β) or a TGF-β receptor inhibitor (e.g., SB431542 at 10 μM). (3) Measure NKG2D and other activating receptor surface expression by flow cytometry (mean fluorescence intensity, MFI). (4) Measure NK cell cytotoxicity against a standard NK-sensitive target (e.g., K562) or the matched tumor cell line after 4-hour chromium release or LDH release assay at effector:target ratios of 1:1, 5:1, 10:1. (5) Quantify TGF-β levels in co-culture supernatant by ELISA (e.g., human TGF-β1 Quantikine ELISA).；判定规则=Let D = (NK-alone value) - (untreated co-culture value) for either NKG2D MFI or % lysis at E:T=10:1. Let B = (TGF-β blockade value) - (untreated co-culture value). Support if B >= 0.5 * D (for both parameters). Weakening if 0.1 * D < B < 0.5 * D for either parameter, or if B remains < 0.1 * D while supernatant TGF-β is confirmed elevated. Refutation if TGF-β blockade does not increase either parameter (B < 0.1 * D) despite confirmed TGF-β neutralization (e.g., supernatant TGF-β reduced by >90% compared to untreated), or if NKG2D increases but cytotoxicity does not (i.e., B_cytotoxicity < 0.1 * D_cytotoxicity).；证伪条件=B < 0.1 * D for either parameter despite confirmed TGF-β neutralization, or no rescue of killing even if NKG2D is rescued.；⚠ 阈值为模型拟定，无证据来源
- 证伪规格完整性（completenessCheck）：通过
- testability：testable_now；noveltyLabel：novel_speculation（仅相对本 run 检索语料判定，未做全文献新颖性检索）
- 簇内候选数（含本代表）：1

### hyp_838qmp1edf5nx4rszyrzh7nq7e（版本 v0）

- 陈述：Tumor cells evade NK cells by expressing high levels of the inhibitory ligand PD-L1, which interacts with PD-1 on NK cells to suppress NK cell effector functions.
- 机制：PD-1 expression on activated NK cells, when engaged by tumor PD-L1, recruits SHP phosphatases that dampen NK cell signaling.
- 关键前提：
  - [stipulated] NK cells in the TME express PD-1.
  - [stipulated] PD-1 expression is sustained on tumor-infiltrating NK cells.
- 证伪规格要点：观测=NK cell-mediated cytotoxicity (percent specific lysis) against PD-L1-positive tumor cells in co-culture, and change after PD-1/PD-L1 blockade；测量=In a controlled co-culture assay, incubate activated NK cells (pre-activated with IL-2 or IL-15) with PD-L1-high tumor cells (e.g., MDA-MB-231 or A375) at effector:target ratios (e.g., 10:1, 5:1, 1:1) for 4-6 hours. Measure cytotoxicity via standard 51Cr-release or calcein-AM release assay. Parallel conditions: (a) no blockade, (b) anti-PD-1 or anti-PD-L1 blocking antibody (e.g., 10 µg/ml), (c) isotype control. Also measure NK cell degranulation (CD107a surface expression) and IFN-γ production by flow cytometry as functional readouts.；判定规则=Run at least 3 independent experiments. Compute the mean percent specific lysis at each E:T ratio. Define blockade effect (BE) as the difference in percent lysis between anti-PD-L1 condition and isotype control, averaged across E:T ratios. Support if BE > 10% (absolute increase) and p < 0.05 (paired t-test). Weakening if BE between 5% and 10% or p between 0.05 and 0.1. Falsification if BE ≤ 5% or p ≥ 0.1 (no significant enhancement), or if there is no dose-dependent effect with anti-PD-L1 concentration.；证伪条件=BE ≤ 5% (no meaningful increase) or p ≥ 0.1, or lack of effect despite confirmed PD-1 expression on NK cells and PD-L1 on tumor cells.；⚠ 阈值为模型拟定，无证据来源
- 证伪规格完整性（completenessCheck）：通过
- testability：testable_now；noveltyLabel：novel_speculation（仅相对本 run 检索语料判定，未做全文献新颖性检索）
- 簇内候选数（含本代表）：1

### hyp_1050nyanqxspwemmbtpg5nb5x3（版本 v0）

- 陈述：Tumor cells evade NK cell recognition by creating a physical barrier or altering the extracellular matrix to impede NK cell infiltration and contact.
- 机制：Tumor cells, with help from CAFs, remodel the extracellular matrix (ECM) and increase interstitial fluid pressure, producing a dense stroma that acts as a physical barrier. This prevents NK cells from migrating toward tumor cells and forming stable immune synapses, thereby reducing effective recognition and killing.
- 关键前提：
  - [stipulated] NK cell cytotoxicity requires direct cell-to-cell contact with tumor cells.
  - [stipulated] The tumor stroma can be dense enough to hinder immune cell migration.
  - [stipulated] ECM components like collagen and hyaluronan can create barriers.
- 证伪规格要点：观测=NK cell infiltration density in tumor tissue as a function of ECM density/barrier characteristics；测量=In a controlled in vivo mouse model (e.g., syngeneic tumor allograft), measure (a) ECM density via collagen I and hyaluronan staining (e.g., Sirius Red, hyaluronan binding protein), (b) NK cell infiltration via CD45+NKp46+ cell count per mm² of tumor, and (c) tumor size/outcome. Then perform an intervention experiment: administer hyaluronidase (to degrade hyaluronan) or collagenase (to digest collagen) intratumorally and reassess NK infiltration and tumor growth. Use 3D in vitro Matrigel/collagen assays with varied matrix density to test NK migration and killing.；判定规则=If the Spearman correlation between ECM density and NK infiltration is ≤ -0.5 (at least moderate negative) and the intervention yields ≥ 50% increase in NK infiltration and ≥ 50% tumor growth inhibition, then support. If the correlation is between -0.5 and -0.2 or intervention yields 20%-50% increase/inhibition, then weakening. If the correlation is > -0.2 or intervention yields < 20% increase/inhibition, or if ECM digestion leads to no improvement or worsening, then refutation.；证伪条件=Correlation > -0.2 OR intervention effect < 20% increase/inhibition, or any contradictory finding.；⚠ 阈值为模型拟定，无证据来源
- 证伪规格完整性（completenessCheck）：通过
- testability：testable_now；noveltyLabel：novel_speculation（仅相对本 run 检索语料判定，未做全文献新颖性检索）
- 簇内候选数（含本代表）：1

### hyp_7yhs70ptk5s0vk9g55y427xwk0（版本 v0）

- 陈述：Tumor cells evade NK cell recognition by recruiting CAFs that secrete IL-6, which triggers NK cell exhaustion by inducing sustained STAT3 activation and upregulating inhibitory checkpoints like PD-1.
- 机制：CAF-derived IL-6 activates STAT3 in NK cells, leading to a state of exhaustion with reduced cytotoxic function.
- 关键前提：
  - [stipulated] CAFs are a significant source of IL-6 in the tumor microenvironment.
  - [stipulated] IL-6-mediated STAT3 signaling in NK cells leads to upregulation of inhibitory receptors and impaired effector function.
- 证伪规格要点：观测=PD-1 expression and cytotoxic activity of NK cells after IL-6 exposure in vitro, and tumor growth in a tumor model with IL-6 receptor blockade.；测量=For in vitro: NK cells are cultured with recombinant IL-6 (e.g., 10 ng/mL) for 48 hours, then PD-1 surface expression is measured by flow cytometry (geometric mean fluorescence intensity), and cytotoxic killing against K562 target cells is measured in a standard 4-hour chromium release or flow-based killing assay at an effector-to-target ratio of 10:1, reading out % specific lysis. For in vivo: Use a syngeneic tumor model (e.g., B16 melanoma) in mice; treat with anti-IL-6R (tocilizumab equivalent, e.g., 200 µg/mouse, i.p., every 3 days) or isotype control starting day 7; measure tumor volume over 21 days and quantify intratumoral NK cell PD-1 expression and Granzyme B content at endpoint using flow cytometry.；判定规则=Support: In at least 3 independent experiments, IL-6 treatment increases PD-1 expression (mean MFI increase ≥1.5-fold) AND reduces specific lysis by ≥20% compared to control; and in at least 2 in vivo studies, IL-6R blockade reduces tumor volume by ≥30% compared to control with statistical significance (p<0.05). Weakening: IL-6 increases PD-1 but does not reduce killing by ≥20%, or IL-6R blockade reduces tumor growth but without change in NK cell function/PD-1; or only in vitro but not in vivo. Refutation: If IL-6 treatment fails to increase PD-1 expression (mean MFI <1.5-fold) or fails to reduce specific lysis by ≥20%, or IL-6R blockade fails to reduce tumor volume by ≥30% (p≥0.05), across replicated experiments.；证伪条件=IL-6 does not increase PD-1 and does not reduce killing; IL-6R blockade has no effect on tumor growth or NK cell function; or the effects occur but are independent of NK cells (e.g., IL-6R blockade affects T cells, not NK cells).；⚠ 阈值为模型拟定，无证据来源
- 证伪规格完整性（completenessCheck）：通过
- testability：testable_now；noveltyLabel：novel_speculation（仅相对本 run 检索语料判定，未做全文献新颖性检索）
- 簇内候选数（含本代表）：1

### hyp_karqjf8qnqw1ebv9sq131ft9ce（版本 v0）

- 陈述：Tumor cells evade NK cell recognition by downregulating surface MHC class I molecules, thereby avoiding inhibition through killer cell immunoglobulin-like receptors (KIRs) on NK cells.
- 机制：Reduced MHC class I expression diminishes engagement of inhibitory KIRs, lowering the threshold for NK cell activation, but tumor cells may compensate by expressing ligands for activating receptors.
- 关键前提：
  - [stipulated] NK cell surveillance primarily depends on MHC class I recognition via KIRs.
  - [stipulated] Tumor cells can modulate MHC class I expression without losing overall fitness.
- 证伪规格要点：观测=MHC class I surface expression on tumor cells and NK cell-mediated lysis of those tumor cells in vitro；测量=Use flow cytometry to quantify surface MHC class I (e.g., HLA-A,B,C) on a panel of tumor cell lines (e.g., before and after IFN-gamma treatment to upregulate MHC I). Measure NK cell cytotoxicity via standard 4-hour 51Cr release or LDH release assay at multiple effector-to-target ratios (e.g., 1:1, 5:1, 10:1, 20:1). Also measure KIR engagement indirectly by using a KIR-blocking antibody (e.g., anti-KIR2DL1/2/3) in the killing assay.；判定规则=For a given effector-to-target ratio (e.g., 10:1), compute the mean specific lysis for at least three MHC-low tumor lines and at least three MHC-high tumor lines. If the mean specific lysis of MHC-low tumors is significantly lower (p<0.05, one-tailed t-test) than that of MHC-high tumors AND blocking KIRs increases lysis of MHC-low tumors by at least 20% relative to isotype control (with p<0.05), the hypothesis is supported. If the mean lysis of MHC-low tumors is not significantly different from MHC-high tumors, or if blocking KIRs does not enhance lysis of MHC-low tumors by >=20% (p<0.05), the hypothesis is weakened. If MHC-low tumors show significantly HIGHER lysis than MHC-high tumors (p<0.05), the hypothesis is refuted.；证伪条件=MHC-low tumors are killed significantly MORE than MHC-high tumors (p<0.05).；⚠ 阈值为模型拟定，无证据来源
- 证伪规格完整性（completenessCheck）：通过
- testability：testable_now；noveltyLabel：novel_speculation（仅相对本 run 检索语料判定，未做全文献新颖性检索）
- 簇内候选数（含本代表）：1

### hyp_sjcwbcwp5q9vd5bk8xg8dg3kdt（版本 v0）

- 陈述：Tumor cells evade NK cell recognition by producing lactate that stimulates CAFs to release exosomes enriched in miR-183, which is transferred to NK cells and suppresses the expression of DAP12, an adaptor for activating receptors.
- 机制：Tumor-derived lactate induces CAFs to secrete exosomes containing miR-183, which upon uptake by NK cells downregulates DAP12, impairing NK cell activation.
- 关键前提：
  - [stipulated] Lactate in the tumor microenvironment triggers exosome release from CAFs.
  - [stipulated] miR-183 in CAF-derived exosomes can be taken up by NK cells and specifically target DAP12 mRNA.
- 证伪规格要点：观测=DAP12 protein/mRNA expression in NK cells co-cultured with CAFs exposed to high lactate, and NK cell killing activity；测量=In vitro: Co-culture human NK cells with CAFs in media containing 10 mM lactate (vs control) for 24-48h; measure DAP12 expression via qRT-PCR and Western blot; measure NK killing activity against K562 target cells via chromium release or flow cytometry-based cytotoxicity assay. In vivo (optional): inject CAF-derived exosomes with/without miR-183 antagomirs into tumor-bearing mice and assess intratumoral NK DAP12 by flow cytometry and tumor size.；判定规则=Compute mean DAP12 expression and %-specific lysis with standard deviations (n≥3 independent replicates). If mean DAP12 in lactate condition is ≤70% of control AND mean killing activity is ≤70% of control (using 2-tailed unpaired t-test, p<0.05), then support. If DAP12 is between 70-85% of control OR killing between 70-85% of control, classify as weakening (partial). If DAP12 >85% of control or killing >85% of control (with p>0.05), then refutation.；证伪条件=If both DAP12 and killing activity are >85% of control, or if either is >85% with p>0.05, then hypothesis fails.；⚠ 阈值为模型拟定，无证据来源
- 证伪规格完整性（completenessCheck）：通过
- testability：testable_now；noveltyLabel：novel_speculation（仅相对本 run 检索语料判定，未做全文献新颖性检索）
- 簇内候选数（含本代表）：1


## 6. 排序与评分

> 声明：分数为可检查的决策辅助，非客观概率。

### rank 1 / 10 — hyp_5q961dp137vb2a5tyt09ndgkfa

- 总评：Composite 0.7636 = weighted average of valid dimensions (fixed weights evidence_grounding 0.2, falsifiability 0.15, testability 0.1, counter_evidence_exposure 0.15, scientific_plausibility 0.15, novelty 0.1, methodological_soundness 0.15 (+cost/risk 0.05 each when direction-known, renormalized)). Deterministic tie-break on evidence_grounding. Excluded dimensions: none. All dimension scores are uncalibrated LLM judgments produced by deepseek/deepseek-chat structured critique — decision support only.
- 比较说明：Scores are inspectable decision aids, not objective probabilities.
- 各维度评分：
  - scientific_plausibility：0.8（high） — Mechanistically plausible based on known immunology; supported by extensive literature on TGF-beta and NKG2D downregulation. [producer=deepseek/deepseek-chat structured critique; calibration=uncalibrated_llm_judgment]
  - evidence_grounding：0.7（high） — Directly grounded in verified claim about CAF secretion and immunosuppression; indirect support from literature. [producer=deepseek/deepseek-chat structured critique; calibration=uncalibrated_llm_judgment]
  - counter_evidence_exposure：0.7（high） — No explicit counterclaims provided, but established literature shows alternative mechanisms; some risk of oversimplification. [producer=deepseek/deepseek-chat structured critique; calibration=uncalibrated_llm_judgment]
  - novelty：0.5（moderate） — Mixed novelty; mechanism is well-studied but specific soluble factors and exosome involvement adds nuance. [producer=deepseek/deepseek-chat structured critique; calibration=uncalibrated_llm_judgment]
  - falsifiability：0.9（high） — Clear quantitative decision rules provided for support/weakening/refutation. [producer=deepseek/deepseek-chat structured critique; calibration=uncalibrated_llm_judgment]
  - testability：1（high） — Directly testable with in vitro assays using conditioned media, neutralizing antibodies, and exosome isolation. [producer=deepseek/deepseek-chat structured critique; calibration=uncalibrated_llm_judgment]
  - data_availability：0.8（high） — Antibodies, cell lines, and assays are readily available; some optimization needed for CAF cultures. [producer=deepseek/deepseek-chat structured critique; calibration=uncalibrated_llm_judgment]
  - methodological_soundness：0.8（high） — Strong experimental design with clear endpoints; confounders identified and addressed. [producer=deepseek/deepseek-chat structured critique; calibration=uncalibrated_llm_judgment]
  - expected_information_gain：0.6（moderate） — Would confirm known mechanisms but could clarify relative contribution of soluble vs contact-dependent pathways. [producer=deepseek/deepseek-chat structured critique; calibration=uncalibrated_llm_judgment]
  - resource_cost：0.7（high） — Moderate cost; requires cell culture, flow cytometry, and reagents. Higher_value_is_better because lower cost is preferable. [producer=deepseek/deepseek-chat structured critique; calibration=uncalibrated_llm_judgment]
  - risk：0.3（low） — Low risk of failure due to robust supportive literature; but could be confounded by multiple factors. Higher value is worse (more risk). [producer=deepseek/deepseek-chat structured critique; calibration=uncalibrated_llm_judgment]
  - uncertainty：0.3（low） — Relatively low uncertainty given existing evidence; but specific soluble factors may vary. [producer=deepseek/deepseek-chat structured critique; calibration=uncalibrated_llm_judgment]

### rank 2 / 10 — hyp_1ktq0px2vycbhwmn682zpbvreh

- 总评：Composite 0.7273 = weighted average of valid dimensions (fixed weights evidence_grounding 0.2, falsifiability 0.15, testability 0.1, counter_evidence_exposure 0.15, scientific_plausibility 0.15, novelty 0.1, methodological_soundness 0.15 (+cost/risk 0.05 each when direction-known, renormalized)). Deterministic tie-break on evidence_grounding. Excluded dimensions: none. All dimension scores are uncalibrated LLM judgments produced by deepseek/deepseek-chat structured critique — decision support only.
- 比较说明：Scores are inspectable decision aids, not objective probabilities.
- 各维度评分：
  - scientific_plausibility：0.8（high） — The balance of activating/inhibitory signals is a core concept in NK cell biology; downregulation of MICA/B and upregulation of HLA-E are known mechanisms. [producer=deepseek/deepseek-chat structured critique; calibration=uncalibrated_llm_judgment]
  - evidence_grounding：0.7（moderate） — Both phenomena (MICA downregulation and HLA-E upregulation) are documented in tumors; combination is plausible but not always coordinated. [producer=deepseek/deepseek-chat structured critique; calibration=uncalibrated_llm_judgment]
  - counter_evidence_exposure：0.7（moderate） — There is counterevidence that some tumors upregulate MICA or lack HLA-E; also NKG2A polymorphism affects sensitivity. [producer=deepseek/deepseek-chat structured critique; calibration=uncalibrated_llm_judgment]
  - novelty：0.5（moderate） — The individual components are known, but the coordinated down/upregulation as a unified evasion strategy is moderately novel. [producer=deepseek/deepseek-chat structured critique; calibration=uncalibrated_llm_judgment]
  - falsifiability：0.9（high） — Decision rule with specific lysis thresholds and blockade effects is clearly falsifiable. [producer=deepseek/deepseek-chat structured critique; calibration=uncalibrated_llm_judgment]
  - testability：1（high） — Can be tested with cell lines expressing different ligand levels and blocking antibodies; testable_now. [producer=deepseek/deepseek-chat structured critique; calibration=uncalibrated_llm_judgment]
  - data_availability：0.8（high） — Reagents for MICA/B, HLA-E, and NKG2A are available; tumor cell lines can be engineered. [producer=deepseek/deepseek-chat structured critique; calibration=uncalibrated_llm_judgment]
  - methodological_soundness：0.7（moderate） — Design includes multiple controls and confounders; moderate to high soundness. [producer=deepseek/deepseek-chat structured critique; calibration=uncalibrated_llm_judgment]
  - expected_information_gain：0.6（moderate） — Could reveal combined effects and guide combination therapies; moderate gain. [producer=deepseek/deepseek-chat structured critique; calibration=uncalibrated_llm_judgment]
  - resource_cost：0.6（moderate） — Moderate cost: multiple antibodies and cell line engineering; but still manageable. [producer=deepseek/deepseek-chat structured critique; calibration=uncalibrated_llm_judgment]
  - risk：0.7（low） — Low risk; potential confounding but no safety issues. [producer=deepseek/deepseek-chat structured critique; calibration=uncalibrated_llm_judgment]
  - uncertainty：0.5（moderate） — Moderate uncertainty due to variability in NK receptor expression and ligand patterns. [producer=deepseek/deepseek-chat structured critique; calibration=uncalibrated_llm_judgment]

### rank 3 / 10 — hyp_1v02sv7y7xq8xzadhz8bf0c3f6

- 总评：Composite 0.7091 = weighted average of valid dimensions (fixed weights evidence_grounding 0.2, falsifiability 0.15, testability 0.1, counter_evidence_exposure 0.15, scientific_plausibility 0.15, novelty 0.1, methodological_soundness 0.15 (+cost/risk 0.05 each when direction-known, renormalized)). Deterministic tie-break on evidence_grounding. Excluded dimensions: none. All dimension scores are uncalibrated LLM judgments produced by deepseek/deepseek-chat structured critique — decision support only.
- 比较说明：Scores are inspectable decision aids, not objective probabilities.
- 各维度评分：
  - scientific_plausibility：0.8（high） — Soluble NKG2D ligands causing NKG2D downregulation is a well-established mechanism in tumor immunology. [producer=deepseek/deepseek-chat structured critique; calibration=uncalibrated_llm_judgment]
  - evidence_grounding：0.7（moderate） — There is extensive literature on MICA shedding and NKG2D downregulation; the provided claim is general but relevant. [producer=deepseek/deepseek-chat structured critique; calibration=uncalibrated_llm_judgment]
  - counter_evidence_exposure：0.6（moderate） — Some studies show NKG2D downregulation can occur independently of soluble ligands; needs careful assessment. [producer=deepseek/deepseek-chat structured critique; calibration=uncalibrated_llm_judgment]
  - novelty：0.3（low） — This is a relatively known mechanism in the field; low novelty. [producer=deepseek/deepseek-chat structured critique; calibration=uncalibrated_llm_judgment]
  - falsifiability：0.9（high） — Clear quantitative decision rule based on correlation and MFI thresholds; falsifiable. [producer=deepseek/deepseek-chat structured critique; calibration=uncalibrated_llm_judgment]
  - testability：1（high） — Can be tested with ELISA for sMICA and flow cytometry for NKG2D; testable_now. [producer=deepseek/deepseek-chat structured critique; calibration=uncalibrated_llm_judgment]
  - data_availability：0.9（high） — Reagents for sMICA and NKG2D are commercially available; patient samples may be needed but accessible. [producer=deepseek/deepseek-chat structured critique; calibration=uncalibrated_llm_judgment]
  - methodological_soundness：0.8（high） — Design includes multiple confounder controls and a clear decision rule; strong methodology. [producer=deepseek/deepseek-chat structured critique; calibration=uncalibrated_llm_judgment]
  - expected_information_gain：0.5（moderate） — While known, the specific correlation with patient prognosis could be informative; moderate gain. [producer=deepseek/deepseek-chat structured critique; calibration=uncalibrated_llm_judgment]
  - resource_cost：0.7（moderate） — Moderate cost: ELISA kits, flow cytometry; possibly requiring patient samples, which increases cost. [producer=deepseek/deepseek-chat structured critique; calibration=uncalibrated_llm_judgment]
  - risk：0.8（low） — Low risk: no invasive procedures except blood draws; minimal safety concerns. [producer=deepseek/deepseek-chat structured critique; calibration=uncalibrated_llm_judgment]
  - uncertainty：0.4（low） — Relatively low uncertainty given strong prior evidence. [producer=deepseek/deepseek-chat structured critique; calibration=uncalibrated_llm_judgment]

### rank 4 / 10 — hyp_2bkgsvqdgt2hbsjjpat003ff1g

- 总评：Composite 0.7000 = weighted average of valid dimensions (fixed weights evidence_grounding 0.2, falsifiability 0.15, testability 0.1, counter_evidence_exposure 0.15, scientific_plausibility 0.15, novelty 0.1, methodological_soundness 0.15 (+cost/risk 0.05 each when direction-known, renormalized)). Deterministic tie-break on evidence_grounding. Excluded dimensions: none. All dimension scores are uncalibrated LLM judgments produced by deepseek/deepseek-chat structured critique — decision support only.
- 比较说明：Scores are inspectable decision aids, not objective probabilities.
- 各维度评分：
  - scientific_plausibility：0.7（moderate） — HLA-G is a well-known immune checkpoint in cancer; its upregulation is documented in many tumor types, but the precise role in NK evasion remains debated. [producer=deepseek/deepseek-chat structured critique; calibration=uncalibrated_llm_judgment]
  - evidence_grounding：0.6（moderate） — There is literature on HLA-G and NK inhibition, but the provided claim is general about CAFs; direct evidence for this specific mechanism is not provided. [producer=deepseek/deepseek-chat structured critique; calibration=uncalibrated_llm_judgment]
  - counter_evidence_exposure：0.8（high） — Some studies show HLA-G can also engage KIR2DL4 with activating effects; counterevidence likely exists but is not explicitly cited. [producer=deepseek/deepseek-chat structured critique; calibration=uncalibrated_llm_judgment]
  - novelty：0.4（low） — HLA-G's role in NK evasion is a relatively known mechanism, so novelty is low. [producer=deepseek/deepseek-chat structured critique; calibration=uncalibrated_llm_judgment]
  - falsifiability：0.9（high） — The decision rule with specific lysis thresholds and blockade effects is clearly falsifiable. [producer=deepseek/deepseek-chat structured critique; calibration=uncalibrated_llm_judgment]
  - testability：1（high） — Can be tested with established cytotoxicity assays and blocking antibodies; deemed testable_now. [producer=deepseek/deepseek-chat structured critique; calibration=uncalibrated_llm_judgment]
  - data_availability：0.8（high） — Reagents like anti-HLA-G antibodies and HLA-G transfected cell lines are commercially available. [producer=deepseek/deepseek-chat structured critique; calibration=uncalibrated_llm_judgment]
  - methodological_soundness：0.7（moderate） — The design is sound but confounders like shed HLA-G require careful controls; the decision rule is specific. [producer=deepseek/deepseek-chat structured critique; calibration=uncalibrated_llm_judgment]
  - expected_information_gain：0.5（moderate） — Would add to existing knowledge but the mechanism is not entirely new; moderate gain. [producer=deepseek/deepseek-chat structured critique; calibration=uncalibrated_llm_judgment]
  - resource_cost：0.6（moderate） — Medium cost: requires cell lines, antibodies, and flow cytometry; not overly expensive. [producer=deepseek/deepseek-chat structured critique; calibration=uncalibrated_llm_judgment]
  - risk：0.7（low） — Low risk: no major ethical or safety issues; possible reproducibility risk due to confounding factors. [producer=deepseek/deepseek-chat structured critique; calibration=uncalibrated_llm_judgment]
  - uncertainty：0.5（moderate） — Moderate uncertainty due to conflicting reports on HLA-G's role. [producer=deepseek/deepseek-chat structured critique; calibration=uncalibrated_llm_judgment]

### rank 5 / 10 — hyp_abre45rkeqdk52bc23ajrr9c50

- 总评：Composite 0.6818 = weighted average of valid dimensions (fixed weights evidence_grounding 0.2, falsifiability 0.15, testability 0.1, counter_evidence_exposure 0.15, scientific_plausibility 0.15, novelty 0.1, methodological_soundness 0.15 (+cost/risk 0.05 each when direction-known, renormalized)). Deterministic tie-break on evidence_grounding. Excluded dimensions: none. All dimension scores are uncalibrated LLM judgments produced by deepseek/deepseek-chat structured critique — decision support only.
- 比较说明：Scores are inspectable decision aids, not objective probabilities.
- 各维度评分：
  - scientific_plausibility：0.7（high） — TGF-β is a well-known immunosuppressive cytokine in the TME and can downregulate NKG2D in various contexts. The claim of CAF involvement is plausible but not directly supported by the given claim. [producer=deepseek/deepseek-chat structured critique; calibration=uncalibrated_llm_judgment]
  - evidence_grounding：0.5（moderate） — The provided claim supports CAF-mediated immunosuppression generally, but not specifically TGF-β or NKG2D downregulation. No direct evidence for the specific mechanism is available. [producer=deepseek/deepseek-chat structured critique; calibration=uncalibrated_llm_judgment]
  - counter_evidence_exposure：0.8（high） — No explicit counterclaims were provided, but there are known alternative mechanisms and potential confounders listed in the falsification section. [producer=deepseek/deepseek-chat structured critique; calibration=uncalibrated_llm_judgment]
  - novelty：0.4（moderate） — The idea of TGF-β from CAFs suppressing NK cells is not entirely new; several studies have implicated TGF-β in NK dysfunction, but the specific CAF-NK interplay may have some novelty. [producer=deepseek/deepseek-chat structured critique; calibration=uncalibrated_llm_judgment]
  - falsifiability：0.9（high） — The decision rule is very specific with quantitative thresholds for support, weakening, and refutation. The prediction that blocking TGF-β restores NK killing is clearly falsifiable. [producer=deepseek/deepseek-chat structured critique; calibration=uncalibrated_llm_judgment]
  - testability：0.9（high） — The experiments are straightforward: co-culture of NK cells with CAFs, TGF-β blockade, and measurement of NKG2D and cytotoxicity. These are standard assays. [producer=deepseek/deepseek-chat structured critique; calibration=uncalibrated_llm_judgment]
  - data_availability：0.6（moderate） — While the specific data for CAF-derived TGF-β and NKG2D downregulation may not be publicly available, TGF-β and NK cell assays are common, and suitable reagents are accessible. [producer=deepseek/deepseek-chat structured critique; calibration=uncalibrated_llm_judgment]
  - methodological_soundness：0.7（high） — The co-culture design is sound, but potential confounders (e.g., tumor-derived TGF-β) are acknowledged and can be controlled. The quantitative thresholds are a strength. [producer=deepseek/deepseek-chat structured critique; calibration=uncalibrated_llm_judgment]
  - expected_information_gain：0.6（moderate） — If supported, it would provide mechanistic insight into CAF-mediated NK suppression, but the effect might be modest given known redundancy. The information gain is moderate. [producer=deepseek/deepseek-chat structured critique; calibration=uncalibrated_llm_judgment]
  - resource_cost：0.7（high） — Experiments are feasible with standard cell culture and flow cytometry; TGF-β inhibitors are commercially available. Cost is relatively low, so high value means low cost. [producer=deepseek/deepseek-chat structured critique; calibration=uncalibrated_llm_judgment]
  - risk：0.6（moderate） — Risk of failure is moderate because the effect may be confounded by other signals. Risk of clinical translation is low. High value means low risk, so 0.6 indicates moderate risk. [producer=deepseek/deepseek-chat structured critique; calibration=uncalibrated_llm_judgment]
  - uncertainty：0.5（moderate） — There is uncertainty about whether CAFs are the primary source of TGF-β and whether the effect is sufficient. The hypothesis is plausible but not certain. [producer=deepseek/deepseek-chat structured critique; calibration=uncalibrated_llm_judgment]

### rank 6 / 10 — hyp_838qmp1edf5nx4rszyrzh7nq7e

- 总评：Composite 0.6591 = weighted average of valid dimensions (fixed weights evidence_grounding 0.2, falsifiability 0.15, testability 0.1, counter_evidence_exposure 0.15, scientific_plausibility 0.15, novelty 0.1, methodological_soundness 0.15 (+cost/risk 0.05 each when direction-known, renormalized)). Deterministic tie-break on evidence_grounding. Excluded dimensions: none. All dimension scores are uncalibrated LLM judgments produced by deepseek/deepseek-chat structured critique — decision support only.
- 比较说明：Scores are inspectable decision aids, not objective probabilities.
- 各维度评分：
  - scientific_plausibility：0.6（moderate） — PD-1/PD-L1 role in NK cells is less established than in T cells; some studies show effect, but conflicting evidence exists. [producer=deepseek/deepseek-chat structured critique; calibration=uncalibrated_llm_judgment]
  - evidence_grounding：0.5（moderate） — There is emerging evidence for PD-1 on NK cells, but the role of PD-L1 on tumor cells in suppressing NK is debated; general claim not specific. [producer=deepseek/deepseek-chat structured critique; calibration=uncalibrated_llm_judgment]
  - counter_evidence_exposure：0.7（high） — Several studies suggest PD-1 on NK cells may not be the dominant checkpoint; counterevidence is significant. [producer=deepseek/deepseek-chat structured critique; calibration=uncalibrated_llm_judgment]
  - novelty：0.5（moderate） — While PD-1/PD-L1 is well-known in T cells, its application to NK cells is moderately novel. [producer=deepseek/deepseek-chat structured critique; calibration=uncalibrated_llm_judgment]
  - falsifiability：0.9（high） — The decision rule with specific blockade effect and p-values is falsifiable. [producer=deepseek/deepseek-chat structured critique; calibration=uncalibrated_llm_judgment]
  - testability：1（high） — Can be tested with co-culture assays and PD-L1 blockade; testable_now. [producer=deepseek/deepseek-chat structured critique; calibration=uncalibrated_llm_judgment]
  - data_availability：0.9（high） — Reagents (anti-PD-L1 antibodies) are widely available; cell lines and NK cells accessible. [producer=deepseek/deepseek-chat structured critique; calibration=uncalibrated_llm_judgment]
  - methodological_soundness：0.6（moderate） — Potential confounders like ADCC and off-target effects are noted, but design may need careful controls; moderate soundness. [producer=deepseek/deepseek-chat structured critique; calibration=uncalibrated_llm_judgment]
  - expected_information_gain：0.6（moderate） — Could clarify role of PD-1 on NK cells, which is clinically relevant; moderate gain. [producer=deepseek/deepseek-chat structured critique; calibration=uncalibrated_llm_judgment]
  - resource_cost：0.7（moderate） — Moderate cost: antibodies and flow cytometry; not excessively expensive. [producer=deepseek/deepseek-chat structured critique; calibration=uncalibrated_llm_judgment]
  - risk：0.6（low） — Low risk; potential for misleading results due to ADCC, but manageable. [producer=deepseek/deepseek-chat structured critique; calibration=uncalibrated_llm_judgment]
  - uncertainty：0.6（moderate） — High uncertainty given conflicting evidence on PD-1 on NK cells. [producer=deepseek/deepseek-chat structured critique; calibration=uncalibrated_llm_judgment]

### rank 7 / 10 — hyp_1050nyanqxspwemmbtpg5nb5x3

- 总评：Composite 0.6136 = weighted average of valid dimensions (fixed weights evidence_grounding 0.2, falsifiability 0.15, testability 0.1, counter_evidence_exposure 0.15, scientific_plausibility 0.15, novelty 0.1, methodological_soundness 0.15 (+cost/risk 0.05 each when direction-known, renormalized)). Deterministic tie-break on evidence_grounding. Excluded dimensions: none. All dimension scores are uncalibrated LLM judgments produced by deepseek/deepseek-chat structured critique — decision support only.
- 比较说明：Scores are inspectable decision aids, not objective probabilities.
- 各维度评分：
  - scientific_plausibility：0.6（moderate） — Plausible physical barrier effect exists, but direct impact on NK cells is less established; ECM density can hinder immune infiltration. [producer=deepseek/deepseek-chat structured critique; calibration=uncalibrated_llm_judgment]
  - evidence_grounding：0.3（low） — No supporting claims provided; limited direct evidence for physical barrier specifically against NK cells. [producer=deepseek/deepseek-chat structured critique; calibration=uncalibrated_llm_judgment]
  - counter_evidence_exposure：0.5（moderate） — No counterclaims listed, but alternative explanations such as chemokine gradients and soluble factors are strong competitors. [producer=deepseek/deepseek-chat structured critique; calibration=uncalibrated_llm_judgment]
  - novelty：0.8（high） — Considered novel speculation; physical barrier for NK cells is underexplored. [producer=deepseek/deepseek-chat structured critique; calibration=uncalibrated_llm_judgment]
  - falsifiability：0.9（high） — Clear quantitative decision rules for correlation and intervention effects. [producer=deepseek/deepseek-chat structured critique; calibration=uncalibrated_llm_judgment]
  - testability：0.9（high） — Testable using histological analysis, ECM digestion experiments, and 3D culture models. [producer=deepseek/deepseek-chat structured critique; calibration=uncalibrated_llm_judgment]
  - data_availability：0.7（high） — Requires access to tumor samples with ECM characterization and in vivo/in vitro models; somewhat specialized but feasible. [producer=deepseek/deepseek-chat structured critique; calibration=uncalibrated_llm_judgment]
  - methodological_soundness：0.7（moderate） — Solid design but confounders like tumor immunogenicity and CAF-derived soluble factors need careful control. [producer=deepseek/deepseek-chat structured critique; calibration=uncalibrated_llm_judgment]
  - expected_information_gain：0.8（high） — High potential to reveal novel mechanism of immune evasion, could inform new therapeutic strategies. [producer=deepseek/deepseek-chat structured critique; calibration=uncalibrated_llm_judgment]
  - resource_cost：0.5（moderate） — Higher cost due to complex in vivo or 3D models; ECM analysis. Higher_value_is_better because lower cost is preferable. [producer=deepseek/deepseek-chat structured critique; calibration=uncalibrated_llm_judgment]
  - risk：0.7（high） — Higher risk of failure due to lack of direct evidence and many alternative mechanisms. Higher value is worse (more risk). [producer=deepseek/deepseek-chat structured critique; calibration=uncalibrated_llm_judgment]
  - uncertainty：0.7（high） — High uncertainty due to speculative nature and limited prior evidence. [producer=deepseek/deepseek-chat structured critique; calibration=uncalibrated_llm_judgment]

### rank 8 / 10 — hyp_7yhs70ptk5s0vk9g55y427xwk0

- 总评：Composite 0.6091 = weighted average of valid dimensions (fixed weights evidence_grounding 0.2, falsifiability 0.15, testability 0.1, counter_evidence_exposure 0.15, scientific_plausibility 0.15, novelty 0.1, methodological_soundness 0.15 (+cost/risk 0.05 each when direction-known, renormalized)). Deterministic tie-break on evidence_grounding. Excluded dimensions: none. All dimension scores are uncalibrated LLM judgments produced by deepseek/deepseek-chat structured critique — decision support only.
- 比较说明：Scores are inspectable decision aids, not objective probabilities.
- 各维度评分：
  - scientific_plausibility：0.6（moderate） — IL-6 signaling can induce exhaustion-like states in T cells, but its effect on NK cells is less established. The role of CAFs as a source of IL-6 is plausible but not directly supported by the claim. [producer=deepseek/deepseek-chat structured critique; calibration=uncalibrated_llm_judgment]
  - evidence_grounding：0.4（moderate） — The provided claim mentions CAFs as secretors of various molecules, but not specifically IL-6. No direct evidence links IL-6 to NK exhaustion via STAT3. [producer=deepseek/deepseek-chat structured critique; calibration=uncalibrated_llm_judgment]
  - counter_evidence_exposure：0.7（high） — There are potential alternative explanations and confounders listed, but no explicit counterclaims. The hypothesis is exposed to counterevidence from studies showing IL-6 can enhance NK activation in some contexts. [producer=deepseek/deepseek-chat structured critique; calibration=uncalibrated_llm_judgment]
  - novelty：0.5（moderate） — IL-6-induced NK exhaustion is less studied than TGF-β, so there is novelty, but the concept of IL-6 in immune suppression is known. [producer=deepseek/deepseek-chat structured critique; calibration=uncalibrated_llm_judgment]
  - falsifiability：0.8（high） — The decision rule specifies quantitative thresholds for PD-1 upregulation and killing reduction, but the requirement for 3 independent experiments is rigorous. [producer=deepseek/deepseek-chat structured critique; calibration=uncalibrated_llm_judgment]
  - testability：0.8（high） — In vitro IL-6 stimulation and in vivo blockade are feasible with standard assays. [producer=deepseek/deepseek-chat structured critique; calibration=uncalibrated_llm_judgment]
  - data_availability：0.5（moderate） — Reagents for IL-6 and PD-1 are available, but specific data on CAF-derived IL-6 and NK exhaustion are limited. [producer=deepseek/deepseek-chat structured critique; calibration=uncalibrated_llm_judgment]
  - methodological_soundness：0.6（moderate） — The design is sound, but the reliance on in vivo tumor growth as a primary outcome can be confounded by direct effects on tumor cells. The in vitro assays are clear. [producer=deepseek/deepseek-chat structured critique; calibration=uncalibrated_llm_judgment]
  - expected_information_gain：0.5（moderate） — If supported, it would reveal a new mechanism, but the effect may be redundant with other pathways, limiting the gain. [producer=deepseek/deepseek-chat structured critique; calibration=uncalibrated_llm_judgment]
  - resource_cost：0.6（moderate） — In vivo studies increase cost. The high value reflects moderate cost. [producer=deepseek/deepseek-chat structured critique; calibration=uncalibrated_llm_judgment]
  - risk：0.5（moderate） — Risk of failure is moderate due to potential redundancy and confounding. High value means low risk, so 0.5 is moderate risk. [producer=deepseek/deepseek-chat structured critique; calibration=uncalibrated_llm_judgment]
  - uncertainty：0.4（moderate） — The role of IL-6 in NK exhaustion is uncertain, and the specific CAF contribution is speculative. [producer=deepseek/deepseek-chat structured critique; calibration=uncalibrated_llm_judgment]

### rank 9 / 10 — hyp_karqjf8qnqw1ebv9sq131ft9ce

- 总评：Composite 0.5682 = weighted average of valid dimensions (fixed weights evidence_grounding 0.2, falsifiability 0.15, testability 0.1, counter_evidence_exposure 0.15, scientific_plausibility 0.15, novelty 0.1, methodological_soundness 0.15 (+cost/risk 0.05 each when direction-known, renormalized)). Deterministic tie-break on evidence_grounding. Excluded dimensions: none. All dimension scores are uncalibrated LLM judgments produced by deepseek/deepseek-chat structured critique — decision support only.
- 比较说明：Scores are inspectable decision aids, not objective probabilities.
- 各维度评分：
  - scientific_plausibility：0.8（high） — MHC class I downregulation is a well-known mechanism of NK evasion, and the role of KIRs is established. The hypothesis is plausible but the statement that it enables evasion is counterintuitive since MHC-low often enhances NK killing; the hypothesis seems to propose that tumors downregulate MHC to avoid KIR inhibition, which would actually activate NK cells. This suggests a potential misunderstanding. However, some tumors may lose MHC and also lose activating ligands, avoiding both. The hypothesis is plausible but incomplete. [producer=deepseek/deepseek-chat structured critique; calibration=uncalibrated_llm_judgment]
  - evidence_grounding：0.3（low） — No supporting claims provided; the available claim is about CAFs, not MHC. The hypothesis is not grounded in the provided evidence. [producer=deepseek/deepseek-chat structured critique; calibration=uncalibrated_llm_judgment]
  - counter_evidence_exposure：0.5（moderate） — The hypothesis is directly challenged by the 'missing-self' hypothesis, which states that MHC downregulation activates NK cells. Also, the given counterclaim (clm_0a4x55wvq2mjmnnbqagtc9xn5g) is about CAFs, not directly relevant. So moderate exposure. [producer=deepseek/deepseek-chat structured critique; calibration=uncalibrated_llm_judgment]
  - novelty：0.3（low） — The concept of MHC downregulation in tumors is well-known; the novelty is limited unless the specific contribution to NK evasion is framed differently. [producer=deepseek/deepseek-chat structured critique; calibration=uncalibrated_llm_judgment]
  - falsifiability：0.7（high） — The decision rule is somewhat complex, but it is clear. However, the prediction that MHC-low tumors are more resistant seems counterintuitive, so it might be easily disproven. [producer=deepseek/deepseek-chat structured critique; calibration=uncalibrated_llm_judgment]
  - testability：0.8（high） — Experiments with MHC-low and MHC-high cell lines are feasible, and KIR blockade is available. [producer=deepseek/deepseek-chat structured critique; calibration=uncalibrated_llm_judgment]
  - data_availability：0.4（moderate） — Data on MHC expression and NK killing exist, but specific data on the proposed mechanism may not be readily available. [producer=deepseek/deepseek-chat structured critique; calibration=uncalibrated_llm_judgment]
  - methodological_soundness：0.6（moderate） — The design acknowledges confounders like activating ligands, which is good. But the direction of the hypothesis may need revision. [producer=deepseek/deepseek-chat structured critique; calibration=uncalibrated_llm_judgment]
  - expected_information_gain：0.4（moderate） — If supported, it would refine our understanding, but given the known biology, the gain is limited. [producer=deepseek/deepseek-chat structured critique; calibration=uncalibrated_llm_judgment]
  - resource_cost：0.8（high） — Cell lines and antibodies are commercially available; in vitro assays are low cost. [producer=deepseek/deepseek-chat structured critique; calibration=uncalibrated_llm_judgment]
  - risk：0.5（moderate） — The risk of failure is moderate because the hypothesis might be refuted easily; the direction is questionable. High value means low risk, so moderate risk. [producer=deepseek/deepseek-chat structured critique; calibration=uncalibrated_llm_judgment]
  - uncertainty：0.4（moderate） — There is uncertainty about the direction of the effect; the hypothesis might be conceptually flawed. [producer=deepseek/deepseek-chat structured critique; calibration=uncalibrated_llm_judgment]

### rank 10 / 10 — hyp_sjcwbcwp5q9vd5bk8xg8dg3kdt

- 总评：Composite 0.5455 = weighted average of valid dimensions (fixed weights evidence_grounding 0.2, falsifiability 0.15, testability 0.1, counter_evidence_exposure 0.15, scientific_plausibility 0.15, novelty 0.1, methodological_soundness 0.15 (+cost/risk 0.05 each when direction-known, renormalized)). Deterministic tie-break on evidence_grounding. Excluded dimensions: none. All dimension scores are uncalibrated LLM judgments produced by deepseek/deepseek-chat structured critique — decision support only.
- 比较说明：Scores are inspectable decision aids, not objective probabilities.
- 各维度评分：
  - scientific_plausibility：0.4（moderate） — The mechanism is intricate: lactate-induced exosomal miR-183 targeting DAP12. While exosomal miRNAs are plausible, the specificity to DAP12 and the lactate-induction step are speculative. [producer=deepseek/deepseek-chat structured critique; calibration=uncalibrated_llm_judgment]
  - evidence_grounding：0.3（low） — The claim only mentions exosomes as a general mechanism, not lactate/miR-183/DAP12. There is no direct supporting evidence in the available claims. [producer=deepseek/deepseek-chat structured critique; calibration=uncalibrated_llm_judgment]
  - counter_evidence_exposure：0.6（moderate） — Many steps could fail; alternative explanations are listed, but no explicit counterclaims. The hypothesis is exposed to the possibility that other factors are involved. [producer=deepseek/deepseek-chat structured critique; calibration=uncalibrated_llm_judgment]
  - novelty：0.8（high） — The combination of lactate, CAF exosomes, miR-183, and DAP12 is highly specific and likely novel. [producer=deepseek/deepseek-chat structured critique; calibration=uncalibrated_llm_judgment]
  - falsifiability：0.9（high） — The decision rule uses precise thresholds (≤70% for support) and is clearly falsifiable. [producer=deepseek/deepseek-chat structured critique; calibration=uncalibrated_llm_judgment]
  - testability：0.7（high） — Co-culture with lactate-treated CAFs and exosome manipulation are feasible, but exosome purification and miRNA delivery to NK cells are technically demanding. [producer=deepseek/deepseek-chat structured critique; calibration=uncalibrated_llm_judgment]
  - data_availability：0.3（low） — Specific data on miR-183 in CAF exosomes and NK DAP12 are scarce; most bioinformatics tools are needed. [producer=deepseek/deepseek-chat structured critique; calibration=uncalibrated_llm_judgment]
  - methodological_soundness：0.5（moderate） — The design is coherent but has many potential confounders; exosome uptake and miRNA off-target effects could compromise interpretation. [producer=deepseek/deepseek-chat structured critique; calibration=uncalibrated_llm_judgment]
  - expected_information_gain：0.7（high） — If supported, it would reveal a completely new mechanism of NK evasion, which could be highly impactful and novel. [producer=deepseek/deepseek-chat structured critique; calibration=uncalibrated_llm_judgment]
  - resource_cost：0.3（low） — Exosome isolation, miRNA manipulation, and in vivo studies are costly; high value means low cost, but here cost is high. [producer=deepseek/deepseek-chat structured critique; calibration=uncalibrated_llm_judgment]
  - risk：0.7（high） — High risk of failure due to the complex mechanism and many steps that could fail; high value means low risk, so this is high risk. [producer=deepseek/deepseek-chat structured critique; calibration=uncalibrated_llm_judgment]
  - uncertainty：0.3（low） — The uncertainty is high due to the speculative nature and lack of direct evidence. [producer=deepseek/deepseek-chat structured critique; calibration=uncalibrated_llm_judgment]

## 7. 研究计划

- 计划 pln_3ntzhfxe66891w7220gcyeaj3w；objective：Identify and validate mechanisms by which tumor cells evade NK cell recognition, focusing on soluble factor-mediated NK cell dysfunction and ligand modulation, using in vitro assays and literature synthesis.
- 绑定假设：hyp_5q961dp137vb2a5tyt09ndgkfa；hyp_1ktq0px2vycbhwmn682zpbvreh
- 变量：NKG2D surface expression (MFI) on NK cells；NK cell degranulation (CD107a+ %)；NK cell IFN-γ production；MICA/B surface expression on tumor cells (MFI)；HLA-E surface expression on tumor cells (MFI)；NK cell cytotoxicity (specific lysis %)；Tumor-conditioned medium (TCM) presence；Anti-NKG2A/HLA-E blockade
- 对照：NK cells cultured in control medium (no TCM)；Tumor cells with high MICA/B and low HLA-E (for comparison)；Isotype control antibodies for blockade experiments；K562 target cells for NK cell functional assays
- 纳入标准：Studies reporting NK cell receptor expression or function in tumor microenvironment；Studies on soluble factors (cytokines, exosomes) from tumor or CAFs affecting NK cells；Studies on MICA/B or HLA-E expression on tumor cells and NK cell activity；In vitro or ex vivo experiments with primary NK cells or NK cell lines；Peer-reviewed articles in English
- 排除标准：Studies focusing solely on other immune cells (e.g., T cells) without NK cell data；Case reports or small case series；Non-peer-reviewed preprints or conference abstracts；Studies with insufficient methodological detail (e.g., no quantitative data)
- 数据需求：
  - Flow cytometry data for NKG2D expression and NK cell function（availability=must_collect，sourceHint=Primary NK cells from healthy donors, flow cytometry）：variables=NKG2D MFI、CD107a+ %、IFN-γ+ %
  - Tumor cell surface ligand expression data（availability=must_collect，sourceHint=Tumor cell lines (e.g., K562, HeLa) stained with specific antibodies）：variables=MICA/B MFI、HLA-E MFI
  - NK cell cytotoxicity assay data（availability=must_collect，sourceHint=Standard 4h 51Cr-release or LDH-release assay）：variables=specific lysis % at E:T ratios
  - Literature data on soluble factors and NK cell modulation（availability=public，sourceHint=PubMed, Web of Science）：variables=cytokine concentrations、exosome effects、receptor expression changes
- 工具需求：
  - Flow cytometer（instrument）：Measure surface receptor expression and intracellular cytokines
  - Cell culture facility（instrument）：Culture NK cells, tumor cell lines, and prepare conditioned medium
  - Cytotoxicity assay equipment (e.g., plate reader for LDH)（instrument）：Quantify NK cell killing
  - Statistical software (e.g., R, GraphPad Prism)（software）：Data analysis and visualization
  - Literature database access（software）：Systematic review and data extraction
- 步骤：
  1. Systematic literature review on NK cell evasion mechanisms（literature）
     - method：Search PubMed and Web of Science using keywords: 'NK cell evasion', 'tumor microenvironment', 'soluble factors', 'NKG2D', 'MICA/B', 'HLA-E', 'CAF'. Screen titles/abstracts against inclusion/exclusion criteria. Extract data on mechanisms, effect sizes, and experimental models. Summarize findings in a structured table.
     - inputs：evidenceBase；hypotheses；outputs：synthesized evidence；gap analysis
     - failureConditions：No relevant studies found；Insufficient quantitative data for meta-analysis
     - 预估成本：0 USD (time only)
  2. In vitro assay: Effect of tumor-conditioned medium on NK cell function（experiment）
     - method：Isolate primary NK cells from healthy donor buffy coats (n=3 donors). Culture tumor cell lines (e.g., CAF-rich co-cultures) to generate TCM. Incubate NK cells with TCM or control medium for 24h. Measure NKG2D surface expression by flow cytometry. Assess degranulation (CD107a) and IFN-γ production after stimulation with K562 cells. Compare TCM vs control using paired t-test.
     - inputs：NK cells；tumor cell lines；TCM；outputs：NKG2D MFI；CD107a+ %；IFN-γ+ %
     - failureConditions：NK cell viability <80%；Flow cytometry acquisition issues；High donor variability (CV>30%)
     - dependsOn：task_9qdcpfmfcb66r8m7t8rqedeadr
     - 预估成本：5000 USD
  3. In vitro assay: Ligand modulation and NK cell cytotoxicity（experiment）
     - method：Select or engineer tumor cell lines with high MICA/B/low HLA-E and low MICA/B/high HLA-E. Confirm expression by flow cytometry. Perform 4h cytotoxicity assay with primary NK cells at E:T ratios 1:1, 5:1, 10:1. In separate experiments, block NKG2A or HLA-E with antibodies and measure lysis. Compare lysis between cell lines and with/without blockade using ANOVA.
     - inputs：tumor cell lines with varying MICA/B and HLA-E；NK cells；outputs：MICA/B MFI；HLA-E MFI；specific lysis %
     - failureConditions：Insufficient NK cell yield；Antibody blockade ineffective (no change in lysis)；High background lysis (>20%)
     - dependsOn：task_9qdcpfmfcb66r8m7t8rqedeadr
     - 预估成本：8000 USD
  4. Data analysis and integration（data_analysis）
     - method：Compile all quantitative data. Perform statistical tests (paired t-test, ANOVA, linear regression) to assess significance. Calculate effect sizes (Cohen's d) and 95% CIs. Integrate findings with literature to propose a mechanistic model. Use sensitivity analysis to test robustness.
     - inputs：task_q6x1k9zkj5qw39w73x6s9vmwfv；task_c8kz5r0ccddehe3gr9jvnpf8es；literature data；outputs：effect sizes；confidence intervals；mechanistic model
     - failureConditions：Data not normally distributed；Missing data points；Conflicting results between experiments
     - dependsOn：task_q6x1k9zkj5qw39w73x6s9vmwfv、task_c8kz5r0ccddehe3gr9jvnpf8es
     - 预估成本：0 USD (time only)
- 指标：Mean NKG2D MFI ratio (TCM/control)；CD107a+ NK cell percentage difference (TCM vs control)；IFN-γ+ NK cell percentage difference (TCM vs control)；Specific lysis difference between high and low ligand tumor cells at E:T 10:1；Increase in specific lysis upon NKG2A/HLA-E blockade (percentage points)
- 统计方法：Paired t-test for TCM effects；ANOVA with post-hoc Tukey for cytotoxicity comparisons；Effect size (Cohen's d)；95% confidence intervals
- 判定规则（decisionRules）：
  - 成功判据：Both hypotheses supported: (1) NKG2D MFI <70% of control AND CD107a+ <50% of control in TCM-treated NK cells; (2) specific lysis of low MICA/B/high HLA-E cells is ≥30% lower than high MICA/B/low HLA-E cells, and blockade increases lysis by ≥20%.
  - 弱化判据：Partial support: (1) NKG2D MFI 70-90% of control OR CD107a+ 50-80% of control; (2) lysis difference 10-30% or blockade effect 10-20%.
  - 证伪判据：Hypothesis 1 refuted if NKG2D MFI ≥90% of control AND CD107a+ ≥80% of control. Hypothesis 2 refuted if lysis of low MICA/B/high HLA-E cells is ≥30% higher than high MICA/B/low HLA-E cells, or blockade reduces lysis by ≥20%.
  - 判停判据：Stop if both hypotheses are refuted, or if after 3 independent experiments no consistent effect is observed (p>0.05 in all), or if resource limits are reached (e.g., budget exhausted).
- 混杂因素：Donor variability in NK cell function；Tumor cell line heterogeneity；Serum components in culture medium；Time of incubation；Passage number of cell lines
- 备择解释：NK cell dysfunction due to direct cell-cell contact rather than soluble factors；Other soluble factors (e.g., IL-10, TGF-β) not measured；Epigenetic changes in tumor cells affecting ligand expression；NK cell education and licensing effects
- 资源：compute=Standard laboratory computer for data analysis；cost=13000 USD (stipulated estimate)；time=6 months (stipulated estimate)
- 风险：Low NK cell yield from donors；High variability in flow cytometry measurements；Antibody blockade may not be complete；In vitro results may not translate to in vivo；Literature search may miss relevant studies；Model-stipulated thresholds (70%, 50%, 30%, 20%) may not be biologically meaningful
- 伦理：Use of human primary NK cells requires informed consent and IRB approval；All cell lines must be authenticated and mycoplasma-free；No animal experiments planned
- 前置条件：IRB approval for blood draws；Access to healthy donor buffy coats；Tumor cell lines with defined MICA/B and HLA-E expression；Antibodies for flow cytometry and blockade；Funding for consumables
- 预期信息增益：High: will provide direct evidence for two major mechanisms of NK cell evasion, potentially identifying therapeutic targets.
- 备选分支：If soluble factor hypothesis is weakened, investigate exosome-mediated mechanisms specifically；If ligand modulation hypothesis is weakened, explore other inhibitory ligands (e.g., PD-L1)；If both hypotheses are refuted, consider contact-dependent mechanisms or metabolic factors
- 可复现性要求：Detailed protocols for cell isolation, culture, and assays；Use of multiple donors and cell lines；Blinded analysis of flow cytometry data；Deposit raw data in public repository；Report effect sizes and confidence intervals
- 引用证据声明：clm_0a4x55wvq2mjmnnbqagtc9xn5g
- executabilityCheck：通过

**证据上限声明**：本计划基于 7 篇来源（5 篇摘要级/2 篇元数据级）生成；计划中的资源规模、样本量与量化阈值为模型拟定值，其证据支撑度见各假设的 decisionRuleProvenance 标注。

（注：摘要级 = contentDepth 为 abstract/full_text/data 的来源；元数据级 = metadata_only，未参与声明提取。）

## 8. 不确定性与未决问题

- 声明 clm_0a4x55wvq2mjmnnbqagtc9xn5g：The claim is general and does not specifically mention NK cells, but it implies immune evasion mechanisms that could include NK cell evasion.
- 假设 hyp_abre45rkeqdk52bc23ajrr9c50：The magnitude of TGF-β secretion by CAFs relative to other sources is unknown.
- 假设 hyp_abre45rkeqdk52bc23ajrr9c50：The relative contribution of NKG2D downregulation vs. other TGF-β effects on NK cells (e.g., impaired cytokine production, apoptosis) is not specified.
- 假设 hyp_abre45rkeqdk52bc23ajrr9c50：In vivo relevance is uncertain; in vitro co-culture may not recapitulate the complex tumor microenvironment.
- 假设 hyp_abre45rkeqdk52bc23ajrr9c50：Thresholds for rescue (0.5 D) are arbitrary and not derived from prior data; different thresholds might alter conclusions.
- 假设 hyp_abre45rkeqdk52bc23ajrr9c50：assumption critique (unattached, index out of range): TGF-β downregulation of NKG2D is documented in many contexts, but it may be indirect (e.g., through downregulation of IL-15 or other cytokines) or may require additional signals (e.g., chronic stimulation). Also, other receptors may be differentially affected; thus, NKG2D is a limited proxy for overall NK activation.
- 假设 hyp_7yhs70ptk5s0vk9g55y427xwk0：Exact IL-6 concentrations in the tumor microenvironment produced by CAFs relative to other cells are unknown.
- 假设 hyp_7yhs70ptk5s0vk9g55y427xwk0：The time course of IL-6-induced exhaustion and the stability of PD-1 upregulation are not specified.
- 假设 hyp_7yhs70ptk5s0vk9g55y427xwk0：Whether STAT3 inhibition alone can reverse NK exhaustion is uncertain.
- 假设 hyp_7yhs70ptk5s0vk9g55y427xwk0：The in vivo contribution of CAF-derived IL-6 vs. systemic IL-6 is unclear.
- 假设 hyp_sjcwbcwp5q9vd5bk8xg8dg3kdt：Exact lactate threshold for CAF response is unknown
- 假设 hyp_sjcwbcwp5q9vd5bk8xg8dg3kdt：In vivo relevance of in vitro lactate concentrations
- 假设 hyp_sjcwbcwp5q9vd5bk8xg8dg3kdt：NK cell subset heterogeneity (e.g., CD56bright vs dim) may respond differentially
- 假设 hyp_sjcwbcwp5q9vd5bk8xg8dg3kdt：Stability of exosomal miR-183 and functional transfer to NK cells is unverified
- 假设 hyp_karqjf8qnqw1ebv9sq131ft9ce：The relative contribution of KIR-mediated inhibition versus other inhibitory receptors (e.g., NKG2A) to NK evasion is uncertain.
- 假设 hyp_karqjf8qnqw1ebv9sq131ft9ce：The threshold of MHC I downregulation needed to significantly affect KIR engagement is unknown.
- 假设 hyp_karqjf8qnqw1ebv9sq131ft9ce：In vivo relevance of the in vitro predictions is uncertain due to tumor heterogeneity and microenvironmental factors.
- 假设 hyp_2bkgsvqdgt2hbsjjpat003ff1g：The minimum clinically relevant effect size for NK lysis is not established; my chosen thresholds (30%, 2-fold) are arbitrary.
- 假设 hyp_2bkgsvqdgt2hbsjjpat003ff1g：In vivo the TME includes many inhibitory signals; the in vitro assay may not capture the full complexity.
- 假设 hyp_2bkgsvqdgt2hbsjjpat003ff1g：HLA-G expression may be transient or regulated by hypoxia, cytokines, etc., affecting reproducibility.
- 假设 hyp_2bkgsvqdgt2hbsjjpat003ff1g：The choice of NK cell donors and E:T ratios could influence outcomes unpredictably.
- 假设 hyp_1v02sv7y7xq8xzadhz8bf0c3f6：The exact threshold for biologically active sMICA concentration is unknown.
- 假设 hyp_1v02sv7y7xq8xzadhz8bf0c3f6：The degree of NKG2D downregulation required for functional impairment is not established.
- 假设 hyp_1v02sv7y7xq8xzadhz8bf0c3f6：Potential differential effects of MICA vs MICB vs other ligands (ULBPs).
- 假设 hyp_838qmp1edf5nx4rszyrzh7nq7e：The threshold of 10% increase in lysis is arbitrary and may not reflect biological significance in all experimental setups.
- 假设 hyp_838qmp1edf5nx4rszyrzh7nq7e：The in vitro co-culture may not fully replicate the complex TME in vivo, and PD-L1 effects could be context-dependent.
- 假设 hyp_838qmp1edf5nx4rszyrzh7nq7e：NK cell PD-1 expression may require particular cytokine stimulation (e.g., IL-2, IL-15) that is not standardized across studies.
- 假设 hyp_838qmp1edf5nx4rszyrzh7nq7e：assumption critique (unattached, index out of range): Sustained PD-1 expression on tumor-infiltrating NK cells is speculative; PD-1 can be downregulated upon receptor engagement or in certain activation states, and the tumor microenvironment is dynamic. This assumption may not hold in all patients or tumor types.
- 假设 hyp_1ktq0px2vycbhwmn682zpbvreh：The exact thresholds (30%, 20%) are arbitrary and may not be biologically meaningful; they could vary with assay conditions.
- 假设 hyp_1ktq0px2vycbhwmn682zpbvreh：NK cell cytotoxicity is highly donor-dependent; the number of donors needed to achieve statistical power is uncertain.
- 假设 hyp_1ktq0px2vycbhwmn682zpbvreh：The in vitro system may not replicate the complex interactions in the tumor microenvironment.
- 假设 hyp_5q961dp137vb2a5tyt09ndgkfa：The threshold values (70%, 50%, etc.) are arbitrary; actual biologically significant effect sizes may vary.
- 假设 hyp_5q961dp137vb2a5tyt09ndgkfa：The in vitro system may not capture the full complexity of the TME, including hypoxia, extracellular matrix, and immune cell interactions.
- 假设 hyp_5q961dp137vb2a5tyt09ndgkfa：The specific factor(s) responsible for the effect are not isolated; blocking only TGF-β may not reverse the effect if multiple factors are involved.
- 假设 hyp_1050nyanqxspwemmbtpg5nb5x3：The threshold values (correlation -0.5, 50% effect) are arbitrary; no prior evidence base is provided.
- 假设 hyp_1050nyanqxspwemmbtpg5nb5x3：The relative contribution of physical barrier vs. soluble factors is unknown.
- 假设 hyp_1050nyanqxspwemmbtpg5nb5x3：The role of other immune cells (macrophages, Tregs) in modulating NK infiltration is not controlled.
- 假设 hyp_1050nyanqxspwemmbtpg5nb5x3：Human tumor heterogeneity may make cross-patient correlations weak.

## 9. 溯源（Provenance）摘要

- provenance receipts：40 条（统计截至报告渲染时，不含本次导出动作自身的 export receipt）

## 10. 反馈与修订（因果链）

本 run 尚无反馈信号（feedback channel 未使用或未触发修订）。

- 模型调用：27 次
- executionMode 全部为 live：是
- 缺失项：无已知缺失项
