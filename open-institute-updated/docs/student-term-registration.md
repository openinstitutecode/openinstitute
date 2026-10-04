# Student term registration and fees

## Configure a term

In **Admin portal → Term Setup & Management** (available from the Admin/Registrar dashboard), create a term for each programme. Creating it with **Create and set current term** activates it immediately for student registration:

- Set start and end dates to exactly 56 calendar days, counting both dates.
- Set the registration window and assessment dates.
- Set the maximum workload from 24 to 36 credits.
- Set the per-credit rate from KES 300 to KES 500.
- Activate the term when it is ready for student registration.

Each term charges a KES 1,000 administration fee. Add any industrial or
attachment charge for the programme and term under **Admin portal → Fee
Structure** as a fee item whose name contains “industrial”. The amount of each
matching item is added separately to the term invoice. Do not add tuition or
the administration fee to this fee structure; those are calculated from the
term configuration.

## Set course credits

In **Admin portal → Curriculum**, set each unit's credit value when creating
or editing it. In **Admin portal → Courses & Trainers**, set an optional course
credit value while creating or editing a course. A course-specific value
overrides the linked unit's credits; leaving it blank uses the unit value.
Course credits must be between 1 and 36.

## Student registration and billing

Students open **Student portal → Course Catalogue**, select courses and/or
standalone units, and submit a term workload of at least 8 credits without
exceeding the configured maximum. The page previews the tuition, fixed term
fee, industrial fee, and total before submission.

The registration and one invoice per student/term are saved in a database
transaction. The invoice contains separate tuition line items per selected
unit/course, the term administration fee, and each configured industrial fee.
Registering for additional units updates that same term invoice rather than
adding the term fee a second time. Students can review the invoice and pay it
from **Student portal → Fees**.

When a configured prior term has ended, an unpaid balance on its term invoice
blocks registration into a later term. Paying the prior invoice removes that
block. The balance does not prevent a student from continuing registration
within the still-open term.

The database migration is applied by the backend's normal Prisma deployment
migration step; do not run `prisma db push` against production.
