import os
from reportlab.lib.pagesizes import A4, landscape
from reportlab.lib import colors
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.units import cm
from reportlab.platypus import (SimpleDocTemplate, Table, TableStyle,
                                  Paragraph, Spacer, HRFlowable)
from reportlab.lib.enums import TA_CENTER, TA_LEFT

# ── RAW DATA from PDF ────────────────────────────────────────────────────────
# (institute_code, institute_name, place, is_women_college, branch_code, branch_name, bc_d_girls_last_rank)
# Women colleges identified by College_Type = GIRLS or "FOR WOMEN" in name

RAW = [
    # Women colleges (GIRLS type or "FOR WOMEN" in name)
    ("BREW", "BHOJREDDY ENGINEERING COLLEGE FOR WOMEN", "SAIDABAD, HYD", True, "CSE", "Computer Science and Engineering", 21173),
    ("BREW", "BHOJREDDY ENGINEERING COLLEGE FOR WOMEN", "SAIDABAD, HYD", True, "CSM", "CSE (AI and Machine Learning)", 21755),
    ("BVRW", "BVRIT COLLEGE OF ENGINEERING FOR WOMEN (AUTONOMOUS)", "BACHUPALLY, MDL", True, "CSE", "Computer Science and Engineering", 11999),
    ("BVRW", "BVRIT COLLEGE OF ENGINEERING FOR WOMEN (AUTONOMOUS)", "BACHUPALLY, MDL", True, "CSM", "CSE (AI and Machine Learning)", 11140),
    ("GNTW", "G NARAYNAMMA INSTITUTE OF TECHNOLOGY AND SCI", "SHAIKPET, HYD", True, "CSD", "CSE (Data Science)", 7871),
    ("GNTW", "G NARAYNAMMA INSTITUTE OF TECHNOLOGY AND SCI", "SHAIKPET, HYD", True, "CSE", "Computer Science and Engineering", 6693),
    ("GNTW", "G NARAYNAMMA INSTITUTE OF TECHNOLOGY AND SCI", "SHAIKPET, HYD", True, "CSM", "CSE (AI and Machine Learning)", 7256),
    ("GLWC", "GOKARAJU LAILAVATHI ENGINEERING COLLEGE", "BACHUPALLY, MDL", False, "CSE", "Computer Science and Engineering", 27400),
    ("GLWC", "GOKARAJU LAILAVATHI ENGINEERING COLLEGE", "BACHUPALLY, MDL", False, "CSM", "CSE (AI and Machine Learning)", 27852),
    ("KITW", "KAKATIYA INST OF TECHNOLOGY SCI FOR WOMEN", "NIZAMABAD, NZB", True, "CSE", "Computer Science and Engineering", 72879),
    ("KDDW", "KODADA INST OF TECHNOLOGY AND SCIENCE FOR WOMEN", "KODADA, SRP", True, "CSE", "Computer Science and Engineering", 141107),
    ("KUEWSF", "UNIV COLLEGE OF ENGG & TECH FOR WOMEN KU CAMPUS", "WARANGAL, HNK", True, "CSD", "CSE (Data Science)", 68721),
    ("KUEWSF", "UNIV COLLEGE OF ENGG & TECH FOR WOMEN KU CAMPUS", "WARANGAL, HNK", True, "CSE", "Computer Science and Engineering", 48392),
    ("KUEWSF", "UNIV COLLEGE OF ENGG & TECH FOR WOMEN KU CAMPUS", "WARANGAL, HNK", True, "CSM", "CSE (AI and Machine Learning)", 58727),
    ("MGHA", "MEGHA INST OF ENGG AND TECHNOLOGY FOR WOMEN (AUTONOMOUS)", "GHATKESAR, MDL", True, "CSE", "Computer Science and Engineering", 71494),
    ("MGHA", "MEGHA INST OF ENGG AND TECHNOLOGY FOR WOMEN (AUTONOMOUS)", "GHATKESAR, MDL", True, "CSI", "CSE and Information Technology", 99299),
    ("MINA", "MINA INST OF ENGG AND TECHNOLOGY FOR WOMEN", "MIRYALAGUDA, NLG", True, "CSE", "Computer Science and Engineering", 135403),
    ("MINA", "MINA INST OF ENGG AND TECHNOLOGY FOR WOMEN", "MIRYALAGUDA, NLG", True, "CSM", "CSE (AI and Machine Learning)", 134032),
    ("MRCW", "MALLA REDDY ENGG COLLEGE FOR WOMEN (AUTONOMOUS)", "MAISAMMAGUDA, MDL", True, "CSC", "CSE (Cyber Security)", 43023),
    ("MRCW", "MALLA REDDY ENGG COLLEGE FOR WOMEN (AUTONOMOUS)", "MAISAMMAGUDA, MDL", True, "CSD", "CSE (Data Science)", 44519),
    ("MRCW", "MALLA REDDY ENGG COLLEGE FOR WOMEN (AUTONOMOUS)", "MAISAMMAGUDA, MDL", True, "CSE", "Computer Science and Engineering", 41727),
    ("MRCW", "MALLA REDDY ENGG COLLEGE FOR WOMEN (AUTONOMOUS)", "MAISAMMAGUDA, MDL", True, "CSM", "CSE (AI and Machine Learning)", 40543),
    ("PETW", "PRINCETON INST OF ENGG TECH FOR WOMEN", "GHATKESAR, MDL", True, "CSD", "CSE (Data Science)", 116780),
    ("PETW", "PRINCETON INST OF ENGG TECH FOR WOMEN", "GHATKESAR, MDL", True, "CSE", "Computer Science and Engineering", 106003),
    ("PETW", "PRINCETON INST OF ENGG TECH FOR WOMEN", "GHATKESAR, MDL", True, "CSM", "CSE (AI and Machine Learning)", 114876),
    ("PRIW", "PRIYADARSHINI INSTITUTE OF SCI & TECH FOR WOMEN", "KHAMMAM, KHM", True, "CSE", "Computer Science and Engineering", 112518),
    ("PRIW", "PRIYADARSHINI INSTITUTE OF SCI & TECH FOR WOMEN", "KHAMMAM, KHM", True, "CSM", "CSE (AI and Machine Learning)", 95359),
    ("RITW", "RISHI MS INST OF ENGG AND TECH FOR WOMEN", "KUKATPALLY, MDL", True, "CSE", "Computer Science and Engineering", 88167),
    ("SDEW", "SRIDEVI WOMENS ENGINEERING COLLEGE (AUTONOMOUS)", "GANDIPET, RR", True, "CSD", "CSE (Data Science)", 50715),
    ("SDEW", "SRIDEVI WOMENS ENGINEERING COLLEGE (AUTONOMOUS)", "GANDIPET, RR", True, "CSE", "Computer Science and Engineering", 53845),
    ("SDEW", "SRIDEVI WOMENS ENGINEERING COLLEGE (AUTONOMOUS)", "GANDIPET, RR", True, "CSM", "CSE (AI and Machine Learning)", 55358),
    ("SRIW", "SUMATHI REDDY INST OF TECHNOLOGY FOR WOMEN", "HASANPARTHY, HNK", True, "CSC", "CSE (Cyber Security)", 76074),
    ("SRIW", "SUMATHI REDDY INST OF TECHNOLOGY FOR WOMEN", "HASANPARTHY, HNK", True, "CSD", "CSE (Data Science)", 73441),
    ("SRIW", "SUMATHI REDDY INST OF TECHNOLOGY FOR WOMEN", "HASANPARTHY, HNK", True, "CSE", "Computer Science and Engineering", 60234),
    ("SRIW", "SUMATHI REDDY INST OF TECHNOLOGY FOR WOMEN", "HASANPARTHY, HNK", True, "CSM", "CSE (AI and Machine Learning)", 60614),
    ("STLW", "STANLEY COLLEGE OF ENGG AND TECH FOR WOMEN (AUTONOMOUS)", "ABIDS, HYD", True, "CME", "Computer Engineering", 66324),
    ("STLW", "STANLEY COLLEGE OF ENGG AND TECH FOR WOMEN (AUTONOMOUS)", "ABIDS, HYD", True, "CSE", "Computer Science and Engineering", 45029),
    ("STLW", "STANLEY COLLEGE OF ENGG AND TECH FOR WOMEN (AUTONOMOUS)", "ABIDS, HYD", True, "CSM", "CSE (AI and Machine Learning)", 46415),
    ("VMTW", "VIGNANS INST OF MANAGEMENT AND TECH FOR WOMEN (AUTONOMOUS)", "GHATKESAR, MDL", True, "CSD", "CSE (Data Science)", 54861),
    ("VMTW", "VIGNANS INST OF MANAGEMENT AND TECH FOR WOMEN (AUTONOMOUS)", "GHATKESAR, MDL", True, "CSE", "Computer Science and Engineering", 65654),
    ("VMTW", "VIGNANS INST OF MANAGEMENT AND TECH FOR WOMEN (AUTONOMOUS)", "GHATKESAR, MDL", True, "CSM", "CSE (AI and Machine Learning)", 65948),

    # Co-ed colleges – CSE branches
    ("JNTH", "JNTUH UNIV COLLEGE OF ENGG SCI AND TECH HYDERABAD", "HYDERABAD, MDL", False, "CSC", "CSE (Cyber Security)", 3313),
    ("JNTH", "JNTUH UNIV COLLEGE OF ENGG SCI AND TECH HYDERABAD", "HYDERABAD, MDL", False, "CSE", "Computer Science and Engineering", 2147),
    ("JNTH", "JNTUH UNIV COLLEGE OF ENGG SCI AND TECH HYDERABAD", "HYDERABAD, MDL", False, "CSM", "CSE (AI and Machine Learning)", 1869),
    ("OUCE", "O U COLLEGE OF ENGG HYDERABAD", "HYDERABAD, HYD", False, "CSE", "Computer Science and Engineering", 2799),
    ("VASV", "VASAVI COLLEGE OF ENGINEERING", "HYDERABAD, HYD", False, "CSE", "Computer Science and Engineering", 2858),
    ("VASV", "VASAVI COLLEGE OF ENGINEERING", "HYDERABAD, HYD", False, "CSM", "CSE (AI and Machine Learning)", 3185),
    ("CBIT", "CHAITANYA BHARATHI INSTITUTE OF TECHNOLOGY", "GANDIPET, RR", False, "CIC", "CSE (IoT and Cyber Security incl. Block Chain)", 4116),
    ("CBIT", "CHAITANYA BHARATHI INSTITUTE OF TECHNOLOGY", "GANDIPET, RR", False, "CSE", "Computer Science and Engineering", 3046),
    ("CBIT", "CHAITANYA BHARATHI INSTITUTE OF TECHNOLOGY", "GANDIPET, RR", False, "CSM", "CSE (AI and Machine Learning)", 2953),
    ("VJEC", "V N R VIGNANA JYOTHI INSTITUTE OF ENGG AND TECH", "BACHUPALLY, MDL", False, "AID", "AI and Data Science", 3256),
    ("VJEC", "V N R VIGNANA JYOTHI INSTITUTE OF ENGG AND TECH", "BACHUPALLY, MDL", False, "CSB", "CSE (Business Systems)", 4833),
    ("VJEC", "V N R VIGNANA JYOTHI INSTITUTE OF ENGG AND TECH", "BACHUPALLY, MDL", False, "CSC", "CSE (Cyber Security)", 3526),
    ("VJEC", "V N R VIGNANA JYOTHI INSTITUTE OF ENGG AND TECH", "BACHUPALLY, MDL", False, "CSD", "CSE (Data Science)", 2902),
    ("VJEC", "V N R VIGNANA JYOTHI INSTITUTE OF ENGG AND TECH", "BACHUPALLY, MDL", False, "CSE", "Computer Science and Engineering", 1846),
    ("VJEC", "V N R VIGNANA JYOTHI INSTITUTE OF ENGG AND TECH", "BACHUPALLY, MDL", False, "CSM", "CSE (AI and Machine Learning)", 2387),
    ("VJEC", "V N R VIGNANA JYOTHI INSTITUTE OF ENGG AND TECH", "BACHUPALLY, MDL", False, "CSO", "CSE (IoT)", 4408),
    ("GRRR", "GOKARAJU RANGARAJU INST OF ENGG AND TECH (AUTONOMOUS)", "BACHUPALLY, MDL", False, "CSB", "CSE (Business Systems)", 9491),
    ("GRRR", "GOKARAJU RANGARAJU INST OF ENGG AND TECH (AUTONOMOUS)", "BACHUPALLY, MDL", False, "CSD", "CSE (Data Science)", 7560),
    ("GRRR", "GOKARAJU RANGARAJU INST OF ENGG AND TECH (AUTONOMOUS)", "BACHUPALLY, MDL", False, "CSE", "Computer Science and Engineering", 5272),
    ("GRRR", "GOKARAJU RANGARAJU INST OF ENGG AND TECH (AUTONOMOUS)", "BACHUPALLY, MDL", False, "CSM", "CSE (AI and Machine Learning)", 6662),
    ("BVRI", "B V RAJU INSTITUTE OF TECHNOLOGY", "NARSAPUR, MED", False, "CSB", "CSE (Business Systems)", 12846),
    ("BVRI", "B V RAJU INSTITUTE OF TECHNOLOGY", "NARSAPUR, MED", False, "CSD", "CSE (Data Science)", 11075),
    ("BVRI", "B V RAJU INSTITUTE OF TECHNOLOGY", "NARSAPUR, MED", False, "CSE", "Computer Science and Engineering", 9996),
    ("BVRI", "B V RAJU INSTITUTE OF TECHNOLOGY", "NARSAPUR, MED", False, "CSM", "CSE (AI and Machine Learning)", 10292),
    ("KMIT", "KESHAV MEMORIAL INST OF TECHNOLOGY", "NARAYANAGUDA, HYD", False, "CSE", "Computer Science and Engineering", 6927),
    ("KMIT", "KESHAV MEMORIAL INST OF TECHNOLOGY", "NARAYANAGUDA, HYD", False, "CSM", "CSE (AI and Machine Learning)", 7970),
    ("MVSR", "M V S R ENGINEERING COLLEGE (AUTONOMOUS)", "NADERGUL, RR", False, "CSD", "CSE (Data Science)", 14163),
    ("MVSR", "M V S R ENGINEERING COLLEGE (AUTONOMOUS)", "NADERGUL, RR", False, "CSE", "Computer Science and Engineering", 13329),
    ("MVSR", "M V S R ENGINEERING COLLEGE (AUTONOMOUS)", "NADERGUL, RR", False, "CSI", "CSE and Information Technology", 15087),
    ("MVSR", "M V S R ENGINEERING COLLEGE (AUTONOMOUS)", "NADERGUL, RR", False, "CSM", "CSE (AI and Machine Learning)", 12493),
    ("NGIT", "NEIL GOGTE INST OF TECHNOLOGY", "KACHIVANI SINGARAM, MDL", False, "CSE", "Computer Science and Engineering", 16268),
    ("NGIT", "NEIL GOGTE INST OF TECHNOLOGY", "KACHIVANI SINGARAM, MDL", False, "CSM", "CSE (AI and Machine Learning)", 16440),
    ("IARE", "INSTITUTE OF AERONAUTICAL ENGINEERING", "DUNDIGAL, MDL", False, "CSD", "CSE (Data Science)", 15695),
    ("IARE", "INSTITUTE OF AERONAUTICAL ENGINEERING", "DUNDIGAL, MDL", False, "CSE", "Computer Science and Engineering", 16056),
    ("IARE", "INSTITUTE OF AERONAUTICAL ENGINEERING", "DUNDIGAL, MDL", False, "CSM", "CSE (AI and Machine Learning)", 16232),
    ("ANUG", "ANURAG UNIVERSITY (FORMERLY ANURAG GRP OF INSTNS)", "GHATKESAR, MDL", False, "AI", "Artificial Intelligence", 16213),
    ("ANUG", "ANURAG UNIVERSITY (FORMERLY ANURAG GRP OF INSTNS)", "GHATKESAR, MDL", False, "CSE", "Computer Science and Engineering", 15501),
    ("CVRH", "CVR COLLEGE OF ENGINEERING", "IBRAHIMPATAN, RR", False, "CSB", "CSE (Business Systems)", 11404),
    ("CVRH", "CVR COLLEGE OF ENGINEERING", "IBRAHIMPATAN, RR", False, "CSC", "CSE (Cyber Security)", 11011),
    ("CVRH", "CVR COLLEGE OF ENGINEERING", "IBRAHIMPATAN, RR", False, "CSD", "CSE (Data Science)", 9870),
    ("CVRH", "CVR COLLEGE OF ENGINEERING", "IBRAHIMPATAN, RR", False, "CSE", "Computer Science and Engineering", 8904),
    ("CVRH", "CVR COLLEGE OF ENGINEERING", "IBRAHIMPATAN, RR", False, "CSM", "CSE (AI and Machine Learning)", 9201),
    ("MGIT", "MAHATMA GANDHI INSTITUTE OF TECHNOLOGY (AUTONOMOUS)", "GANDIPET, RR", False, "CSB", "CSE (Business Systems)", 12149),
    ("MGIT", "MAHATMA GANDHI INSTITUTE OF TECHNOLOGY (AUTONOMOUS)", "GANDIPET, RR", False, "CSD", "CSE (Data Science)", 10163),
    ("MGIT", "MAHATMA GANDHI INSTITUTE OF TECHNOLOGY (AUTONOMOUS)", "GANDIPET, RR", False, "CSE", "Computer Science and Engineering", 9093),
    ("MGIT", "MAHATMA GANDHI INSTITUTE OF TECHNOLOGY (AUTONOMOUS)", "GANDIPET, RR", False, "CSM", "CSE (AI and Machine Learning)", 9400),
    ("GCTC", "GEETANJALI COLLEGE OF ENGG AND TECHNOLOGY (AUTONOMOUS)", "KEESARA, MDL", False, "CSC", "CSE (Cyber Security)", 22658),
    ("GCTC", "GEETANJALI COLLEGE OF ENGG AND TECHNOLOGY (AUTONOMOUS)", "KEESARA, MDL", False, "CSD", "CSE (Data Science)", 20394),
    ("GCTC", "GEETANJALI COLLEGE OF ENGG AND TECHNOLOGY (AUTONOMOUS)", "KEESARA, MDL", False, "CSE", "Computer Science and Engineering", 18093),
    ("GCTC", "GEETANJALI COLLEGE OF ENGG AND TECHNOLOGY (AUTONOMOUS)", "KEESARA, MDL", False, "CSM", "CSE (AI and Machine Learning)", 19149),
    ("JNTS", "JNTUH UNIV COLLEGE OF ENGINEERING SULTANPUR", "SULTANPUR, SRD", False, "CSC", "CSE (Cyber Security)", 22465),
    ("JNTS", "JNTUH UNIV COLLEGE OF ENGINEERING SULTANPUR", "SULTANPUR, SRD", False, "CSE", "Computer Science and Engineering", 17036),
    ("JNTS", "JNTUH UNIV COLLEGE OF ENGINEERING SULTANPUR", "SULTANPUR, SRD", False, "CSM", "CSE (AI and Machine Learning)", 17329),
    ("GNIT", "GURUNANAK INST OF TECHNOLOGY (AUTONOMOUS)", "IBRAHIMPATAN, RR", False, "CSC", "CSE (Cyber Security)", 25534),
    ("GNIT", "GURUNANAK INST OF TECHNOLOGY (AUTONOMOUS)", "IBRAHIMPATAN, RR", False, "CSE", "Computer Science and Engineering", 22278),
    ("GNIT", "GURUNANAK INST OF TECHNOLOGY (AUTONOMOUS)", "IBRAHIMPATAN, RR", False, "CSM", "CSE (AI and Machine Learning)", 24218),
    ("MLID", "M L R INSTITUTE OF TECHNOLOGY (AUTONOMOUS)", "DUNDIGAL, MDL", False, "CSD", "CSE (Data Science)", 25803),
    ("MLID", "M L R INSTITUTE OF TECHNOLOGY (AUTONOMOUS)", "DUNDIGAL, MDL", False, "CSE", "Computer Science and Engineering", 24005),
    ("MLID", "M L R INSTITUTE OF TECHNOLOGY (AUTONOMOUS)", "DUNDIGAL, MDL", False, "CSM", "CSE (AI and Machine Learning)", 23513),
    ("CMRK", "C M R COLLEGE OF ENGG AND TECHNOLOGY", "KANDLAKOYA, MDL", False, "CSD", "CSE (Data Science)", 20661),
    ("CMRK", "C M R COLLEGE OF ENGG AND TECHNOLOGY", "KANDLAKOYA, MDL", False, "CSE", "Computer Science and Engineering", 18878),
    ("CMRK", "C M R COLLEGE OF ENGG AND TECHNOLOGY", "KANDLAKOYA, MDL", False, "CSM", "CSE (AI and Machine Learning)", 19382),
    ("CMRM", "CMR INSTITUTE OF TECHNOLOGY (AUTONOMOUS)", "KANDLAKOYA, MDL", False, "CSD", "CSE (Data Science)", 32358),
    ("CMRM", "CMR INSTITUTE OF TECHNOLOGY (AUTONOMOUS)", "KANDLAKOYA, MDL", False, "CSE", "Computer Science and Engineering", 29020),
    ("CMRM", "CMR INSTITUTE OF TECHNOLOGY (AUTONOMOUS)", "KANDLAKOYA, MDL", False, "CSM", "CSE (AI and Machine Learning)", 29849),
    ("VJIT", "VIDYAJYOTHI INSTITUTE OF TECHNOLOGY (AUTONOMOUS)", "MOINABAD, RR", False, "CSD", "CSE (Data Science)", 23696),
    ("VJIT", "VIDYAJYOTHI INSTITUTE OF TECHNOLOGY (AUTONOMOUS)", "MOINABAD, RR", False, "CSE", "Computer Science and Engineering", 22117),
    ("VJIT", "VIDYAJYOTHI INSTITUTE OF TECHNOLOGY (AUTONOMOUS)", "MOINABAD, RR", False, "CSM", "CSE (AI and Machine Learning)", 22201),
    ("KMEC", "KESHAV MEMORIAL ENGINEERING COLLEGE", "KACHWANISINGA RAM, MDL", False, "CSE", "Computer Science and Engineering", 23563),
    ("KMEC", "KESHAV MEMORIAL ENGINEERING COLLEGE", "KACHWANISINGA RAM, MDL", False, "CSM", "CSE (AI and Machine Learning)", 23019),
    ("MECS", "MATRUSRI ENGINEERING COLLEGE (AUTONOMOUS)", "HYDERABAD, HYD", False, "CSD", "CSE (Data Science)", 23959),
    ("MECS", "MATRUSRI ENGINEERING COLLEGE (AUTONOMOUS)", "HYDERABAD, HYD", False, "CSE", "Computer Science and Engineering", 23089),
    ("MECS", "MATRUSRI ENGINEERING COLLEGE (AUTONOMOUS)", "HYDERABAD, HYD", False, "CSM", "CSE (AI and Machine Learning) - AIM", 24855),
    ("SNIS", "SRINIDHI INSTITUTE OF SCI AND TECHNOLOGY", "GHATKESAR, MDL", False, "CSC", "CSE (Cyber Security)", 14477),
    ("SNIS", "SRINIDHI INSTITUTE OF SCI AND TECHNOLOGY", "GHATKESAR, MDL", False, "CSD", "CSE (Data Science)", 14342),
    ("SNIS", "SRINIDHI INSTITUTE OF SCI AND TECHNOLOGY", "GHATKESAR, MDL", False, "CSE", "Computer Science and Engineering", 12585),
    ("SNIS", "SRINIDHI INSTITUTE OF SCI AND TECHNOLOGY", "GHATKESAR, MDL", False, "CSM", "CSE (AI and Machine Learning)", 13252),
    ("JNKR", "JNTUH UNIV COLLEGE OF ENGINEERING JAGITIAL (AUTONOMOUS)", "JAGITIAL, JTL", False, "CSE", "Computer Science and Engineering", 14989),
    ("MLRD", "MALLA REDDY COLLEGE OF ENGG TECHNOLOGY (AUTONOMOUS)", "MYSAMMAGUDA, MDL", False, "CSC", "CSE (Cyber Security)", 42380),
    ("MLRD", "MALLA REDDY COLLEGE OF ENGG TECHNOLOGY (AUTONOMOUS)", "MYSAMMAGUDA, MDL", False, "CSD", "CSE (Data Science)", 39835),
    ("MLRD", "MALLA REDDY COLLEGE OF ENGG TECHNOLOGY (AUTONOMOUS)", "MYSAMMAGUDA, MDL", False, "CSE", "Computer Science and Engineering", 35300),
    ("MLRD", "MALLA REDDY COLLEGE OF ENGG TECHNOLOGY (AUTONOMOUS)", "MYSAMMAGUDA, MDL", False, "CSM", "CSE (AI and Machine Learning)", 35540),
    ("VMEG", "VARDHAMAN COLLEGE OF ENGINEERING", "SHAMSHABAD, RR", False, "CSD", "CSE (Data Science)", 14084),
    ("VMEG", "VARDHAMAN COLLEGE OF ENGINEERING", "SHAMSHABAD, RR", False, "CSE", "Computer Science and Engineering", 11894),
    ("VMEG", "VARDHAMAN COLLEGE OF ENGINEERING", "SHAMSHABAD, RR", False, "CSM", "CSE (AI and Machine Learning)", 12702),
    ("GURU", "GURU NANAK INSTITUTIONS TECHNICAL CAMPUS (AUTONOMOUS)", "IBRAHIMPATAN, RR", False, "CSC", "CSE (Cyber Security)", 37378),
    ("GURU", "GURU NANAK INSTITUTIONS TECHNICAL CAMPUS (AUTONOMOUS)", "IBRAHIMPATAN, RR", False, "CSD", "CSE (Data Science)", 34319),
    ("GURU", "GURU NANAK INSTITUTIONS TECHNICAL CAMPUS (AUTONOMOUS)", "IBRAHIMPATAN, RR", False, "CSE", "Computer Science and Engineering", 27685),
    ("GURU", "GURU NANAK INSTITUTIONS TECHNICAL CAMPUS (AUTONOMOUS)", "IBRAHIMPATAN, RR", False, "CSM", "CSE (AI and Machine Learning)", 32686),
    ("GURU", "GURU NANAK INSTITUTIONS TECHNICAL CAMPUS (AUTONOMOUS)", "IBRAHIMPATAN, RR", False, "CSO", "CSE (IoT)", 49908),
    ("VBIT", "VIGNAN BHARATI INSTITUTE OF TECHNOLOGY (AUTONOMOUS)", "GHATKESAR, MDL", False, "CSB", "CSE (Business Systems)", 39889),
    ("VBIT", "VIGNAN BHARATI INSTITUTE OF TECHNOLOGY (AUTONOMOUS)", "GHATKESAR, MDL", False, "CSC", "CSE (Cyber Security)", 33409),
    ("VBIT", "VIGNAN BHARATI INSTITUTE OF TECHNOLOGY (AUTONOMOUS)", "GHATKESAR, MDL", False, "CSD", "CSE (Data Science)", 32365),
    ("VBIT", "VIGNAN BHARATI INSTITUTE OF TECHNOLOGY (AUTONOMOUS)", "GHATKESAR, MDL", False, "CSE", "Computer Science and Engineering", 28782),
    ("VBIT", "VIGNAN BHARATI INSTITUTE OF TECHNOLOGY (AUTONOMOUS)", "GHATKESAR, MDL", False, "CSM", "CSE (AI and Machine Learning)", 27812),
    ("JNTM", "JNTUH UNIV COLLEGE OF ENGINEERING MANTHANI", "MANTHANI, PDL", False, "CSE", "Computer Science and Engineering", 32451),
    ("JNTM", "JNTUH UNIV COLLEGE OF ENGINEERING MANTHANI", "MANTHANI, PDL", False, "CSM", "CSE (AI and Machine Learning)", 42930),
    ("KUWL", "KU COLLEGE OF ENGINEERING AND TECHNOLOGY", "WARANGAL, HNK", False, "CSD", "CSE (Data Science)", 29109),
    ("KUWL", "KU COLLEGE OF ENGINEERING AND TECHNOLOGY", "WARANGAL, HNK", False, "CSE", "Computer Science and Engineering", 20022),
    ("KITS", "KAKATIYA INSTITUTE OF TECHNOLOGY AND SCI", "WARANGAL, HNK", False, "CSD", "CSE (Data Science)", 31330),
    ("KITS", "KAKATIYA INSTITUTE OF TECHNOLOGY AND SCI", "WARANGAL, HNK", False, "CSE", "Computer Science and Engineering", 29673),
    ("KITS", "KAKATIYA INSTITUTE OF TECHNOLOGY AND SCI", "WARANGAL, HNK", False, "CSM", "CSE (AI and Machine Learning)", 24964),
    ("KITS", "KAKATIYA INSTITUTE OF TECHNOLOGY AND SCI", "WARANGAL, HNK", False, "CSN", "CSE (Networks)", 37374),
    ("KITS", "KAKATIYA INSTITUTE OF TECHNOLOGY AND SCI", "WARANGAL, HNK", False, "CSO", "CSE (IoT)", 35546),
    ("MRCE", "MALLA REDDY COLLEGE OF ENGINEERING", "MYSAMMAGUDA, MDL", False, "CSD", "CSE (Data Science)", 45966),
    ("MRCE", "MALLA REDDY COLLEGE OF ENGINEERING", "MYSAMMAGUDA, MDL", False, "CSE", "Computer Science and Engineering", 42073),
    ("MRCE", "MALLA REDDY COLLEGE OF ENGINEERING", "MYSAMMAGUDA, MDL", False, "CSM", "CSE (AI and Machine Learning)", 43500),
    ("CMRG", "CMR TECHNICAL CAMPUS (AUTONOMOUS)", "KANDLAKOYA, MDL", False, "CSD", "CSE (Data Science)", 38119),
    ("CMRG", "CMR TECHNICAL CAMPUS (AUTONOMOUS)", "KANDLAKOYA, MDL", False, "CSE", "Computer Science and Engineering", 34027),
    ("CMRG", "CMR TECHNICAL CAMPUS (AUTONOMOUS)", "KANDLAKOYA, MDL", False, "CSM", "CSE (AI and Machine Learning)", 35148),
    ("CMRN", "CMR ENGG COLLEGE (AUTONOMOUS)", "KANDLAKOYA, MDL", False, "CSD", "CSE (Data Science)", 42042),
    ("CMRN", "CMR ENGG COLLEGE (AUTONOMOUS)", "KANDLAKOYA, MDL", False, "CSE", "Computer Science and Engineering", 39848),
    ("CMRN", "CMR ENGG COLLEGE (AUTONOMOUS)", "KANDLAKOYA, MDL", False, "CSM", "CSE (AI and Machine Learning)", 36870),
    ("MLRS", "MARRI LAXMAN REDDY INST OF TECHNOLOGY AND MGMT (AUTONOMOUS)", "DUNDIGAL, MDL", False, "CSD", "CSE (Data Science)", 40880),
    ("MLRS", "MARRI LAXMAN REDDY INST OF TECHNOLOGY AND MGMT (AUTONOMOUS)", "DUNDIGAL, MDL", False, "CSE", "Computer Science and Engineering", 36445),
    ("MLRS", "MARRI LAXMAN REDDY INST OF TECHNOLOGY AND MGMT (AUTONOMOUS)", "DUNDIGAL, MDL", False, "CSM", "CSE (AI and Machine Learning)", 39674),
    ("JBIT", "J B INSTITUTE OF ENGG AND TECHNOLOGY", "YENKAPALLY, RR", False, "CSD", "CSE (Data Science)", 44874),
    ("JBIT", "J B INSTITUTE OF ENGG AND TECHNOLOGY", "YENKAPALLY, RR", False, "CSE", "Computer Science and Engineering", 47733),
    ("JBIT", "J B INSTITUTE OF ENGG AND TECHNOLOGY", "YENKAPALLY, RR", False, "CSM", "CSE (AI and Machine Learning)", 46738),
    ("SRHP", "SR UNIVERSITY (FORMERLY S R ENGINEERING COLLEGE)", "HASANPARTHY, HNK", False, "CSE", "Computer Science and Engineering", 24634),
    ("MREM", "MALLA REDDY ENGG COLLEGE AND MANAGEMENT SCIENCES (AUTONOMOUS)", "MEDCHAL, MDL", False, "CSD", "CSE (Data Science)", 56798),
    ("MREM", "MALLA REDDY ENGG COLLEGE AND MANAGEMENT SCIENCES (AUTONOMOUS)", "MEDCHAL, MDL", False, "CSE", "Computer Science and Engineering", 51323),
    ("MREM", "MALLA REDDY ENGG COLLEGE AND MANAGEMENT SCIENCES (AUTONOMOUS)", "MEDCHAL, MDL", False, "CSM", "CSE (AI and Machine Learning)", 54302),
    ("HITM", "HYDERABAD INST OF TECHNOLOGY AND MGMT (AUTONOMOUS)", "MEDCHAL, MDL", False, "CSD", "CSE (Data Science)", 43363),
    ("HITM", "HYDERABAD INST OF TECHNOLOGY AND MGMT (AUTONOMOUS)", "MEDCHAL, MDL", False, "CSE", "Computer Science and Engineering", 38378),
    ("HITM", "HYDERABAD INST OF TECHNOLOGY AND MGMT (AUTONOMOUS)", "MEDCHAL, MDL", False, "CSM", "CSE (AI and Machine Learning)", 38270),
    ("JOGI", "JOGINPALLY B R ENGINEERING COLLEGE (AUTONOMOUS)", "YENKAPALLY, RR", False, "CSD", "CSE (Data Science)", 78745),
    ("JOGI", "JOGINPALLY B R ENGINEERING COLLEGE (AUTONOMOUS)", "YENKAPALLY, RR", False, "CSE", "Computer Science and Engineering", 81253),
    ("JOGI", "JOGINPALLY B R ENGINEERING COLLEGE (AUTONOMOUS)", "YENKAPALLY, RR", False, "CSM", "CSE (AI and Machine Learning)", 88945),
    ("VGNT", "VIGNAN INSTITUTE OF TECHNOLOGY AND SCI (AUTONOMOUS)", "DESHMUKHI, YBG", False, "CSD", "CSE (Data Science)", 52333),
    ("VGNT", "VIGNAN INSTITUTE OF TECHNOLOGY AND SCI (AUTONOMOUS)", "DESHMUKHI, YBG", False, "CSE", "Computer Science and Engineering", 44321),
    ("VGNT", "VIGNAN INSTITUTE OF TECHNOLOGY AND SCI (AUTONOMOUS)", "DESHMUKHI, YBG", False, "CSM", "CSE (AI and Machine Learning)", 48552),
    ("KMCE", "KESHAV MEMORIAL COLLEGE OF ENGINEERING", "IBRAHIMPATAN, RR", False, "CSE", "Computer Science and Engineering", 27704),
    ("KMCE", "KESHAV MEMORIAL COLLEGE OF ENGINEERING", "IBRAHIMPATAN, RR", False, "CSM", "CSE (AI and Machine Learning)", 35788),
    ("INDI", "SRI INDU INSTITUTE OF ENGG AND TECHNOLOGY (AUTONOMOUS)", "IBRAHIMPATAN, RR", False, "CSD", "CSE (Data Science)", 64658),
    ("INDI", "SRI INDU INSTITUTE OF ENGG AND TECHNOLOGY (AUTONOMOUS)", "IBRAHIMPATAN, RR", False, "CSE", "Computer Science and Engineering", 62598),
    ("INDI", "SRI INDU INSTITUTE OF ENGG AND TECHNOLOGY (AUTONOMOUS)", "IBRAHIMPATAN, RR", False, "CSM", "CSE (AI and Machine Learning)", 59607),
    ("INDU", "SRI INDU COLLEGE OF ENGG AND TECHNOLOGY", "IBRAHIMPATAN, RR", False, "CSD", "CSE (Data Science)", 57300),
    ("INDU", "SRI INDU COLLEGE OF ENGG AND TECHNOLOGY", "IBRAHIMPATAN, RR", False, "CSE", "Computer Science and Engineering", 50797),
    ("INDU", "SRI INDU COLLEGE OF ENGG AND TECHNOLOGY", "IBRAHIMPATAN, RR", False, "CSM", "CSE (AI and Machine Learning)", 51716),
    ("AVNI", "AVN INST OF ENGG TECHNOLOGY (AUTONOMOUS)", "IBRAHIMPATAN, RR", False, "CSC", "CSE (Cyber Security)", 82613),
    ("AVNI", "AVN INST OF ENGG TECHNOLOGY (AUTONOMOUS)", "IBRAHIMPATAN, RR", False, "CSD", "CSE (Data Science)", 81703),
    ("AVNI", "AVN INST OF ENGG TECHNOLOGY (AUTONOMOUS)", "IBRAHIMPATAN, RR", False, "CSE", "Computer Science and Engineering", 70619),
    ("AVNI", "AVN INST OF ENGG TECHNOLOGY (AUTONOMOUS)", "IBRAHIMPATAN, RR", False, "CSM", "CSE (AI and Machine Learning)", 80858),
    ("TKEM", "TEEGALA KRISHNA REDDY ENGINEERING COLLEGE (AUTONOMOUS)", "MIRPET, RR", False, "CSD", "CSE (Data Science)", 60921),
    ("TKEM", "TEEGALA KRISHNA REDDY ENGINEERING COLLEGE (AUTONOMOUS)", "MIRPET, RR", False, "CSE", "Computer Science and Engineering", 60602),
    ("TKEM", "TEEGALA KRISHNA REDDY ENGINEERING COLLEGE (AUTONOMOUS)", "MIRPET, RR", False, "CSM", "CSE (AI and Machine Learning)", 58375),
    ("TKRC", "T K R COLLEGE OF ENGG AND TECHNOLOGY (AUTONOMOUS)", "MIRPET, RR", False, "CSD", "CSE (Data Science)", 52713),
    ("TKRC", "T K R COLLEGE OF ENGG AND TECHNOLOGY (AUTONOMOUS)", "MIRPET, RR", False, "CSE", "Computer Science and Engineering", 49552),
    ("TKRC", "T K R COLLEGE OF ENGG AND TECHNOLOGY (AUTONOMOUS)", "MIRPET, RR", False, "CSM", "CSE (AI and Machine Learning)", 50142),
    ("NNRG", "NALLA NARASIMHA REDDY EDNL SOC GRP OF INSTNS (AUTONOMOUS)", "GHATKESAR, MDL", False, "CSD", "CSE (Data Science)", 59978),
    ("NNRG", "NALLA NARASIMHA REDDY EDNL SOC GRP OF INSTNS (AUTONOMOUS)", "GHATKESAR, MDL", False, "CSE", "Computer Science and Engineering", 59101),
    ("NNRG", "NALLA NARASIMHA REDDY EDNL SOC GRP OF INSTNS (AUTONOMOUS)", "GHATKESAR, MDL", False, "CSM", "CSE (AI and Machine Learning)", 60491),
    ("SPEC", "ST PETERS ENGINEERING COLLEGE (AUTONOMOUS)", "MEDCHAL, MDL", False, "CSC", "CSE (Cyber Security)", 58173),
    ("SPEC", "ST PETERS ENGINEERING COLLEGE (AUTONOMOUS)", "MEDCHAL, MDL", False, "CSD", "CSE (Data Science)", 60651),
    ("SPEC", "ST PETERS ENGINEERING COLLEGE (AUTONOMOUS)", "MEDCHAL, MDL", False, "CSE", "Computer Science and Engineering", 56907),
    ("SPEC", "ST PETERS ENGINEERING COLLEGE (AUTONOMOUS)", "MEDCHAL, MDL", False, "CSM", "CSE (AI and Machine Learning)", 60582),
    ("NREC", "NALLAMALLA REDDY ENGINEERING COLLEGE (AUTONOMOUS)", "GHATKESAR, MDL", False, "CSE", "Computer Science and Engineering", 61280),
    ("NREC", "NALLAMALLA REDDY ENGINEERING COLLEGE (AUTONOMOUS)", "GHATKESAR, MDL", False, "CSM", "CSE (AI and Machine Learning)", 62453),
]

