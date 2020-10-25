const { getData, loadYaml } = require('./common')
const { uniqBy, prop, differenceWith } = require('ramda')
const SHARED_GROUP = 9999
const MAX_LINK = 6
const CLASS_SPLIT = '�'

function prepareRewards(rewards) {
  return rewards.filter(r => !!r['classes'] && !r['rarity'])
    .map(r => {
      r['classes'] = r['classes'].split(CLASS_SPLIT)
      return r
    })
}

function buildGemData() {
  const questRewards = prepareRewards(getData('quest-rewards'))
  const vendorRewards = prepareRewards(getData('vendor-rewards'))
  const gemsData = getData('gems')

  return Object.values(gemsData).map(gemData => {
    const baseItem = gemData['base_item']

    if (!baseItem) {
      return undefined
    }

    const displayName = baseItem['display_name']

    if (!displayName) {
      return undefined
    }

    const stats = gemData['per_level']['1']

    if (!stats) {
      return undefined
    }

    const tags = gemData['tags']

    let primary_attribute = ''

    if (tags.includes("intelligence")) {
      primary_attribute = 'intelligence'
    } else if (tags.includes("dexterity")) {
      primary_attribute = 'dexterity'
    } else if (tags.includes("strength")) {
      primary_attribute = 'strength'
    }

    const gem = {}
    gem['name'] = displayName
    gem['primary_attr'] = primary_attribute
    gem['required_level'] = stats['required_level']
    gem['quest_rewards'] = []
    gem['vendor_rewards'] = []

    for (const reward of questRewards) {
      if (!gem['name'].toLowerCase().startsWith(reward['reward'].toLowerCase())) {
        continue
      }

      gem['quest_rewards'].push(reward)
      break
    }

    for (const reward of vendorRewards) {
      if (!gem['name'].toLowerCase().startsWith(reward['reward'].toLowerCase())) {
        continue
      }

      gem['vendor_rewards'].push(reward)
      break
    }

    return gem
  }).filter(g => !!g)
}

function getColor(gem) {
  const stat = gem['primary_attr']

  if (stat === "intelligence") {
    return '#005DC2'
  }

  if (stat === "dexterity") {
    return '#17B529'
  }

  if (stat === "strength") {
    return '#E82A1F'
  }

  return '#FFFFFF'
}

function getLevelReq(gem) {
  return gem['required_level']
}

function getReward(gem, clazz) {
  let reward = gem['quest_rewards'].find(r => r.classes.includes(clazz))

  if (!reward) {
    reward = gem['vendor_rewards'].find(r => r.classes.includes(clazz))
  }

  if (reward) {

    return {
      act: reward['act'],
      npc: reward['npc'],
      quest: reward['quest']
    }
  }

  return {
    act: 6,
    npc: "Lilly",
    quest: "Fallen from Grace"
  }
}

function findGem(name, gems, clazz) {
  for (const gem of gems) {
    const gemName = gem['name']

    if (gemName.toLowerCase().startsWith(name.toLowerCase())) {
      const output = {
        name: gemName,
        color: getColor(gem),
        level: getLevelReq(gem),
        reward: getReward(gem, clazz)
      }

      console.warn(output)
      return output
    }
  }

  console.warn(`Failed to find skill ${name}`)
  return undefined
}

function createSkill(skill, gems, clazz) {
  const gem = findGem(skill['name'], gems, clazz)

  if (!gem) {
    return gem
  }

  gem['group'] = skill['group'] || SHARED_GROUP
  gem['join'] = skill['join'] === undefined ? true : skill['join']
  gem['supports'] = (skill['supports'] || []).map(s => findGem(s, gems, clazz)).filter(e => !!e)
  return gem
}

function groupSkills(skills, groups, parent, parentSkills) {
  groups = groups || {}

  if (!skills) {
    return groups
  }

  for (const skill of skills) {
    const groupLevel = skill['level']

    if (!(groupLevel in groups)) {
      groups[groupLevel] = []
    }

    const entry = {
      name: skill['name'],
      color: skill['color'],
      reward: skill['reward'],
      group: parent ? parent['group'] : skill['group'],
      join: parent ? parent['join'] : skill['join'],
      parent: parent && parent['name'],
      order: parent ? parentSkills.indexOf(parent) + skills.indexOf(skill) : skills.indexOf(skill)
    }

    groups[groupLevel].push(entry)
    groupSkills(skill['supports'], groups, skill, skills)
  }

  return groups
}

