# Financial model (working estimates, not audited)

These are planning-level estimates in KES to size the platform and staffing
decision, not a finance department's budget. Validate against actual vendor
quotes and payroll figures before using this for real fundraising or
regulatory submissions.

## Startup costs (one-time)

| Item | Low estimate | Notes |
|---|---|---|
| TVETA/legal/regulatory application fees | 150,000 | Varies by category; confirm with TVETA |
| Cloud infrastructure setup | 100,000 | Initial VM/DB/storage provisioning |
| LMS/SIS/platform development | 800,000–2,500,000 | Wide range depending on in-house vs. contracted |
| Initial content development (4 programmes) | 400,000 | Trainer time to author Modules 1 for each unit |
| E-library initial licensing/OER curation | 100,000 | Prioritise open educational resources first |
| Cybersecurity baseline (WAF, backups, audits) | 150,000 | |
| Branding, website copy, initial marketing | 150,000 | |
| **Total (low end)** | **≈ 1,850,000** | |

## Monthly operating costs at different scales

| Students | Trainers (FTE) | Admin staff | Cloud + AI API | SMS/Email | Total monthly (approx.) | Cost/student |
|---|---|---|---|---|---|---|
| 100 | 2 | 3 | 15,000 | 5,000 | 380,000 | 3,800 |
| 500 | 6 | 5 | 40,000 | 15,000 | 950,000 | 1,900 |
| 1,000 | 10 | 8 | 70,000 | 25,000 | 1,650,000 | 1,650 |
| 5,000 | 35 | 20 | 250,000 | 90,000 | 6,500,000 | 1,300 |
| 10,000 | 60 | 30 | 450,000 | 160,000 | 11,800,000 | 1,180 |
| 50,000 | 250 | 90 | 1,800,000 | 700,000 | 52,000,000 | 1,040 |

Assumptions: trainer-to-student ratio roughly 1:80–100 with AI-assisted
formative support; admin staff scale sub-linearly; cloud costs assume
managed Postgres + object storage + a mid-tier AI API budget. These ratios
must be checked against whatever ratio TVETA actually mandates once
confirmed — see `regulatory-notes.md`.

## Break-even sketch

If tuition averages KES 8,000/month/student blended across certificate and
diploma programmes:

- 500 students × 8,000 = 4,000,000/month revenue vs. ≈950,000 cost →
  comfortably profitable at this scale, before accounting for bad debt and
  scholarship commitments.
- Break-even is likely well under 100 students once fixed platform costs are
  amortised, provided trainer cost scales with enrollment as modelled above.

Marginal cost per additional student drops from ~3,800 to ~1,040 as fixed
platform/admin costs are spread across more learners — the core economic
argument for the virtual model, provided quality doesn't degrade with scale.
