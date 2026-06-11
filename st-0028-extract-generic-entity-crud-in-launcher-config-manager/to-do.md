# Extract generic entity CRUD in launcher config manager

## Problem

src/server/launcher/launcher-config.ts (599 lines) handles 4 entity types (templates, skills, profiles, shortcuts) in one class. Lines 281-580 are the same add/remove/update triple copy-pasted 4 times, including 4 copies of the "name already exists" check and the "not found" check.

The rename-cascade into columnDefaults is similar but NOT identical across types:

- template: renames the nullable cd.templateName field
- profile: renames the nullable cd.profileName field
- skill: rewrites two arrays (cd.checkedSkills, cd.skillOrder)
- shortcut: no cascade at all

Skill also has extra order handling: setSkillOrder, and order preservation in updateSkill.

## Goal

One generic CRUD implementation parameterized by an entity descriptor, plus 4 plain descriptor objects. Cuts ~150 lines of duplication and makes each entity's behavior independently testable.

Per CLAUDE.md: descriptors are data, the generic CRUD is behavior -- keep them separate. Do NOT create one class per entity; 4 descriptor objects + 1 generic implementation is enough.

## To do

- Define an entity descriptor type: { configKey, fields, onRemove?(columnDefaults, name), onRename?(columnDefaults, oldName, newName) } with cascade callbacks.
- Implement generic add/remove/update on top of withConfig: shared duplicate-name check, shared not-found check, then descriptor cascades.
- Write the 4 descriptors (template, skill, profile, shortcut) with their specific cascades; shortcut has none.
- Keep skill specifics (setSkillOrder, order preservation in update) as explicit skill-only code, not forced into the generic shape.
- Public API of LauncherConfigManager stays unchanged (addTemplate, updateSkill, etc. delegate to the generic implementation) so routes and launcher-config-routes.ts itemRoutes() keep working.
- Existing tests in launcher-config.test.ts must pass unchanged.

## Related

- ST-0025 (unify config persistence) covers the file IO / merge side of the same module. Independent; this ticket only targets the CRUD duplication.