MY_RANK = 33000

# Sort: Women colleges first (by rank), then co-ed (by rank)
def sort_key(row):
    code, name, place, is_women, branch, branch_name, rank = row
    # Women first (0), coed second (1); within each group by rank
    return (0 if is_women else 1, rank)

sorted_data = sorted(RAW, key=sort_key)

# ── Build PDF ────────────────────────────────────────────────────────────────
# Save the PDF next to this script (works on any OS)
output_path = os.path.join(os.path.dirname(os.path.abspath(__file__)),
                           "TGEAPCET_2025_CSE_BCDGirls_Rank33000.pdf")

doc = SimpleDocTemplate(
    output_path,
    pagesize=landscape(A4),          # ← Landscape orientation
    leftMargin=1.2*cm, rightMargin=1.2*cm,
    topMargin=1.2*cm, bottomMargin=1.2*cm,
)

styles = getSampleStyleSheet()
title_style = ParagraphStyle('title', fontSize=14, fontName='Helvetica-Bold',
                              alignment=TA_CENTER, spaceAfter=4)
sub_style = ParagraphStyle('sub', fontSize=9, fontName='Helvetica',
                            alignment=TA_CENTER, spaceAfter=2, textColor=colors.HexColor("#444444"))
note_style = ParagraphStyle('note', fontSize=8, fontName='Helvetica',
                             alignment=TA_LEFT, spaceAfter=6, textColor=colors.HexColor("#555555"))

