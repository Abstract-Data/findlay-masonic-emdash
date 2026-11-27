# Officer titles

**DRAFT — awaiting lodge confirmation (Q9).**

Approved by: _not yet_ (T1.2 records the approver and date here).

These lists are the standard officer lines for each body type, in conventional order. The number is the display order. They come from general Masonic usage, not from the lodge, so Ohio usage may differ. A † marks a title we are unsure of, with the alternatives the lodge should choose between.

The same lists live in code at `src/lib/core/acl/officer-titles.ts` (`TITLES_BY_BODY_TYPE`). The seed's `officers.title` options are the de-duplicated union of all six lists, and `tests/unit/seed.test.ts` fails if the two drift. When the lodge changes a list, change the code table and the seed options together.

The body type names are the `bodies.body_type` options as editors see them.

## Blue Lodge

1. Worshipful Master
2. Senior Warden
3. Junior Warden
4. Treasurer
5. Secretary
6. Senior Deacon
7. Junior Deacon
8. Senior Steward
9. Junior Steward
10. Chaplain †
11. Tyler † (Ohio may spell it "Tiler")

Possible extras to confirm: Marshal, Musician or Organist, Trustee.

## Chapter (Royal Arch Masons)

1. High Priest † (Ohio may say "Excellent High Priest")
2. King
3. Scribe
4. Treasurer
5. Secretary
6. Chaplain
7. Captain of the Host
8. Principal Sojourner
9. Royal Arch Captain
10. Master of the Third Veil
11. Master of the Second Veil
12. Master of the First Veil
13. Sentinel † (or "Guard")

## Council (Cryptic Masons)

1. Illustrious Master † (or "Thrice Illustrious Master")
2. Deputy Master
3. Principal Conductor of the Work
4. Treasurer
5. Recorder
6. Chaplain
7. Captain of the Guard
8. Conductor of the Council
9. Steward
10. Sentinel

## Commandery (Knights Templar)

1. Eminent Commander
2. Generalissimo
3. Captain General
4. Prelate
5. Senior Warden
6. Junior Warden
7. Treasurer
8. Recorder
9. Standard Bearer
10. Sword Bearer
11. Warder
12. Sentinel

## Order of the Eastern Star

1. Worthy Matron
2. Worthy Patron
3. Associate Matron
4. Associate Patron
5. Secretary
6. Treasurer
7. Conductress
8. Associate Conductress
9. Chaplain
10. Marshal
11. Organist
12. Adah
13. Ruth
14. Esther
15. Martha
16. Electa
17. Warder
18. Sentinel

## Temple Board †

1. President
2. Vice President
3. Secretary
4. Treasurer
5. Trustee

To confirm: whether board members are Trustees or Directors, and whether a Building Manager is listed.
