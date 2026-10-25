# 16: Uploads from a Room

**What to build:** Dropping a file into a Room shows "Uploads aren't supported in rooms yet" with an **Upload to Are.na instead** button that uploads the file into the origin channel with the user's token and adds the resulting block to the Room as a **copied block** where it was dropped.

**Blocked by:** 06

**Status:** ready-for-agent

- [ ] Default: drop is refused with the message
- [ ] Button uploads into the origin channel and inserts a copied block (numeric Are.na id) at the drop point, visible to all collaborators
- [ ] Button disabled with a reason when not logged in or without write access to the origin channel