story = []

# Title
story.append(Paragraph("TGEAPCET 2025 – Second Phase", title_style))
story.append(Paragraph("College Options for BC_D Girls | Rank: 33,000 | CSE &amp; CSE Specializations", sub_style))
story.append(Paragraph("Sorted by preference: Women's Colleges first, then Co-ed. Within each group ordered by BC_D Girls Last Rank (ascending).", note_style))
story.append(Paragraph("✔ Highlighted rows = Last Rank ≥ Your Rank (safe zone) &nbsp;&nbsp; ✗ Rows without highlight = Last Rank &lt; Your Rank (competitive – apply if interested)", note_style))
story.append(Spacer(1, 6))

# Table header
header = ["#", "Inst Code", "College Name", "Place", "Branch", "BC_D Girls\nLast Rank", "Status"]

# Landscape A4 usable width ≈ 27.7 cm  (29.7 − 2×1.2 cm margins)
# Col widths: #, Code, College Name, Place, Branch, Last Rank, Status
col_widths = [0.7*cm, 1.8*cm, 9.5*cm, 3.5*cm, 4.8*cm, 2.0*cm, 2.0*cm]
# Total ≈ 24.3 cm  (fits comfortably with margins)

table_data = [header]

sno = 0
prev_type = None

for row in sorted_data:
    code, name, place, is_women, branch, branch_name, rank = row
    
    sno += 1
    status = "✔ Safe" if rank >= MY_RANK else "⚠ Tough"
    full_branch = f"{branch} – {branch_name}"
    
    table_data.append([
        str(sno),
        code,
        name,
        place,
        full_branch,
        f"{rank:,}",
        status,
    ])

