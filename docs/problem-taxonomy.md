# `cf_problem` Taxonomy Consolidation — DRAFT for review

Goal: collapse the current ~80 free-form `cf_problem` values into ~23 clean,
mutually-exclusive categories that map to how CS actually works. This is the
foundation for AI auto-classification (Phase 1+).

Source data: 2,500 most-recent tickets (department-wide), tallied 2026-06-17.
~80 distinct values, 13.7% untagged.

Legend:
- 🚫 **NOISE** — non-work; candidate for auto-suppress / auto-close (~27% of volume)
- ➡️ **ROUTE-OUT** — not really CS support work; should be handed to Sales/Onboarding
- ⭐ **HIGH VOLUME** — top categories, prioritize for accuracy + draft replies

---

## Target taxonomy (23 categories)

### Noise (auto-suppress candidates)
| New category | Folds in (raw values) | ~Share |
|---|---|---|
| 🚫 Spam | Spam | 14.0% |
| 🚫 Duplicate | Duplicate Ticket | 10.4% |
| 🚫 Test / Internal | CS/Product Test, TEST, `-None-`, Already solved by park | ~3.6% |

### Education
| New category | Folds in | ~Share |
|---|---|---|
| ⭐ Training / How-To | Training/Feature Questions | 17.6% |

### Account & subscription
| New category | Folds in | ~Share |
|---|---|---|
| ⭐ Subscription & Plan Change | Saas Subscription - update, Contract Update, Pause RoverPass Account, Ownership Change | ~8.1% |
| Account Cancellation & Churn | Cancel RoverPass Account, Churn - Exit Interview/HS Fields Update, Unhappy with contract terms | ~0.6% |
| User & Access Management | Add/update user, Password Reset, Passwords/Codes/W9 doc status | ~2.2% |

### Listing & content
| New category | Folds in | ~Share |
|---|---|---|
| Listing & Rate Updates | Rate/Site/Details Update, Update Listing, Add New Campground Listing, Product/General Store Update, Update availability (Blackout dates/external Reservations) | ~4.9% |
| Map Revisions | Extra Map Revisions, Add a map | ~0.9% |

### Billing & payments
| New category | Folds in | ~Share |
|---|---|---|
| ⭐ Refunds | Cancellation/Refund, Platform Fee Refund | ~5.1% |
| Payments & Payouts | Payout Update/Issue, Failed Payment, Duplicate Charge, Collections - Finance | ~3.6% |
| Billing, Invoices & Fees | Invoice issue, Invoice Response, Fee Question, Platform Fee Complaint, Marketplace Fee Question, Tax Information | ~1.9% |
| Stripe Disputes & Verification | Stripe Dispute, Stripe verification, Reject Stripe Account | ~4.0% |

### Reservations
| New category | Folds in | ~Share |
|---|---|---|
| Reservation Changes | Reservation Adjustment, Edit Camper Info | ~4.9% |
| Booking Problems & Camper Inquiries | Camper Cannot Complete Reservation, Camper - General Inquiry (should have gone to campground), Trip Insurance Question/Cancellation | ~2.3% |

### Channel management
| New category | Folds in | ~Share |
|---|---|---|
| Channel Management | Channel Management Inquiry, Channel Management Issue, Rate/Availability Update RP and Channex | ~1.8% |

### Technical
| New category | Folds in | ~Share |
|---|---|---|
| Bug / Dev Issue | Bug, Edits-Requiring-Dev, Email Notification Issue | ~3.8% |
| Reports & Waivers | Reports Issue, Customized Reporting, Waivers | ~0.8% |

### Growth (route out of support)
| New category | Folds in | ~Share |
|---|---|---|
| ➡️ Sales Lead | Potential Lead, Sales Lead that wants Support, Lead that wants support, Button Recovery Call | ~0.8% |
| ➡️ Upsell & Feature Request | Upsell Oportunity, New Feature Outreach, RRS-CRS Upsell, Marketing, Product Feature Desired | ~1.8% |

### Onboarding & retention
| New category | Folds in | ~Share |
|---|---|---|
| ➡️ Onboarding In-Progress | Park still in OB, Call Answered by OB, Welcome Packet | ~0.9% |
| Retention & Follow-Up | At Risk Check In, Review Complaint, Account Check in, Missed Phone Call Follow-Up Email, Training Call Follow-Up Email | ~3.5% |

### Catch-all
| New category | Folds in | ~Share |
|---|---|---|
| Other / Product Inquiry | Other, chatbot ticket, Survey, Domain Renewal, CRS Inquiry, RRS Inquiry, Ticketing Inquiry, Marketplace Listing Check, Marketplace Deactivation | ~2.6% |

---

## Open decisions (need your domain input)

1. **Stripe Disputes — keep separate?** Centcom already runs dispute-deadline
   alerts. Keeping "Stripe Disputes" as its own category preserves that signal.
   Kept separate here. Confirm.
2. **Route-out categories (Sales / Onboarding / Upsell):** should these stay in
   `cf_problem` at all, or become a "misrouted → reassign" action instead of a
   support tag? Currently kept as tags so the classifier can flag them.
3. **Refunds vs Payments split:** kept "Refunds" separate from "Payments &
   Payouts" because refund handling is a distinct CS workflow. OK?
4. **Reports & Waivers** is a thin, mixed bucket (~0.8%). Fold into "Bug / Dev
   Issue" instead? Flagged as the weakest grouping.
5. **Retention & Follow-Up** mixes proactive check-ins with follow-up emails.
   Split into two, or keep together?
6. Any category here that you'd rename to match internal CS vocabulary?
