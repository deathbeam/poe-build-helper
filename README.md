# poe-build-helper ![CI](https://github.com/deathbeam/poe-build-helper/workflows/CI/badge.svg)

Utilities for making PoE builds

# prerequisities

* get node.js
* run `npm install` in cloned repo

# gem-progression.js

Usage: `node lib/gem-progression.js --help`

# Fetch new data

Gems:

```bash
curl
'https://www.poewiki.net/w/api.php?action=cargoquery&tables=items,skill_gems&join_on=items.name=skill_gems._pageName&fields=items.name,items.required_level,skill_gems.primary_attribute&where=class_id=%22Active%20Skill%20Gem%22&limit=10000&offset=0&format=json'
| jq . -
```

Quest rewards:

```
https://www.poewiki.net/wiki/Module:Quest_reward/data/quest_rewards
```

Vendor rewards:

```
https://www.poewiki.net/wiki/Module:Quest_reward/data/vendor_rewards
```