function groupGroups(groups) {
  const groupedGroups = {}

  for (const [level, group] of Object.entries(groups)) {
    if (!(level in groupedGroups)) {
      groupedGroups[level] = {}
    }

    for (const groupEntry of group) {
      if (!(groupEntry['group'] in groupedGroups[level])) {
        groupedGroups[level][groupEntry['group']] = []
      }

      groupedGroups[level][groupEntry['group']].push({
        ...groupEntry
      })
    }

    for (const [level2, group2] of Object.entries(groups)) {
      if (parseInt(level) <= parseInt(level2)) {
        continue
      }

      for (const groupEntry2 of group2) {
        if (!(groupEntry2['group'] in groupedGroups[level])) {
          groupedGroups[level][groupEntry2['group']] = []
        }

        const currentGroupEntry = groupedGroups[level][groupEntry2['group']]
        const existing = currentGroupEntry.find(e => e.name === groupEntry2.name && e.parent === groupEntry2.parent)

        if (!existing) {
          currentGroupEntry.push({
            ...groupEntry2
          })
        }
      }
    }
  }

  const foundGroups = new Set()

  for (const [level, group] of Object.entries(groupedGroups)) {
    for (const groupGroup of Object.values(group)) {
      groupGroup.sort((a, b) => a.order - b.order)
      groupGroup.sort((a, b) => a.parent && b.parent ? a.parent.localeCompare(b.parent) : a.parent ? 1 : b.parent ? - 1 : 0)

      let toDelete = []
      for (const groupEntry of groupGroup) {
        if (groupEntry.parent && (!groupGroup.find(e => e.name === groupEntry.parent) || toDelete.find(e => e.name === groupEntry.parent))) {
          toDelete.push(groupEntry)
        }

        if (!groupEntry.join && !groupEntry.parent) {
          toDelete = toDelete.concat(groupGroup.filter(e => !e.parent && e !== groupEntry && e.order < groupEntry.order))
        }
      }

      for (const groupEntry of toDelete) {
        groupGroup.splice(groupGroup.indexOf(groupEntry), 1)
      }
    }

    for (const [level2, group2] of Object.entries(groupedGroups).reverse()) {
      if (parseInt(level) <= parseInt(level2)) {
        continue
      }

      let found = false

      for (const [groupGroup2Name, groupGroup2] of Object.entries(group2)) {
        const groupGroup = group[groupGroup2Name]
        const diff = differenceWith((a, b) => a.name === b.name, groupGroup, groupGroup2)
        diff.forEach(e => e.changed = true)
        found = true

        if (!foundGroups.has(groupGroup2Name)) {
          groupGroup2.forEach(e => e.changed = true)
        }

        foundGroups.add(groupGroup2Name)
      }

      if (found) {
        break
      }
    }
  }

  return groupedGroups
}

function printOutput(groups) {
  for (const [level, group] of Object.entries(groups)) {
    const anyChanged = Object.values(group).flat().find(s => s.changed)

    if (!anyChanged) {
      continue
    }

    console.log("")
    console.log(`[b]Level ${level}[/b]`)

    for (const [groupName, skillGroup] of Object.entries(group)) {
      const formattedSkills = uniqBy(prop('name'), skillGroup).slice(0, MAX_LINK).map(s => {
        let output = `[span color="${s.color}"]`
        if (s.changed) output += '[i]'
        output += s.name
        if (s.changed) output += '[/i]'
        output += '[/span]'
        if (s.changed) output += ` (A${s.reward.act} ${s.reward.quest})`
        return output
      })

      if (formattedSkills.length === 0) {
        continue
      }

      if (parseInt(groupName) === SHARED_GROUP || !skillGroup.find(s => s.parent)) {
        formattedSkills.forEach(s => console.log(`[u]1 link[/u] - ${s}`))
      } else {
        console.log(`[u]${formattedSkills.length} link[/u] - ${formattedSkills.join('\n    ')}`)
      }
    }
  }
}

function run(input) {
  const gems = buildGemData()
  const data = loadYaml(input)
  const skills = data['skills'].map(s => createSkill(s, gems, data['class'])).filter(e => !!e)
  const groups = groupSkills(skills)
  const groupedGroups = groupGroups(groups)
  printOutput(groupedGroups)
}

run(process.argv.slice(2).shift())