table = Table(table_data, colWidths=col_widths, repeatRows=1)

# Build styles
ts = TableStyle([
    # Header
    ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor("#1a237e")),
    ('TEXTCOLOR', (0, 0), (-1, 0), colors.white),
    ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
    ('FONTSIZE', (0, 0), (-1, 0), 7.5),
    ('ALIGN', (0, 0), (-1, 0), 'CENTER'),
    ('VALIGN', (0, 0), (-1, 0), 'MIDDLE'),
    ('ROWBACKGROUND', (0, 0), (-1, 0), colors.HexColor("#1a237e")),
    
    # All cells
    ('FONTSIZE', (0, 1), (-1, -1), 7),
    ('FONTNAME', (0, 1), (-1, -1), 'Helvetica'),
    ('VALIGN', (0, 1), (-1, -1), 'MIDDLE'),
    ('GRID', (0, 0), (-1, -1), 0.3, colors.HexColor("#CCCCCC")),
    ('ALIGN', (0, 1), (1, -1), 'CENTER'),
    ('ALIGN', (5, 1), (6, -1), 'CENTER'),
    ('TOPPADDING', (0, 0), (-1, -1), 3),
    ('BOTTOMPADDING', (0, 0), (-1, -1), 3),
    ('LEFTPADDING', (0, 0), (-1, -1), 3),
    ('RIGHTPADDING', (0, 0), (-1, -1), 3),
])

# Color rows
PINK_WOMEN_SAFE   = colors.HexColor("#FCE4EC")   # women + safe
PINK_WOMEN_TOUGH  = colors.HexColor("#F8BBD0")   # women + tough (still show)
GREEN_COED_SAFE   = colors.HexColor("#E8F5E9")   # coed + safe
YELLOW_COED_TOUGH = colors.HexColor("#FFFDE7")   # coed + tough

sno_idx = 0
for i, row in enumerate(sorted_data, start=1):
    code, name, place, is_women, branch, branch_name, rank = row
    safe = rank >= MY_RANK
    if is_women:
        bg = PINK_WOMEN_SAFE if safe else PINK_WOMEN_TOUGH
    else:
        bg = GREEN_COED_SAFE if safe else YELLOW_COED_TOUGH
    ts.add('BACKGROUND', (0, i), (-1, i), bg)
    # Bold the status column
    if safe:
        ts.add('TEXTCOLOR', (6, i), (6, i), colors.HexColor("#1B5E20"))
        ts.add('FONTNAME', (6, i), (6, i), 'Helvetica-Bold')
    else:
        ts.add('TEXTCOLOR', (6, i), (6, i), colors.HexColor("#BF360C"))
        ts.add('FONTNAME', (6, i), (6, i), 'Helvetica-Bold')

table.setStyle(ts)
story.append(table)

# Legend
story.append(Spacer(1, 10))
legend_data = [
    ["Color Legend", "", "", ""],
    ["🌸 Light Pink", "Women's College – Last Rank ≥ 33,000 (Safe)",
     "💗 Dark Pink", "Women's College – Last Rank < 33,000 (Tough)"],
    ["🟢 Light Green", "Co-ed College – Last Rank ≥ 33,000 (Safe)",
     "🟡 Light Yellow", "Co-ed College – Last Rank < 33,000 (Tough)"],
]
leg_table = Table(legend_data, colWidths=[2.5*cm, 8*cm, 2.5*cm, 5.3*cm])
leg_table.setStyle(TableStyle([
    ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor("#37474F")),
    ('TEXTCOLOR', (0, 0), (-1, 0), colors.white),
    ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
    ('FONTSIZE', (0, 0), (-1, -1), 7),
    ('GRID', (0, 0), (-1, -1), 0.3, colors.grey),
    ('SPAN', (0, 0), (-1, 0)),
    ('ALIGN', (0, 0), (-1, 0), 'CENTER'),
    ('BACKGROUND', (0, 1), (1, 1), PINK_WOMEN_SAFE),
    ('BACKGROUND', (2, 1), (3, 1), PINK_WOMEN_TOUGH),
    ('BACKGROUND', (0, 2), (1, 2), GREEN_COED_SAFE),
    ('BACKGROUND', (2, 2), (3, 2), YELLOW_COED_TOUGH),
    ('TOPPADDING', (0, 0), (-1, -1), 3),
    ('BOTTOMPADDING', (0, 0), (-1, -1), 3),
]))
story.append(leg_table)

story.append(Spacer(1, 6))
story.append(Paragraph(
    "Note: Last Rank shown is the highest rank admitted in BC_D Girls category in the 2nd Phase of TGEAPCET 2025 counselling. "
    "A rank ≤ last rank means you have a good chance. Ranks from special/NCC/Sports quotas are excluded. "
    "Always verify with official TGCHE website before applying.",
    note_style
))

doc.build(story)
print(f"PDF saved to: {output_path}")
print(f"Total entries: {len(sorted_data)}")
women_count = sum(1 for r in sorted_data if r[3])
coed_count = len(sorted_data) - women_count
safe_count = sum(1 for r in sorted_data if r[6] >= MY_RANK)
print(f"Women's college entries: {women_count}")
print(f"Co-ed college entries: {coed_count}")
print(f"Safe entries (last rank >= 33000): {safe_count}")